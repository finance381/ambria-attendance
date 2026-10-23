// ─────────────────────────────────────────────────────────────────────────────
// MonthlyReport.jsx — Admin "Monthly Report" page.
// Per-employee attendance summary for a chosen month (present / half / absent /
// incomplete days, hours, claims, leave deductions, continue credits) used for
// payroll. Supports department + search filters, sortable columns, row
// selection, a day-wise drill-down modal (with DOCX export), and a multi-month
// export to Word (.docx) or Excel (.xlsx).
// Phones (< md): stacked toolbar, compact cards, table scrolls inside its card
// with a sticky Employee column, and the modals open as full-width sheets.
// ─────────────────────────────────────────────────────────────────────────────
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { Document, Packer, Paragraph, Table, TableRow, TableCell, TextRun, AlignmentType, HeadingLevel, WidthType, BorderStyle, ShadingType, PageOrientation } from 'docx'
import * as XLSX from 'xlsx'
import DeptPicker from '../../components/DeptPicker'


var MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']

// Filter toolbar field style + labelled wrapper (matches DailyAttendance)
// Phone-only sticky first columns of the report table (released at md)
var STICKY_CHECK = 'sticky left-0 z-10 md:static md:z-auto'
var STICKY_EMP = 'sticky left-10 z-10 shadow-[4px_0_6px_-4px_rgba(15,23,42,0.18)] md:static md:z-auto md:shadow-none'

var FIELD = 'h-10 px-3 border border-gray-200 rounded-xl bg-white text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent'

function FilterField({ label, grow, span, children }) {
  return (
    <div className={(grow ? 'flex-1 min-w-48' : '') + (span ? ' col-span-2' : '')}>
      <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1 px-0.5">{label}</label>
      {children}
    </div>
  )
}

