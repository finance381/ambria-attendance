import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { Document, Packer, Paragraph, Table, TableRow, TableCell, TextRun, AlignmentType, HeadingLevel, WidthType, BorderStyle, ShadingType, PageOrientation } from 'docx'
import * as XLSX from 'xlsx'


var MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']

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
  var totals = { effective: 0, present: 0, half: 0, absent: 0, incomplete: 0, hours: 0, claims: 0 }
  filtered.forEach(function (r) {
    totals.effective += r.effective_days
    totals.present += r.days_present
    totals.half += r.days_half
    totals.absent += r.days_absent
    totals.incomplete += r.days_incomplete
    totals.hours += r.total_hours
    totals.claims += (r.claims_used || 0)
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

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-lg font-bold text-gray-900">Monthly Report</h2>
        <div className="flex items-center gap-3">
          {selected.length > 0 && (
            <span className="text-xs text-slate-600 bg-slate-100 px-2.5 py-1.5 rounded-lg font-medium">
              {selected.length} selected
              <button onClick={function () { setSelected([]) }} className="ml-2 text-slate-400 hover:text-slate-700">✕</button>
            </span>
          )}
          <button
            onClick={function () { setShowExport(true); setExportFromYear(year); setExportFromMonth(month); setExportToYear(year); setExportToMonth(month) }}
            disabled={loading || filtered.length === 0}
            className="px-4 py-2 text-sm text-white bg-slate-800 rounded-lg hover:bg-slate-900 disabled:opacity-40 transition-colors font-medium"
          >
            ⬇ Export {selected.length > 0 ? selected.length + ' Selected' : 'Report'}
          </button>
          
        </div>
      </div>
      <p className="text-xs text-gray-500 mb-4">Attendance summary for payroll</p>

      {/* Casual close gate warning */}
      {casualIncompleteCount > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-4">
          <p className="text-sm font-semibold text-amber-800">
            ⚠️ {casualIncompleteCount} casual worker{casualIncompleteCount > 1 ? 's have' : ' has'} incomplete records
          </p>
          <p className="text-xs text-amber-600 mt-0.5">
            Resolve these before exporting for payroll. Unresolved casual records will default to Present in the export.
          </p>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-4">
        <div>
          <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1">Month</label>
          <select value={month} onChange={function (e) { setMonth(Number(e.target.value)) }}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-700">
            {MONTHS.map(function (m, i) {
              return <option key={i} value={i + 1}>{m}</option>
            })}
          </select>
        </div>
        <div>
          <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1">Year</label>
          <select value={year} onChange={function (e) { setYear(Number(e.target.value)) }}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-700">
            {yearOptions.map(function (y) {
              return <option key={y} value={y}>{y}</option>
            })}
          </select>
        </div>
        <div>
          <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1">Department</label>
          <select value={deptFilter} onChange={function (e) { setDeptFilter(e.target.value) }}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-700">
            <option value="">All</option>
            {departments.map(function (d) { return <option key={d.id} value={d.id}>{d.name}</option> })}
          </select>
        </div>
        <div>
          <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1">Search</label>
          <input type="text" value={search} onChange={function (e) { setSearch(e.target.value) }}
            placeholder="Name or code…"
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-700" />
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <p className="text-sm text-gray-400 text-center py-12">Loading…</p>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-x-auto shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="px-3 py-2.5 w-10">
                  <input type="checkbox" checked={allSelected} onChange={toggleAll}
                    className="w-4 h-4 rounded border-gray-300 text-slate-700 focus:ring-slate-700 cursor-pointer" />
                </th>
                {[
                  { key: 'emp_code', label: 'Code', align: 'text-left', color: 'text-gray-500' },
                  { key: 'name', label: 'Name', align: 'text-left', color: 'text-gray-500' },
                  { key: 'department_name', label: 'Department', align: 'text-left', color: 'text-gray-500' },
                  { key: 'effective_days', label: 'Days', align: 'text-center', color: 'text-gray-500' },
                  { key: 'days_present', label: 'P', align: 'text-center', color: 'text-emerald-600' },
                  { key: 'days_half', label: 'H', align: 'text-center', color: 'text-orange-600' },
                  { key: 'days_absent', label: 'A', align: 'text-center', color: 'text-red-600' },
                  { key: 'days_incomplete', label: 'Inc', align: 'text-center', color: 'text-amber-600' },
                  { key: 'total_hours', label: 'Hours', align: 'text-right', color: 'text-gray-500' },
                  { key: 'claims_used', label: 'Claims', align: 'text-center', color: 'text-purple-600' },
                  { key: 'deductions', label: 'Ded', align: 'text-center', color: 'text-pink-600' }
                ].map(function (col) {
                  var arrow = sortCol === col.key ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''
                  return (
                    <th key={col.key}
                      onClick={function () { handleSort(col.key) }}
                      className={col.align + ' px-3 py-2.5 text-[10px] font-bold ' + col.color + ' uppercase tracking-wider cursor-pointer hover:bg-gray-100 select-none transition-colors'}>
                      {col.label}{arrow}
                    </th>
                  )
                })}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={12} className="text-center py-8 text-sm text-gray-400 italic">No data for this period</td>
                </tr>
              ) : (
                <>
                  {filtered.map(function (r) {
                    var hasIssue = r.days_incomplete > 0
                    return (
                      <tr key={r.employee_id} className={'border-b border-gray-100 hover:bg-gray-50' + (hasIssue ? ' bg-amber-50/40' : '')}>
                        <td className="px-3 py-2">
                          <input type="checkbox" checked={selected.includes(r.employee_id)} onChange={function () { toggleOne(r.employee_id) }}
                            className="w-4 h-4 rounded border-gray-300 text-slate-700 focus:ring-slate-700 cursor-pointer" />
                        </td>
                        <td className="px-3 py-2 text-xs text-gray-400 font-mono">{r.emp_code}</td>
                        <td className="px-3 py-2 font-medium text-gray-900">
                          <button onClick={function () { openDrill(r) }} className="hover:text-slate-600 hover:underline underline-offset-2 text-left">
                            {r.name}
                          </button>
                          {r.is_casual && <span className="ml-1 text-[9px] text-gray-400 bg-gray-100 px-1 rounded">casual</span>}
                        </td>
                        <td className="px-3 py-2 text-xs text-gray-500">{r.department_name || '—'}</td>
                        <td className="px-3 py-2 text-xs text-gray-500 text-center">{r.effective_days}</td>
                        <td className="px-3 py-2 text-xs text-center font-semibold text-emerald-700">{r.days_present || '—'}</td>
                        <td className="px-3 py-2 text-xs text-center font-semibold text-orange-600">{r.days_half || '—'}</td>
                        <td className="px-3 py-2 text-xs text-center font-semibold text-red-600">{r.days_absent || '—'}</td>
                        <td className="px-3 py-2 text-xs text-center font-semibold text-amber-600">
                          {r.days_incomplete > 0 ? r.days_incomplete : '—'}
                        </td>
                        <td className="px-3 py-2 text-xs text-right font-mono text-gray-700">{r.total_hours}</td>
                        <td className="px-3 py-2 text-xs text-center">
                          {r.claims_over_limit ? (
                            <span className="inline-flex items-center gap-1 font-bold text-red-600 bg-red-50 px-1.5 py-0.5 rounded" title={'Over limit of ' + r.claims_limit}>
                              ⚠ {r.claims_used}/{r.claims_limit}
                            </span>
                          ) : r.claims_used > 0 ? (
                            <span className="font-semibold text-purple-600">{r.claims_used}/{r.claims_limit}</span>
                          ) : (
                            <span className="text-gray-400">—</span>
                          )}
                        </td>
                        <td className={'px-3 py-2 text-xs text-center font-bold ' + (r.deductions > 0 ? 'text-pink-600' : 'text-gray-400')}>
                          {r.deductions > 0 ? r.deductions : '—'}
                        </td>
                      </tr>
                    )
                  })}
                  {/* Totals row */}
                  <tr className="bg-gray-50 border-t-2 border-gray-300 font-bold">
                    <td className="px-3 py-2.5 text-xs text-gray-500" colSpan={4}>TOTAL ({filtered.length} employees)</td>
                    <td className="px-3 py-2.5 text-xs text-center text-gray-600">{totals.effective}</td>
                    <td className="px-3 py-2.5 text-xs text-center text-emerald-700">{totals.present}</td>
                    <td className="px-3 py-2.5 text-xs text-center text-orange-600">{totals.half}</td>
                    <td className="px-3 py-2.5 text-xs text-center text-red-600">{totals.absent}</td>
                    <td className="px-3 py-2.5 text-xs text-center text-amber-600">{totals.incomplete}</td>
                    <td className="px-3 py-2.5 text-xs text-right font-mono text-gray-700">{Math.round(totals.hours * 10) / 10}</td>
                    <td className="px-3 py-2.5 text-xs text-center text-purple-600">{totals.claims}</td>
                    <td className="px-3 py-2.5 text-xs text-center text-pink-600">{filtered.reduce(function (sum, r) { return sum + (r.deductions || 0) }, 0) || '—'}</td>
                  </tr>
                </>
              )}
            </tbody>
          </table>
        </div>
      )}

      {showExport && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={function () { if (!exporting) setShowExport(false) }}>
          <div className="bg-white rounded-xl w-full max-w-sm shadow-xl" onClick={function (e) { e.stopPropagation() }}>
            <div className="px-5 py-4 border-b border-gray-100">
              <h3 className="text-sm font-bold text-gray-900">Export Report</h3>
              <p className="text-xs text-gray-500">Choose format and month range</p>
            </div>
            <div className="px-5 py-4 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1">From Month</label>
                  <select value={exportFromMonth} onChange={function (e) { setExportFromMonth(Number(e.target.value)) }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-700">
                    {MONTHS.map(function (m, i) { return <option key={i} value={i + 1}>{m}</option> })}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1">From Year</label>
                  <select value={exportFromYear} onChange={function (e) { setExportFromYear(Number(e.target.value)) }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-700">
                    {yearOptions.map(function (y) { return <option key={y} value={y}>{y}</option> })}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1">To Month</label>
                  <select value={exportToMonth} onChange={function (e) { setExportToMonth(Number(e.target.value)) }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-700">
                    {MONTHS.map(function (m, i) { return <option key={i} value={i + 1}>{m}</option> })}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1">To Year</label>
                  <select value={exportToYear} onChange={function (e) { setExportToYear(Number(e.target.value)) }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-700">
                    {yearOptions.map(function (y) { return <option key={y} value={y}>{y}</option> })}
                  </select>
                </div>
              </div>

              {(exportToYear < exportFromYear || (exportToYear === exportFromYear && exportToMonth < exportFromMonth)) && (
                <p className="text-xs text-red-600">To month must be same or after From month</p>
              )}

              <div>
                <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Format</label>
                <div className="flex rounded-lg border border-gray-200 overflow-hidden">
                  <button onClick={function () { setExportFormat('docx') }}
                    className={'flex-1 py-2 text-xs font-medium transition-colors ' + (exportFormat === 'docx' ? 'bg-slate-800 text-white' : 'bg-white text-gray-600 hover:bg-gray-50')}>
                    📄 Word (.docx)
                  </button>
                  <button onClick={function () { setExportFormat('xlsx') }}
                    className={'flex-1 py-2 text-xs font-medium transition-colors ' + (exportFormat === 'xlsx' ? 'bg-slate-800 text-white' : 'bg-white text-gray-600 hover:bg-gray-50')}>
                    📊 Excel (.xlsx)
                  </button>
                </div>
              </div>

              <div className="flex gap-2 pt-1">
                <button onClick={function () { setShowExport(false) }} disabled={exporting}
                  className="flex-1 py-2 text-sm text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-40">Cancel</button>
                <button onClick={exportFormat === 'xlsx' ? exportXLSX : exportCSV}
                  disabled={exporting || exportToYear < exportFromYear || (exportToYear === exportFromYear && exportToMonth < exportFromMonth)}
                  className="flex-1 py-2 text-sm text-white bg-slate-800 rounded-lg hover:bg-slate-900 disabled:opacity-40 transition-colors font-medium">
                  {exporting ? 'Exporting…' : (exportFormat === 'xlsx' ? '⬇ Export Excel' : '⬇ Export Word')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {drillEmp && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={function () { setDrillEmp(null) }}>
          <div className="bg-white rounded-xl w-full max-w-3xl shadow-xl max-h-[85vh] flex flex-col" onClick={function (e) { e.stopPropagation() }}>
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between shrink-0">
              <div>
                <h3 className="text-sm font-bold text-gray-900">{drillEmp.name}</h3>
                <p className="text-xs text-gray-500">{drillEmp.emp_code} · {MONTHS[month - 1]} {year}</p>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={exportDrillDocx} className="px-3 py-1.5 text-xs font-medium text-white bg-slate-800 rounded-lg hover:bg-slate-900 transition-colors">⬇ DOCX</button>
                <button onClick={function () { setDrillEmp(null) }} className="text-gray-400 hover:text-gray-700 text-lg">✕</button>
              </div>
            </div>
            <div className="overflow-y-auto flex-1">
              {drillLoading ? (
                <p className="text-sm text-gray-400 text-center py-12">Loading…</p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-gray-50">
                    <tr className="border-b border-gray-200">
                      <th className="px-3 py-2 text-left text-[10px] font-bold text-gray-500 uppercase">Date</th>
                      <th className="px-3 py-2 text-left text-[10px] font-bold text-gray-500 uppercase">Day</th>
                      <th className="px-3 py-2 text-center text-[10px] font-bold text-emerald-600 uppercase">In</th>
                      <th className="px-3 py-2 text-left text-[10px] font-bold text-emerald-600 uppercase">In Location</th>
                      <th className="px-3 py-2 text-center text-[10px] font-bold text-red-500 uppercase">Out</th>
                      <th className="px-3 py-2 text-left text-[10px] font-bold text-red-500 uppercase">Out Location</th>
                      <th className="px-3 py-2 text-right text-[10px] font-bold text-gray-500 uppercase">Hours</th>
                    </tr>
                  </thead>
                  <tbody>
                    {drillData.map(function (row) {
                      var isFuture = new Date(row.date + 'T23:59:59') > new Date()
                      var bgClass = isFuture ? ' text-gray-300' : !row.hasData ? ' bg-red-50/50' : ''
                      return (
                        <tr key={row.date} className={'border-b border-gray-100' + bgClass}>
                          <td className="px-3 py-1.5 text-xs font-mono text-gray-600">{row.date.slice(8)}</td>
                          <td className="px-3 py-1.5 text-xs text-gray-500">{row.day}</td>
                          <td className="px-3 py-1.5 text-xs text-center text-emerald-700 font-medium">{isFuture ? '' : fmtTime(row.punchIn)}</td>
                          <td className="px-3 py-1.5 text-xs text-left text-emerald-600/70 truncate max-w-[140px]" title={row.inLoc || ''}>{isFuture ? '' : (row.inLoc || '—')}</td>
                          <td className="px-3 py-1.5 text-xs text-center text-red-600 font-medium">{isFuture ? '' : fmtTime(row.punchOut)}</td>
                          <td className="px-3 py-1.5 text-xs text-left text-red-500/70 truncate max-w-[140px]" title={row.outLoc || ''}>{isFuture ? '' : (row.outLoc || '—')}</td>
                          <td className="px-3 py-1.5 text-xs text-right font-mono text-gray-700">{isFuture ? '' : (row.hours != null ? row.hours : '—')}</td>
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
        <div className="fixed bottom-6 right-6 bg-slate-800 text-white px-5 py-3 rounded-xl text-sm shadow-lg z-50">
          {toast}
        </div>
      )}
    </div>
  )
}