export default function MonthlyReport() {
  var now = new Date()
  var [year, setYear] = useState(now.getFullYear())
  var [month, setMonth] = useState(now.getMonth() + 1)
  var [deptFilter, setDeptFilter] = useState('')
  var [search, setSearch] = useState('')
  var [records, setRecords] = useState([])
  var [departments, setDepartments] = useState([])
  var [loading, setLoading] = useState(true)
  var [toast, setToast] = useState('')
  var [showExport, setShowExport] = useState(false)
  var [exportFromYear, setExportFromYear] = useState(now.getFullYear())
  var [exportFromMonth, setExportFromMonth] = useState(now.getMonth() + 1)
  var [exportToYear, setExportToYear] = useState(now.getFullYear())
  var [exportToMonth, setExportToMonth] = useState(now.getMonth() + 1)
  var [exporting, setExporting] = useState(false)
  var [exportFormat, setExportFormat] = useState('docx')
  var [sortCol, setSortCol] = useState('name')
  var [sortDir, setSortDir] = useState('asc')
  var [selected, setSelected] = useState([])
  var [drillEmp, setDrillEmp] = useState(null)
  var [drillData, setDrillData] = useState([])
  var [drillLoading, setDrillLoading] = useState(false)
  var showToast = useCallback(function (msg) {
    setToast(msg)
    setTimeout(function () { setToast('') }, 2500)
  }, [])

  var loadData = useCallback(async function () {
    setLoading(true)
    var [summaryRes, deptRes, leaveRes] = await Promise.all([
      (function () {
        var s = year + '-' + String(month).padStart(2, '0') + '-01'
        var ed = new Date(year, month, 0).getDate()
        var e = year + '-' + String(month).padStart(2, '0') + '-' + String(ed).padStart(2, '0')
        return supabase.rpc('monthly_summary_range', {
          p_from_date: s, p_to_date: e,
          p_department_id: deptFilter ? Number(deptFilter) : null
        })
      })(),
      supabase.from('departments').select('id, name').eq('active', true).order('name'),
      supabase.rpc('admin_all_leave_balances')
    ])

    // Merge deductions from leave balance into records
    var leaveMap = {}
    if (leaveRes.data && leaveRes.data.balances) {
      leaveRes.data.balances.forEach(function (b) { leaveMap[b.employee_id] = b })
    }
    var recs = (summaryRes.data || []).map(function (r) {
      var lb = leaveMap[r.employee_id]
      return Object.assign({}, r, { deductions: lb ? (lb.deductions || 0) : 0 })
    })
    setRecords(recs)
    setDepartments(deptRes.data || [])
    setSelected([])
    setLoading(false)
  }, [year, month, deptFilter])

  useEffect(function () { loadData() }, [loadData])

  // Filter
  var filtered = records.filter(function (r) {
    if (search) {
      var q = search.toLowerCase()
      if (!r.name.toLowerCase().includes(q) && !r.emp_code.toLowerCase().includes(q)) return false
    }
    return true
  })

  // Sort
  filtered.sort(function (a, b) {
    var va, vb
    switch (sortCol) {
      case 'emp_code': va = a.emp_code; vb = b.emp_code; break
      case 'name': va = a.name; vb = b.name; break
      case 'department_name': va = a.department_name || ''; vb = b.department_name || ''; break
      case 'effective_days': va = a.effective_days; vb = b.effective_days; break
      case 'days_present': va = a.days_present || 0; vb = b.days_present || 0; break
      case 'days_half': va = a.days_half || 0; vb = b.days_half || 0; break
      case 'days_absent': va = a.days_absent || 0; vb = b.days_absent || 0; break
      case 'days_incomplete': va = a.days_incomplete || 0; vb = b.days_incomplete || 0; break
      case 'total_hours': va = a.total_hours || 0; vb = b.total_hours || 0; break
      case 'claims_used': va = a.claims_used || 0; vb = b.claims_used || 0; break
      case 'continue_credits': va = a.continue_credits || 0; vb = b.continue_credits || 0; break
      case 'deductions': va = a.deductions || 0; vb = b.deductions || 0; break
      default: va = a.name; vb = b.name
    }
    if (typeof va === 'string') {
      var cmp = va.localeCompare(vb)
      return sortDir === 'asc' ? cmp : -cmp
    }
    return sortDir === 'asc' ? va - vb : vb - va
  })

  // Totals
  var totals = { effective: 0, present: 0, half: 0, absent: 0, incomplete: 0, hours: 0, claims: 0, continue: 0 }
  filtered.forEach(function (r) {
    totals.effective += r.effective_days
    totals.present += r.days_present
    totals.half += r.days_half
    totals.absent += r.days_absent
    totals.incomplete += r.days_incomplete
    totals.hours += r.total_hours
    totals.claims += (r.claims_used || 0)
    totals.continue += (r.continue_credits || 0)
  })

  // Casual incomplete count
  var casualIncompleteCount = filtered.filter(function (r) {
    return r.is_casual && r.days_incomplete > 0
  }).length

  function handleSort(col) {
    if (sortCol === col) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc')
    } else {
      setSortCol(col)
      setSortDir('asc')
    }
  }

  var allIds = filtered.map(function (r) { return r.employee_id })
  var allSelected = filtered.length > 0 && selected.length === filtered.length && allIds.every(function (id) { return selected.includes(id) })

  function toggleOne(id) {
    setSelected(function (prev) {
      return prev.includes(id) ? prev.filter(function (x) { return x !== id }) : prev.concat(id)
    })
  }

  function toggleAll() {
    if (allSelected) {
      setSelected([])
    } else {
      setSelected(allIds)
    }
  }

  async function openDrill(emp) {
    setDrillEmp(emp)
    setDrillLoading(true)
    var daysInMonth = new Date(year, month, 0).getDate()
    var startDate = year + '-' + String(month).padStart(2, '0') + '-01'
    var endDate = year + '-' + String(month).padStart(2, '0') + '-' + String(daysInMonth).padStart(2, '0')

    var { data } = await supabase
      .from('punches')
      .select('attendance_date, punch_type, punched_at, location_name')
      .eq('employee_id', emp.employee_id)
      .gte('attendance_date', startDate)
      .lte('attendance_date', endDate)
      .order('attendance_date')
      .order('punched_at')

    // Group by date
    var byDate = {}
    ;(data || []).forEach(function (p) {
      if (!byDate[p.attendance_date]) byDate[p.attendance_date] = { ins: [], outs: [], inLocs: [], outLocs: [] }
      if (p.punch_type === 'in') {
        byDate[p.attendance_date].ins.push(p.punched_at)
        byDate[p.attendance_date].inLocs.push(p.location_name || null)
      } else {
        byDate[p.attendance_date].outs.push(p.punched_at)
        byDate[p.attendance_date].outLocs.push(p.location_name || null)
      }
    })

    // Build all days
    var rows = []
    for (var d = 1; d <= daysInMonth; d++) {
      var dateStr = year + '-' + String(month).padStart(2, '0') + '-' + String(d).padStart(2, '0')
      var entry = byDate[dateStr]
      var punchIn = entry && entry.ins.length > 0 ? entry.ins[0] : null
      var punchOut = entry && entry.outs.length > 0 ? entry.outs[entry.outs.length - 1] : null
      var inLoc = entry && entry.inLocs.length > 0 ? entry.inLocs[0] : null
      var outLoc = entry && entry.outLocs.length > 0 ? entry.outLocs[entry.outLocs.length - 1] : null
      var hours = null
      if (punchIn && punchOut) {
        hours = Math.round((new Date(punchOut) - new Date(punchIn)) / 36e5 * 10) / 10
      }
      var dayName = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][new Date(dateStr).getDay()]
      rows.push({ date: dateStr, day: dayName, punchIn: punchIn, punchOut: punchOut, inLoc: inLoc, outLoc: outLoc, hours: hours, hasData: !!entry })
    }

    setDrillData(rows)
    setDrillLoading(false)
  }

  function fmtTime(iso) {
    if (!iso) return '—'
    var d = new Date(iso)
    var h = d.getHours(), m = d.getMinutes()
    var ampm = h >= 12 ? 'PM' : 'AM'
    h = h % 12 || 12
    return h + ':' + String(m).padStart(2, '0') + ' ' + ampm
  }

  async function exportDrillDocx() {
    if (!drillEmp || drillData.length === 0) return

    var border = { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' }
    var borders = { top: border, bottom: border, left: border, right: border }
    var colWidths = [1200, 1000, 2100, 2100, 1400, 1560]
    var tableWidth = colWidths.reduce(function (a, b) { return a + b }, 0)

    function cell(text, opts) {
      opts = opts || {}
      return new TableCell({
        borders: borders,
        width: { size: opts.w || 1200, type: WidthType.DXA },
        margins: { top: 60, bottom: 60, left: 100, right: 100 },
        shading: opts.header ? { fill: 'E7E6E6', type: 'clear' } : undefined,
        children: [new Paragraph({
          alignment: opts.align || AlignmentType.CENTER,
          children: [new TextRun({ text: String(text), bold: !!opts.bold, size: opts.size || 20, font: 'Arial' })]
        })]
      })
    }

    var headerRow = new TableRow({
      children: [
        cell('Date', { header: true, bold: true, w: colWidths[0] }),
        cell('Day', { header: true, bold: true, w: colWidths[1] }),
        cell('Punch In', { header: true, bold: true, w: colWidths[2] }),
        cell('Punch Out', { header: true, bold: true, w: colWidths[3] }),
        cell('Hours', { header: true, bold: true, w: colWidths[4] }),
        cell('Status', { header: true, bold: true, w: colWidths[5] })
      ],
      tableHeader: true
    })

    var totalHours = 0
    var dataRows = drillData.map(function (row) {
      var isFuture = new Date(row.date + 'T23:59:59') > new Date()
      var status = isFuture ? '—' : row.hasData ? (row.punchOut ? 'Present' : 'Incomplete') : 'Absent'
      if (row.hours) totalHours += row.hours
      return new TableRow({
        children: [
          cell(row.date.slice(8), { w: colWidths[0] }),
          cell(row.day, { w: colWidths[1] }),
          cell(isFuture ? '' : fmtTime(row.punchIn), { w: colWidths[2] }),
          cell(isFuture ? '' : fmtTime(row.punchOut), { w: colWidths[3] }),
          cell(isFuture ? '' : (row.hours != null ? String(row.hours) : '—'), { w: colWidths[4] }),
          cell(isFuture ? '—' : status, { w: colWidths[5], bold: status === 'Absent' })
        ]
      })
    })

    var totalsRow = new TableRow({
      children: [
        cell('TOTAL', { w: colWidths[0] + colWidths[1], bold: true }),
        cell('', { w: colWidths[1] }),
        cell('', { w: colWidths[2] }),
        cell('', { w: colWidths[3] }),
        cell(String(Math.round(totalHours * 10) / 10), { w: colWidths[4], bold: true }),
        cell('', { w: colWidths[5] })
      ]
    })

    var doc = new Document({
      sections: [{
        properties: {},
        children: [
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [new TextRun({ text: 'GET YOUR VENUE EVENTS PVT LTD', bold: true, size: 28, font: 'Arial' })]
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [new TextRun({ text: 'Day-wise Attendance Report', bold: true, size: 24, font: 'Arial' })]
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 200 },
            children: [new TextRun({ text: drillEmp.name + ' (' + drillEmp.emp_code + ')  |  ' + MONTHS[month - 1] + ' ' + year, size: 20, font: 'Arial' })]
          }),
          new Paragraph({ children: [] }),
          new Table({
            width: { size: tableWidth, type: WidthType.DXA },
            columnWidths: colWidths,
            rows: [headerRow].concat(dataRows).concat([totalsRow])
          })
        ]
      }]
    })

    var blob = await Packer.toBlob(doc)
    var a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = drillEmp.emp_code + '_' + MONTHS[month - 1] + '_' + year + '_daywise.docx'
    a.click()
    showToast('DOCX exported')
  }

  // Export DOCX — supports multi-month range + search/dept filters
  async function exportCSV() {
    setExporting(true)

    var months = []
    var fy = exportFromYear, fm = exportFromMonth
    var ty = exportToYear, tm = exportToMonth
    var cy = fy, cm = fm
    while (cy < ty || (cy === ty && cm <= tm)) {
      months.push({ year: cy, month: cm })
      cm++
      if (cm > 12) { cm = 1; cy++ }
    }

    if (months.length === 0) { setExporting(false); return }

    var isSingleMonth = months.length === 1
    var hasQuarterEnd = months.some(function (m) { return [3, 6, 9, 12].indexOf(m.month) >= 0 })
    var searchLower = search.trim().toLowerCase()

    var exportSelected = selected.length > 0 ? selected.slice() : null

    function applyFilters(rows) {
      return rows.filter(function (r) {
        if (exportSelected && !exportSelected.includes(r.employee_id)) return false
        if (!searchLower) return true
        return (r.name && r.name.toLowerCase().includes(searchLower)) ||
               (r.emp_code && r.emp_code.toLowerCase().includes(searchLower))
      })
    }

    // Collect all rows
    var allRows = []
    var grandTotals = { present: 0, absent: 0, half: 0, incomplete: 0, wkdays: 0, hrs: 0, claims: 0, ded: 0, overClaims: 0 }
    var serial = 1

    // Fetch per-quarter deductions from leave balances (one-time)
    var dedMap = {}
    try {
      var { data: lbData } = await supabase.rpc('admin_all_leave_balances')
      if (lbData && lbData.balances) {
        lbData.balances.forEach(function (b) {
          dedMap[b.employee_id] = {
            q1: Math.max(0, (b.q1_used || 0) - (b.q1_total || 19)),
            q2: Math.max(0, (b.q2_used || 0) - (b.q2_total || 19)),
            q3: Math.max(0, (b.q3_used || 0) - (b.q3_total || 19)),
            q4: Math.max(0, (b.q4_used || 0) - (b.q4_total || 19)),
            half_excess: Math.max(0, Math.floor(Math.max((b.half_used || 0) - (b.half_annual_total || 6), 0) / 2))
          }
        })
      }
    } catch (e) {}

    for (var i = 0; i < months.length; i++) {
      var m = months[i]
      var ms = m.year + '-' + String(m.month).padStart(2, '0') + '-01'
      var med = new Date(m.year, m.month, 0).getDate()
      var me = m.year + '-' + String(m.month).padStart(2, '0') + '-' + String(med).padStart(2, '0')
      var { data: mData } = await supabase.rpc('monthly_summary_range', {
        p_from_date: ms, p_to_date: me,
        p_department_id: deptFilter ? Number(deptFilter) : null
      })

      var rows = applyFilters(mData || [])
      var monthLabel = MONTHS[m.month - 1] + ' ' + m.year

      rows.forEach(function (r) {
        var present = r.days_present || 0
        var absent = r.days_absent || 0
        var half = r.days_half || 0
        var incomplete = r.days_incomplete || 0
        var wkdays = r.effective_days || 0
        var hrs = r.total_hours || 0
        var expected = wkdays * 9
        var hrsPct = expected > 0 ? Math.round(hrs / expected * 100) : 0
        var attPct = wkdays > 0 ? Math.round(present / wkdays * 100) : 0
        var avgD = present > 0 ? Math.round(hrs / present * 10) / 10 : 0
        var claimsUsed = r.claims_used || 0
        var claimsLimit = r.claims_limit || 0

        grandTotals.present += present
        grandTotals.absent += absent
        grandTotals.half += half
        grandTotals.incomplete += incomplete
        grandTotals.wkdays += wkdays
        grandTotals.hrs += hrs
        var empDed = dedMap[r.employee_id] || {}
        var ded = 0
        if (m.month === 6) ded = empDed.q1 || 0
        else if (m.month === 9) ded = empDed.q2 || 0
        else if (m.month === 12) ded = empDed.q3 || 0
        else if (m.month === 3) ded = (empDed.q4 || 0) + (empDed.half_excess || 0)
        var isQuarterEnd = [3, 6, 9, 12].indexOf(m.month) >= 0
        var overClaims = Math.max(0, claimsUsed - claimsLimit)
        grandTotals.claims += claimsUsed
        grandTotals.ded += ded
        grandTotals.overClaims += overClaims

        allRows.push({
          serial: serial++,
          month: monthLabel,
          name: r.name,
          dept: r.department_name || '—',
          wkdays: wkdays,
          present: present,
          half: half,
          absent: absent,
          incomplete: incomplete,
          hrs: hrs,
          expected: expected,
          hrsPct: hrsPct + '%',
          attPct: attPct + '%',
          avgD: avgD,
          claims: claimsUsed + '/' + claimsLimit,
          ded: isQuarterEnd ? ded : null,
          overClaims: overClaims,
          claimPenalty: overClaims * 500
        })
      })
    }

    if (allRows.length === 0) {
      setExporting(false)
      showToast('No employees match current filters')
      return
    }

    // Period line
    var periodLabel
    if (isSingleMonth) {
      var daysInMonth = new Date(fy, fm, 0).getDate()
      periodLabel = '01 ' + MONTHS[fm - 1] + ' – ' + daysInMonth + ' ' + MONTHS[fm - 1] + ' ' + fy
    } else {
      var lastDay = new Date(ty, tm, 0).getDate()
      periodLabel = '01 ' + MONTHS[fm - 1] + ' ' + fy + ' – ' + lastDay + ' ' + MONTHS[tm - 1] + ' ' + ty
    }

    // Helpers to build table cells
    var cellBorder = { style: BorderStyle.SINGLE, size: 1, color: 'D0D0D0' }
    var cellBorders = { top: cellBorder, bottom: cellBorder, left: cellBorder, right: cellBorder }
    var cellMargins = { top: 60, bottom: 60, left: 80, right: 80 }

    function textRun(text, opts) {
      opts = opts || {}
      return new TextRun({ text: String(text), bold: !!opts.bold, size: opts.size || 18, font: 'Arial', color: opts.color || '333333' })
    }
    function headerCell(text, w) {
      return new TableCell({
        width: { size: w, type: WidthType.DXA },
        borders: cellBorders,
        margins: cellMargins,
        shading: { fill: '2B3544', type: ShadingType.CLEAR },
        verticalAlign: 'center',
        children: [new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 20, after: 20 },
          children: [new TextRun({ text: String(text), bold: true, size: 16, font: 'Arial', color: 'FFFFFF' })] })]
      })
    }
    function dataCell(text, opts) {
      opts = opts || {}
      return new TableCell({
        width: { size: opts.w || 900, type: WidthType.DXA },
        borders: cellBorders,
        margins: cellMargins,
        shading: opts.shaded ? { fill: 'F7F8FA', type: ShadingType.CLEAR } : undefined,
        children: [new Paragraph({ alignment: opts.align || AlignmentType.CENTER, spacing: { before: 20, after: 20 },
          children: [textRun(text, { bold: !!opts.bold, color: opts.color })] })]
      })
    }

    // Column widths (DXA) — landscape letter with 0.75" margins = 13680 content width
    var colW = { sno: 500, name: 1700, dept: 1300, wk: 700, p: 650, h: 550, a: 650, inc: 550, hrs: 800, exp: 800, hpct: 650, apct: 650, avg: 700, cl: 680, ded: 600, clp: 750 }
    var colWMonth = 900
    // Adjust name width for multi-month to fit month column
    var colWidths = isSingleMonth
      ? [colW.sno, colW.name, colW.dept, colW.wk, colW.p, colW.h, colW.a, colW.inc, colW.hrs, colW.exp, colW.hpct, colW.apct, colW.avg, colW.cl].concat(hasQuarterEnd ? [colW.ded] : []).concat([colW.clp])
      : [colW.sno, colWMonth, colW.name - 200, colW.dept - 200, colW.wk, colW.p, colW.h, colW.a, colW.inc, colW.hrs, colW.exp, colW.hpct, colW.apct, colW.avg, colW.cl].concat(hasQuarterEnd ? [colW.ded] : []).concat([colW.clp])

    // Build header row
    var colHeaders = isSingleMonth
      ? ['S.No', 'Name', 'Dept', 'WkDays', 'Present', 'Half', 'Absent', 'Inc', 'Hrs', 'Expected', 'Hrs%', 'Att%', 'Avg/D', 'Claims'].concat(hasQuarterEnd ? ['Ded'] : []).concat(['₹ Penalty'])
      : ['S.No', 'Month', 'Name', 'Dept', 'WkDays', 'Present', 'Half', 'Absent', 'Inc', 'Hrs', 'Expected', 'Hrs%', 'Att%', 'Avg/D', 'Claims'].concat(hasQuarterEnd ? ['Ded'] : []).concat(['₹ Penalty'])

    var tableRows = [
      new TableRow({ children: colHeaders.map(function (h, i) { return headerCell(h, colWidths[i]) }), tableHeader: true })
    ]

    // Data rows
    var rowIdx = 0
    allRows.forEach(function (r) {
      var shaded = rowIdx % 2 === 1
      rowIdx++
      var s = { shaded: shaded }
      var dataCells = [
        dataCell(r.serial, { w: colWidths[0], shaded: shaded }),
        dataCell(r.name, { align: AlignmentType.LEFT, bold: true, w: isSingleMonth ? colWidths[1] : colWidths[2], shaded: shaded }),
        dataCell(r.dept, { align: AlignmentType.LEFT, w: isSingleMonth ? colWidths[2] : colWidths[3], shaded: shaded }),
        dataCell(r.wkdays, { shaded: shaded }),
        dataCell(r.present, { shaded: shaded, color: '1B7A43' }),
        dataCell(r.half, { shaded: shaded, color: 'C2590A' }),
        dataCell(r.absent, { shaded: shaded, color: 'DC2626' }),
        dataCell(r.incomplete, { shaded: shaded, color: 'B45309' }),
        dataCell(r.hrs, { shaded: shaded }),
        dataCell(r.expected, { shaded: shaded }),
        dataCell(r.hrsPct, { shaded: shaded }),
        dataCell(r.attPct, { shaded: shaded }),
        dataCell(r.avgD, { shaded: shaded }),
        dataCell(r.claims, { shaded: shaded, color: '7C3AED' }),
      ].concat(hasQuarterEnd ? [
        dataCell(r.ded || '—', { shaded: shaded, color: r.ded > 0 ? 'DC2626' : '999999' })
      ] : []).concat([
        dataCell(r.claimPenalty > 0 ? '₹' + r.claimPenalty : '—', { shaded: shaded, color: r.claimPenalty > 0 ? '7C3AED' : '999999' })
      ])
      if (!isSingleMonth) {
        dataCells.splice(1, 0, dataCell(r.month, { w: colWidths[1], shaded: shaded }))
      }
      tableRows.push(new TableRow({ children: dataCells }))
    })

    // Totals row
    var gExpected = grandTotals.wkdays * 9
    var gHrsPct = gExpected > 0 ? Math.round(grandTotals.hrs / gExpected * 100) + '%' : '—'
    var gAttPct = grandTotals.wkdays > 0 ? Math.round(grandTotals.present / grandTotals.wkdays * 100) + '%' : '—'
    var gAvgD = grandTotals.present > 0 ? Math.round(grandTotals.hrs / grandTotals.present * 10) / 10 : '—'

    var totShading = { fill: 'E8ECF0', type: ShadingType.CLEAR }
    function totCell(text, opts) {
      opts = opts || {}
      return new TableCell({
        width: { size: opts.w || 900, type: WidthType.DXA },
        borders: cellBorders,
        margins: cellMargins,
        shading: totShading,
        children: [new Paragraph({ alignment: opts.align || AlignmentType.CENTER, spacing: { before: 20, after: 20 },
          children: [new TextRun({ text: String(text), bold: true, size: 18, font: 'Arial', color: '1a1a1a' })] })]
      })
    }

    var totCells = [
      totCell(''),
      totCell('TOTAL', { align: AlignmentType.LEFT }),
      totCell(''),
      totCell(grandTotals.wkdays),
      totCell(grandTotals.present),
      totCell(grandTotals.half),
      totCell(grandTotals.absent),
      totCell(grandTotals.incomplete),
      totCell(Math.round(grandTotals.hrs * 10) / 10),
      totCell(gExpected),
      totCell(gHrsPct),
      totCell(gAttPct),
      totCell(gAvgD),
      totCell(grandTotals.claims),
    ].concat(hasQuarterEnd ? [totCell(grandTotals.ded)] : []).concat([
      totCell('₹' + (grandTotals.overClaims * 500))
    ])
    if (!isSingleMonth) {
      totCells.splice(1, 0, totCell(''))
    }
    tableRows.push(new TableRow({ children: totCells }))

    var tableWidth = colWidths.reduce(function (a, b) { return a + b }, 0)

    var table = new Table({
      rows: tableRows,
      width: { size: tableWidth, type: WidthType.DXA },
      columnWidths: colWidths
    })

    // Build document — landscape
    var doc = new Document({
      styles: {
        default: { document: { run: { font: 'Arial', size: 20 } } }
      },
      sections: [{
        properties: {
          page: {
            size: { width: 12240, height: 15840, orientation: PageOrientation.LANDSCAPE },
            margin: { top: 720, right: 720, bottom: 720, left: 720 }
          }
        },
        children: [
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 80 },
            children: [new TextRun({ text: 'GET YOUR VENUE EVENTS PVT LTD', bold: true, size: 28, font: 'Arial', color: '2B3544' })]
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 60 },
            children: [new TextRun({ text: 'Attendance Report', bold: true, size: 22, font: 'Arial', color: '555555' })]
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 200 },
            children: [new TextRun({ text: 'Period: ' + periodLabel + '   |   Employees: ' + allRows.length, size: 18, font: 'Arial', color: '888888' })]
          }),
          table
        ]
      }]
    })

    var blob = await Packer.toBlob(doc)
    var a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    var filterSuffix = searchLower ? '_' + searchLower.replace(/[^a-z0-9]/g, '') : ''
    a.download = isSingleMonth
      ? 'attendance_' + MONTHS[fm - 1] + '_' + fy + filterSuffix + '.docx'
      : 'attendance_' + MONTHS[fm - 1] + fy + '_to_' + MONTHS[tm - 1] + ty + filterSuffix + '.docx'
    a.click()

    setExporting(false)
    setShowExport(false)
    showToast('DOCX exported — ' + allRows.length + ' row' + (allRows.length !== 1 ? 's' : ''))
  }

  // Export Excel
  async function exportXLSX() {
    setExporting(true)

    var months = []
    var fy = exportFromYear, fm = exportFromMonth
    var ty = exportToYear, tm = exportToMonth
    var cy = fy, cm = fm
    while (cy < ty || (cy === ty && cm <= tm)) {
      months.push({ year: cy, month: cm })
      cm++
      if (cm > 12) { cm = 1; cy++ }
    }
    if (months.length === 0) { setExporting(false); return }

    var isSingleMonth = months.length === 1
    var searchLower = search.trim().toLowerCase()
    var exportSelected = selected.length > 0 ? selected.slice() : null

    function applyFilters(rows) {
      return rows.filter(function (r) {
        if (exportSelected && !exportSelected.includes(r.employee_id)) return false
        if (!searchLower) return true
        return (r.name && r.name.toLowerCase().includes(searchLower)) ||
               (r.emp_code && r.emp_code.toLowerCase().includes(searchLower))
      })
    }

    var allRows = []
    var grandTotals = { present: 0, absent: 0, half: 0, incomplete: 0, wkdays: 0, hrs: 0, claims: 0 }
    var serial = 1

    for (var i = 0; i < months.length; i++) {
      var m = months[i]
      var ms = m.year + '-' + String(m.month).padStart(2, '0') + '-01'
      var med = new Date(m.year, m.month, 0).getDate()
      var me = m.year + '-' + String(m.month).padStart(2, '0') + '-' + String(med).padStart(2, '0')
      var { data: mData } = await supabase.rpc('monthly_summary_range', {
        p_from_date: ms, p_to_date: me,
        p_department_id: deptFilter ? Number(deptFilter) : null
      })

      var rows = applyFilters(mData || [])
      var monthLabel = MONTHS[m.month - 1] + ' ' + m.year

      rows.forEach(function (r) {
        var present = r.days_present || 0
        var absent = r.days_absent || 0
        var half = r.days_half || 0
        var incomplete = r.days_incomplete || 0
        var wkdays = r.effective_days || 0
        var hrs = r.total_hours || 0
        var expected = wkdays * 9
        var hrsPct = expected > 0 ? Math.round(hrs / expected * 100) : 0
        var attPct = wkdays > 0 ? Math.round(present / wkdays * 100) : 0
        var avgD = present > 0 ? Math.round(hrs / present * 10) / 10 : 0
        var claimsUsed = r.claims_used || 0
        var claimsLimit = r.claims_limit || 0

        grandTotals.present += present
        grandTotals.absent += absent
        grandTotals.half += half
        grandTotals.incomplete += incomplete
        grandTotals.wkdays += wkdays
        grandTotals.hrs += hrs
        grandTotals.claims += claimsUsed

        var row = { 'S.No': serial++ }
        if (!isSingleMonth) row['Month'] = monthLabel
        row['Name'] = r.name
        row['Emp Code'] = r.emp_code
        row['Department'] = r.department_name || '—'
        row['Work Days'] = wkdays
        row['Present'] = present
        row['Half Day'] = half
        row['Absent'] = absent
        row['Incomplete'] = incomplete
        row['Hours'] = hrs
        row['Expected'] = expected
        row['Hours %'] = hrsPct
        row['Att %'] = attPct
        row['Avg/Day'] = avgD
        row['Claims'] = claimsUsed + '/' + claimsLimit
        allRows.push(row)
      })
    }

    if (allRows.length === 0) {
      setExporting(false)
      showToast('No employees match current filters')
      return
    }

    // Period label
    var periodLabel
    if (isSingleMonth) {
      var daysInMonth = new Date(fy, fm, 0).getDate()
      periodLabel = '01 ' + MONTHS[fm - 1] + ' – ' + daysInMonth + ' ' + MONTHS[fm - 1] + ' ' + fy
    } else {
      var lastDay = new Date(ty, tm, 0).getDate()
      periodLabel = '01 ' + MONTHS[fm - 1] + ' ' + fy + ' – ' + lastDay + ' ' + MONTHS[tm - 1] + ' ' + ty
    }

    // Totals row
    var gExpected = grandTotals.wkdays * 9
    var gHrsPct = gExpected > 0 ? Math.round(grandTotals.hrs / gExpected * 100) : '—'
    var gAttPct = grandTotals.wkdays > 0 ? Math.round(grandTotals.present / grandTotals.wkdays * 100) : '—'
    var gAvgD = grandTotals.present > 0 ? Math.round(grandTotals.hrs / grandTotals.present * 10) / 10 : '—'

    var totRow = { 'S.No': '' }
    if (!isSingleMonth) totRow['Month'] = ''
    totRow['Name'] = 'TOTAL'
    totRow['Emp Code'] = ''
    totRow['Department'] = ''
    totRow['Work Days'] = grandTotals.wkdays
    totRow['Present'] = grandTotals.present
    totRow['Half Day'] = grandTotals.half
    totRow['Absent'] = grandTotals.absent
    totRow['Incomplete'] = grandTotals.incomplete
    totRow['Hours'] = Math.round(grandTotals.hrs * 10) / 10
    totRow['Expected'] = gExpected
    totRow['Hours %'] = gHrsPct
    totRow['Att %'] = gAttPct
    totRow['Avg/Day'] = gAvgD
    totRow['Claims'] = grandTotals.claims
    allRows.push(totRow)

    // Build title rows
    var titleRows = [
      ['GET YOUR VENUE EVENTS PVT LTD'],
      ['Attendance Report'],
      ['Period: ' + periodLabel + '  |  Employees: ' + (allRows.length - 1)],
      []
    ]

    // Create worksheet
    var ws = XLSX.utils.aoa_to_sheet(titleRows)
    XLSX.utils.sheet_add_json(ws, allRows, { origin: 'A5' })

    // Column widths
    var colWidths = [{ wch: 5 }]
    if (!isSingleMonth) colWidths.push({ wch: 14 })
    colWidths = colWidths.concat([
      { wch: 22 }, { wch: 10 }, { wch: 16 },
      { wch: 10 }, { wch: 8 }, { wch: 9 }, { wch: 8 }, { wch: 10 },
      { wch: 8 }, { wch: 9 }, { wch: 9 }, { wch: 8 }, { wch: 9 }, { wch: 9 }
    ])
    ws['!cols'] = colWidths

    // Merge title rows
    var totalCols = isSingleMonth ? 15 : 16
    ws['!merges'] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: totalCols - 1 } },
      { s: { r: 1, c: 0 }, e: { r: 1, c: totalCols - 1 } },
      { s: { r: 2, c: 0 }, e: { r: 2, c: totalCols - 1 } }
    ]

    var wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Attendance')

    var wbOut = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
    var blob = new Blob([wbOut], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })

    var a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    var filterSuffix = searchLower ? '_' + searchLower.replace(/[^a-z0-9]/g, '') : ''
    a.download = isSingleMonth
      ? 'attendance_' + MONTHS[fm - 1] + '_' + fy + filterSuffix + '.xlsx'
      : 'attendance_' + MONTHS[fm - 1] + fy + '_to_' + MONTHS[tm - 1] + ty + filterSuffix + '.xlsx'
    a.click()

    setExporting(false)
    setShowExport(false)
    showToast('Excel exported — ' + (allRows.length - 1) + ' row' + ((allRows.length - 1) !== 1 ? 's' : ''))
  }

  // Year options
  var yearOptions = []
  for (var y = now.getFullYear(); y >= now.getFullYear() - 2; y--) {
    yearOptions.push(y)
  }

  // Summary stat cards (display only)
  var STAT_CARDS = [
    { label: 'Employees', value: filtered.length, dot: 'bg-slate-400', color: 'text-gray-900' },
    { label: 'Present', value: totals.present, dot: 'bg-emerald-500', color: 'text-emerald-600' },
    { label: 'Half Day', value: totals.half, dot: 'bg-orange-500', color: 'text-orange-600' },
    { label: 'Absent', value: totals.absent, dot: 'bg-red-500', color: 'text-red-600' },
    { label: 'Incomplete', value: totals.incomplete, dot: 'bg-amber-500', color: 'text-amber-600' },
    { label: 'Total Hours', value: Math.round(totals.hours * 10) / 10, dot: 'bg-blue-500', color: 'text-gray-900' }
  ]

  var totalDeductions = filtered.reduce(function (sum, r) { return sum + (r.deductions || 0) }, 0)

  function SortHead({ col, label, align, color, extra }) {
    var arrow = sortCol === col ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''
    var active = sortCol === col
    return (
      <th onClick={function () { handleSort(col) }}
        className={(align || 'text-left') + ' px-2.5 py-2.5 md:px-4 md:py-3 text-[11px] font-semibold uppercase tracking-wider whitespace-nowrap cursor-pointer select-none hover:text-gray-800 transition-colors ' +
          (active ? 'text-gray-900' : 'text-gray-500') + (extra ? ' ' + extra : '')}>
        {color && <span className={'inline-block w-1.5 h-1.5 rounded-full mr-1.5 align-middle ' + color} />}
        {label}{arrow}
      </th>
    )
  }

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3 mb-4">
        <div>
          <h2 className="text-xl md:text-2xl font-bold text-gray-900 tracking-tight">Monthly Report</h2>
          <p className="text-xs md:text-sm text-gray-500 mt-0.5">Attendance summary for payroll · click a name for the day-wise breakdown</p>
        </div>
        <div className="flex items-center gap-2 w-full md:w-auto">
          {selected.length > 0 && (
            <span className="h-9 pl-3 pr-1.5 inline-flex items-center gap-1.5 rounded-lg bg-blue-50 ring-1 ring-blue-100 text-sm font-medium text-blue-700">
              {selected.length}<span className="hidden md:inline"> selected</span>
              <button onClick={function () { setSelected([]) }} title="Clear selection"
                className="w-6 h-6 inline-flex items-center justify-center rounded-md text-blue-400 hover:text-blue-700 hover:bg-blue-100 transition-colors">
                <XIcon className="w-3.5 h-3.5" />
              </button>
            </span>
          )}
          <button onClick={loadData} disabled={loading} title="Refresh"
            className="h-9 px-3 inline-flex items-center gap-1.5 rounded-lg bg-white ring-1 ring-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60 transition-colors">
            <svg className={'w-4 h-4 ' + (loading ? 'animate-spin' : '')} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
              strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 11a8 8 0 0 0-14.9-3.9M4 4v4h4" /><path d="M4 13a8 8 0 0 0 14.9 3.9M20 20v-4h-4" /></svg>
            <span className="hidden md:inline">Refresh</span>
          </button>
          <button
            onClick={function () { setShowExport(true); setExportFromYear(year); setExportFromMonth(month); setExportToYear(year); setExportToMonth(month) }}
            disabled={loading || filtered.length === 0}
            className="h-9 px-3 flex-1 md:flex-initial justify-center md:justify-start inline-flex items-center gap-1.5 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 shadow-sm disabled:opacity-40 transition-colors"
          >
            <DownloadIcon className="w-4 h-4" />
            <span className="md:hidden">Export{selected.length > 0 ? ' ' + selected.length : ''}</span>
            <span className="hidden md:inline">Export {selected.length > 0 ? selected.length + ' Selected' : 'Report'}</span>
          </button>
        </div>
      </div>

      {/* Casual close gate warning */}
      {casualIncompleteCount > 0 && (
        <div className="flex items-start gap-3 bg-amber-50 ring-1 ring-amber-200 rounded-2xl px-4 py-3 mb-4">
          <WarnIcon className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-amber-800">
              {casualIncompleteCount} casual worker{casualIncompleteCount > 1 ? 's have' : ' has'} incomplete records
            </p>
            <p className="text-xs text-amber-700/80 mt-0.5">
              Resolve these before exporting for payroll. Unresolved casual records will default to Present in the export.
            </p>
          </div>
        </div>
      )}

      {/* Filters toolbar */}
      <div className="bg-white rounded-2xl ring-1 ring-gray-200/70 shadow-sm p-3 mb-4 grid grid-cols-2 gap-3 md:flex md:flex-wrap md:items-end">
        <FilterField label="Month">
          <select value={month} onChange={function (e) { setMonth(Number(e.target.value)) }}
            className={FIELD + ' w-full md:w-auto min-w-0 md:min-w-36'}>
            {MONTHS.map(function (m, i) {
              return <option key={i} value={i + 1}>{m}</option>
            })}
          </select>
        </FilterField>
        <FilterField label="Year">
          <select value={year} onChange={function (e) { setYear(Number(e.target.value)) }}
            className={FIELD + ' w-full md:w-auto min-w-0 md:min-w-24'}>
            {yearOptions.map(function (y) {
              return <option key={y} value={y}>{y}</option>
            })}
          </select>
        </FilterField>
        <FilterField label="Department" span>
          <DeptPicker departments={departments} value={deptFilter} onChange={setDeptFilter}
            className="h-10 rounded-xl w-full md:w-auto" />
        </FilterField>
        <FilterField label="Search" grow span>
          <div className="relative">
            <svg className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
            <input type="text" value={search} onChange={function (e) { setSearch(e.target.value) }}
              placeholder="Name or code…"
              className={FIELD + ' w-full pl-9'} />
          </div>
        </FilterField>
      </div>

      {/* Summary */}
      {!loading && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 md:gap-3 mb-4">
          {STAT_CARDS.map(function (c) {
            return (
              <div key={c.label} className="rounded-2xl px-3 py-2.5 md:px-4 md:py-3 bg-white shadow-sm ring-1 ring-gray-200/70">
                <p className="flex items-center gap-2 text-[12px] md:text-[13px] font-medium text-gray-500">
                  <span className={'w-2 h-2 rounded-full ' + c.dot} />
                  {c.label}
                </p>
                <p className={'text-[22px] md:text-[26px] font-bold leading-tight mt-0.5 md:mt-1 tabular-nums ' + c.color}>{c.value}</p>
              </div>
            )
          })}
        </div>
      )}

      {/* Table */}
      {loading ? (
        <p className="text-sm text-gray-400 text-center py-12">Loading…</p>
      ) : (
        <div className="bg-white rounded-2xl ring-1 ring-gray-200/70 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-max md:min-w-0 text-sm">
              <thead>
                <tr className="bg-gray-50/80 border-b border-gray-200">
                  <th className={'pl-3 md:pl-4 pr-1 py-2.5 md:py-3 w-10 ' + STICKY_CHECK + ' bg-gray-50 md:bg-transparent'}>
                    <input type="checkbox" checked={allSelected} onChange={toggleAll}
                      className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer align-middle" />
                  </th>
                  <SortHead col="name" label="Employee" extra={STICKY_EMP + ' bg-gray-50 md:bg-transparent'} />
                  <SortHead col="department_name" label="Department" />
                  <SortHead col="effective_days" label="Days" align="text-center" />
                  <SortHead col="days_present" label="Present" align="text-center" color="bg-emerald-500" />
                  <SortHead col="days_half" label="Half" align="text-center" color="bg-orange-500" />
                  <SortHead col="days_absent" label="Absent" align="text-center" color="bg-red-500" />
                  <SortHead col="days_incomplete" label="Inc" align="text-center" color="bg-amber-500" />
                  <SortHead col="total_hours" label="Hours" align="text-right" />
                  <SortHead col="claims_used" label="Claims" align="text-center" color="bg-purple-500" />
                  <SortHead col="deductions" label="Ded" align="text-center" color="bg-pink-500" />
                  <SortHead col="continue_credits" label="+C" align="text-center" color="bg-teal-500" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={12} className="text-center py-12 text-sm text-gray-400">No data for this period</td>
                  </tr>
                ) : filtered.map(function (r) {
                  var initials = (r.name || '?').trim().split(/\s+/).slice(0, 2).map(function (w) { return w[0] }).join('').toUpperCase()
                  var isSel = selected.includes(r.employee_id)
                  var rowBg = isSel ? ' bg-blue-50 md:bg-transparent' : ' bg-white md:bg-transparent'
                  return (
                    <tr key={r.employee_id} className={'transition-colors ' + (isSel ? 'bg-blue-50/50' : 'hover:bg-blue-50/30')}>
                      <td className={'pl-3 md:pl-4 pr-1 py-2 md:py-2.5 ' + STICKY_CHECK + rowBg}>
                        <input type="checkbox" checked={isSel} onChange={function () { toggleOne(r.employee_id) }}
                          className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer align-middle" />
                      </td>
                      <td className={'px-2.5 py-2 md:px-4 md:py-2.5 ' + STICKY_EMP + rowBg}>
                        <div className="flex items-center gap-3 w-36 md:w-auto md:min-w-52">
                          <span className="hidden md:inline-flex w-8 h-8 rounded-full bg-slate-100 text-slate-500 text-[11px] font-bold items-center justify-center shrink-0">{initials}</span>
                          <div className="min-w-0">
                            <p className="font-semibold text-gray-900 md:truncate">
                              <button onClick={function () { openDrill(r) }} className="hover:text-blue-700 hover:underline underline-offset-2 text-left">
                                {r.name}
                              </button>
                              {r.is_casual && <span className="ml-1.5 text-[10px] font-medium text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded align-middle">casual</span>}
                              {r.days_incomplete > 0 && <span className="ml-1.5 text-[10px] font-semibold text-amber-700 bg-amber-50 ring-1 ring-amber-100 px-1.5 py-0.5 rounded align-middle">needs review</span>}
                            </p>
                            <p className="text-xs text-gray-400 tabular-nums">{r.emp_code}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-2.5 py-2 md:px-4 md:py-2.5 text-[13px] text-gray-600 whitespace-nowrap">{r.department_name || <span className="text-gray-300">—</span>}</td>
                      <td className="px-2.5 py-2 md:px-4 md:py-2.5 text-[13px] text-gray-600 text-center tabular-nums">{r.effective_days}</td>
                      <td className="px-2.5 py-2 md:px-4 md:py-2.5 text-center"><NumPill value={r.days_present} cls="bg-emerald-50 text-emerald-700" /></td>
                      <td className="px-2.5 py-2 md:px-4 md:py-2.5 text-center"><NumPill value={r.days_half} cls="bg-orange-50 text-orange-600" /></td>
                      <td className="px-2.5 py-2 md:px-4 md:py-2.5 text-center"><NumPill value={r.days_absent} cls="bg-red-50 text-red-600" /></td>
                      <td className="px-2.5 py-2 md:px-4 md:py-2.5 text-center"><NumPill value={r.days_incomplete > 0 ? r.days_incomplete : 0} cls="bg-amber-50 text-amber-700" /></td>
                      <td className="px-2.5 py-2 md:px-4 md:py-2.5 text-[13px] text-right font-medium text-gray-800 tabular-nums">{r.total_hours}</td>
                      <td className="px-2.5 py-2 md:px-4 md:py-2.5 text-center">
                        {r.claims_over_limit ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-50 ring-1 ring-red-200 text-xs font-bold text-red-600 tabular-nums whitespace-nowrap" title={'Over limit of ' + r.claims_limit}>
                            <WarnIcon className="w-3 h-3" />
                            {r.claims_used}/{r.claims_limit}
                          </span>
                        ) : r.claims_used > 0 ? (
                          <span className="inline-flex px-2 py-0.5 rounded-full bg-purple-50 text-xs font-semibold text-purple-700 tabular-nums">{r.claims_used}/{r.claims_limit}</span>
                        ) : (
                          <span className="text-gray-300">—</span>
                        )}
                      </td>
                      <td className="px-2.5 py-2 md:px-4 md:py-2.5 text-center">
                        {r.deductions > 0
                          ? <span className="inline-flex px-2 py-0.5 rounded-full bg-pink-50 ring-1 ring-pink-200 text-xs font-bold text-pink-700 tabular-nums">{r.deductions}</span>
                          : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-2.5 py-2 md:px-4 md:py-2.5 text-center" title="Continue credits added">
                        {r.continue_credits > 0 ? (
                          <span className="inline-flex px-2 py-0.5 rounded-full bg-teal-50 text-xs font-bold text-teal-700 tabular-nums">+{r.continue_credits}</span>
                        ) : (
                          <span className="text-gray-300">—</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              {filtered.length > 0 && (
                <tfoot>
                  <tr className="bg-gray-50/80 border-t border-gray-200 font-semibold">
                    <td className="px-3 py-2.5 md:px-4 md:py-3 text-[11px] text-gray-500 uppercase tracking-wider whitespace-nowrap sticky left-0 z-10 bg-gray-50 shadow-[4px_0_6px_-4px_rgba(15,23,42,0.18)] md:static md:z-auto md:bg-transparent md:shadow-none" colSpan={2}>Total · {filtered.length}<span className="hidden md:inline"> employees</span></td>
                    <td />

                    <td className="px-2.5 py-2.5 md:px-4 md:py-3 text-[13px] text-center text-gray-700 tabular-nums">{totals.effective}</td>
                    <td className="px-2.5 py-2.5 md:px-4 md:py-3 text-[13px] text-center text-emerald-700 tabular-nums">{totals.present}</td>
                    <td className="px-2.5 py-2.5 md:px-4 md:py-3 text-[13px] text-center text-orange-600 tabular-nums">{totals.half}</td>
                    <td className="px-2.5 py-2.5 md:px-4 md:py-3 text-[13px] text-center text-red-600 tabular-nums">{totals.absent}</td>
                    <td className="px-2.5 py-2.5 md:px-4 md:py-3 text-[13px] text-center text-amber-600 tabular-nums">{totals.incomplete}</td>
                    <td className="px-2.5 py-2.5 md:px-4 md:py-3 text-[13px] text-right text-gray-800 tabular-nums">{Math.round(totals.hours * 10) / 10}</td>
                    <td className="px-2.5 py-2.5 md:px-4 md:py-3 text-[13px] text-center text-purple-600 tabular-nums">{totals.claims}</td>
                    <td className="px-2.5 py-2.5 md:px-4 md:py-3 text-[13px] text-center text-pink-600 tabular-nums">{totalDeductions || <span className="text-gray-300">—</span>}</td>
                    <td className="px-2.5 py-2.5 md:px-4 md:py-3 text-[13px] text-center text-teal-600 tabular-nums">{totals.continue > 0 ? '+' + totals.continue : <span className="text-gray-300">—</span>}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
          {filtered.length > 0 && (
            <div className="px-4 py-2.5 border-t border-gray-100 text-xs text-gray-500">
              Showing {filtered.length} of {records.length}
            </div>
          )}
        </div>
      )}

      {showExport && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end md:items-center justify-center p-0 md:p-4" onClick={function () { if (!exporting) setShowExport(false) }}>
          <div className="bg-white rounded-t-2xl md:rounded-2xl w-full md:max-w-sm max-h-[92vh] overflow-y-auto md:max-h-none md:overflow-visible pb-[env(safe-area-inset-bottom)] md:pb-0 shadow-xl ring-1 ring-gray-200/70" onClick={function (e) { e.stopPropagation() }}>
            <div className="px-5 py-4 border-b border-gray-100">
              <h3 className="text-base font-bold text-gray-900">Export Report</h3>
              <p className="text-xs text-gray-500 mt-0.5">Choose format and month range</p>
            </div>
            <div className="px-5 py-4 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <FilterField label="From Month">
                  <select value={exportFromMonth} onChange={function (e) { setExportFromMonth(Number(e.target.value)) }}
                    className={FIELD + ' w-full'}>
                    {MONTHS.map(function (m, i) { return <option key={i} value={i + 1}>{m}</option> })}
                  </select>
                </FilterField>
                <FilterField label="From Year">
                  <select value={exportFromYear} onChange={function (e) { setExportFromYear(Number(e.target.value)) }}
                    className={FIELD + ' w-full'}>
                    {yearOptions.map(function (y) { return <option key={y} value={y}>{y}</option> })}
                  </select>
                </FilterField>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <FilterField label="To Month">
                  <select value={exportToMonth} onChange={function (e) { setExportToMonth(Number(e.target.value)) }}
                    className={FIELD + ' w-full'}>
                    {MONTHS.map(function (m, i) { return <option key={i} value={i + 1}>{m}</option> })}
                  </select>
                </FilterField>
                <FilterField label="To Year">
                  <select value={exportToYear} onChange={function (e) { setExportToYear(Number(e.target.value)) }}
                    className={FIELD + ' w-full'}>
                    {yearOptions.map(function (y) { return <option key={y} value={y}>{y}</option> })}
                  </select>
                </FilterField>
              </div>

              {(exportToYear < exportFromYear || (exportToYear === exportFromYear && exportToMonth < exportFromMonth)) && (
                <p className="text-xs text-red-600">To month must be same or after From month</p>
              )}

              <FilterField label="Format">
                <div className="flex p-1 gap-1 rounded-xl bg-gray-100">
                  <button onClick={function () { setExportFormat('docx') }}
                    className={'flex-1 h-8 inline-flex items-center justify-center gap-1.5 rounded-lg text-xs font-semibold transition-colors ' + (exportFormat === 'docx' ? 'bg-white text-gray-900 shadow-sm ring-1 ring-gray-200' : 'text-gray-500 hover:text-gray-800')}>
                    <DocIcon className="w-3.5 h-3.5" />
                    Word (.docx)
                  </button>
                  <button onClick={function () { setExportFormat('xlsx') }}
                    className={'flex-1 h-8 inline-flex items-center justify-center gap-1.5 rounded-lg text-xs font-semibold transition-colors ' + (exportFormat === 'xlsx' ? 'bg-white text-gray-900 shadow-sm ring-1 ring-gray-200' : 'text-gray-500 hover:text-gray-800')}>
                    <SheetIcon className="w-3.5 h-3.5" />
                    Excel (.xlsx)
                  </button>
                </div>
              </FilterField>

              <div className="flex gap-2 pt-1">
                <button onClick={function () { setShowExport(false) }} disabled={exporting}
                  className="flex-1 h-9 text-sm font-medium text-gray-700 bg-white ring-1 ring-gray-200 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-40">Cancel</button>
                <button onClick={exportFormat === 'xlsx' ? exportXLSX : exportCSV}
                  disabled={exporting || exportToYear < exportFromYear || (exportToYear === exportFromYear && exportToMonth < exportFromMonth)}
                  className="flex-1 h-9 inline-flex items-center justify-center gap-1.5 text-sm text-white bg-blue-600 rounded-lg hover:bg-blue-700 shadow-sm disabled:opacity-40 transition-colors font-medium">
                  {!exporting && <DownloadIcon className="w-4 h-4" />}
                  {exporting ? 'Exporting…' : (exportFormat === 'xlsx' ? 'Export Excel' : 'Export Word')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {drillEmp && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end md:items-center justify-center p-0 md:p-4" onClick={function () { setDrillEmp(null) }}>
          <div className="bg-white rounded-t-2xl md:rounded-2xl w-full md:max-w-3xl shadow-xl ring-1 ring-gray-200/70 max-h-[92vh] md:max-h-[85vh] flex flex-col overflow-hidden" onClick={function (e) { e.stopPropagation() }}>
            <div className="px-4 py-3 md:px-5 md:py-4 border-b border-gray-100 flex items-center justify-between gap-2 shrink-0">
              <div className="flex items-center gap-3 min-w-0">
                <span className="w-9 h-9 rounded-full bg-slate-100 text-slate-500 text-xs font-bold inline-flex items-center justify-center shrink-0">
                  {(drillEmp.name || '?').trim().split(/\s+/).slice(0, 2).map(function (w) { return w[0] }).join('').toUpperCase()}
                </span>
                <div className="min-w-0">
                  <h3 className="text-base font-bold text-gray-900 truncate">{drillEmp.name}</h3>
                  <p className="text-xs text-gray-500 tabular-nums">{drillEmp.emp_code} · {MONTHS[month - 1]} {year}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button onClick={exportDrillDocx}
                  className="h-9 px-3 inline-flex items-center gap-1.5 rounded-lg bg-white ring-1 ring-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">
                  <DownloadIcon className="w-4 h-4" />
                  DOCX
                </button>
                <button onClick={function () { setDrillEmp(null) }} title="Close"
                  className="w-9 h-9 inline-flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors">
                  <XIcon className="w-4 h-4" />
                </button>
              </div>
            </div>
            <div className="overflow-y-auto overflow-x-auto md:overflow-x-visible flex-1">
              {drillLoading ? (
                <p className="text-sm text-gray-400 text-center py-12">Loading…</p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-gray-50 z-10">
                    <tr className="border-b border-gray-200">
                      <th className="px-2.5 md:px-4 py-3 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Date</th>
                      <th className="px-2.5 md:px-4 py-3 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Day</th>
                      <th className="px-2.5 md:px-4 py-3 text-center text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
                        <span className="inline-block w-1.5 h-1.5 rounded-full mr-1.5 align-middle bg-emerald-500" />In
                      </th>
                      <th className="hidden md:table-cell px-4 py-3 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider">In Location</th>
                      <th className="px-2.5 md:px-4 py-3 text-center text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
                        <span className="inline-block w-1.5 h-1.5 rounded-full mr-1.5 align-middle bg-red-500" />Out
                      </th>
                      <th className="hidden md:table-cell px-4 py-3 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Out Location</th>
                      <th className="px-2.5 md:px-4 py-3 text-right text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Hours</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {drillData.map(function (row) {
                      var isFuture = new Date(row.date + 'T23:59:59') > new Date()
                      var bgClass = isFuture ? ' text-gray-300' : !row.hasData ? ' bg-red-50/40' : ' hover:bg-blue-50/30'
                      return (
                        <tr key={row.date} className={'transition-colors' + bgClass}>
                          <td className="px-2.5 md:px-4 py-2 text-[13px] font-semibold text-gray-700 tabular-nums">{row.date.slice(8)}</td>
                          <td className="px-2.5 md:px-4 py-2 text-[13px] text-gray-500">{row.day}</td>
                          <td className="px-2.5 md:px-4 py-2 text-[13px] text-center text-emerald-700 font-medium tabular-nums whitespace-nowrap">{isFuture ? '' : fmtTime(row.punchIn)}{!isFuture && row.inLoc && <span className="md:hidden block mx-auto max-w-24 truncate text-[10px] font-normal text-gray-400" title={row.inLoc}>{row.inLoc}</span>}</td>
                          <td className="hidden md:table-cell px-4 py-2 text-xs text-left text-gray-500 truncate max-w-[160px]" title={row.inLoc || ''}>{isFuture ? '' : (row.inLoc || <span className="text-gray-300">—</span>)}</td>
                          <td className="px-2.5 md:px-4 py-2 text-[13px] text-center text-red-600 font-medium tabular-nums whitespace-nowrap">{isFuture ? '' : fmtTime(row.punchOut)}{!isFuture && row.outLoc && <span className="md:hidden block mx-auto max-w-24 truncate text-[10px] font-normal text-gray-400" title={row.outLoc}>{row.outLoc}</span>}</td>
                          <td className="hidden md:table-cell px-4 py-2 text-xs text-left text-gray-500 truncate max-w-[160px]" title={row.outLoc || ''}>{isFuture ? '' : (row.outLoc || <span className="text-gray-300">—</span>)}</td>
                          <td className="px-2.5 md:px-4 py-2 text-[13px] text-right font-medium text-gray-800 tabular-nums">{isFuture ? '' : (row.hours != null ? row.hours : <span className="text-gray-300">—</span>)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-4 left-4 right-4 text-center md:text-left md:left-auto md:bottom-6 md:right-6 bg-slate-800 text-white px-5 py-3 rounded-xl text-sm shadow-lg z-50">
          {toast}
        </div>
      )}
    </div>
  )
}

// Coloured count pill; zero / empty renders a muted dash
function NumPill({ value, cls }) {
  if (!value) return <span className="text-gray-300">—</span>
  return <span className={'inline-flex min-w-7 justify-center px-2 py-0.5 rounded-full text-xs font-bold tabular-nums ' + cls}>{value}</span>
}

function DownloadIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3v12M7 10l5 5 5-5" /><path d="M5 21h14" />
    </svg>
  )
}

function WarnIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 9v4M12 17h.01" /><path d="M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
    </svg>
  )
}

function XIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M18 6L6 18M6 6l12 12" />
    </svg>
  )
}

function DocIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5M9 13h6M9 17h6" />
    </svg>
  )
}

function SheetIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="4" y="4" width="16" height="16" rx="2" /><path d="M4 10h16M4 15h16M10 4v16" />
    </svg>
  )
}
