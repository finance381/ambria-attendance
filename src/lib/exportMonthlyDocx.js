import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  AlignmentType, BorderStyle, WidthType, ShadingType
} from 'docx'
import { supabase } from './supabase'
import { FIELD_GROUPS } from '../components/ExportFieldPicker'

/* ── style tokens ──────────────────────────────────────── */

var BORDER = { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' }
var BORDERS = { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER }
var CELL_MARGINS = { top: 60, bottom: 60, left: 80, right: 80 }
var HDR_FILL = { fill: '1E293B', type: ShadingType.CLEAR }
var ALT_FILL = { fill: 'F8FAFC', type: ShadingType.CLEAR }

function hdrCell(text, width) {
  return new TableCell({
    borders: BORDERS, width: { size: width, type: WidthType.DXA },
    shading: HDR_FILL, margins: CELL_MARGINS,
    children: [new Paragraph({ alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: text, bold: true, font: 'Arial', size: 16, color: 'FFFFFF' })]
    })]
  })
}

function dataCell(text, width, opts) {
  var align = (opts && opts.right) ? AlignmentType.RIGHT : AlignmentType.CENTER
  if (opts && opts.left) align = AlignmentType.LEFT
  var shading = (opts && opts.alt) ? ALT_FILL : undefined
  var color = (opts && opts.color) || '334155'
  return new TableCell({
    borders: BORDERS, width: { size: width, type: WidthType.DXA },
    shading: shading, margins: CELL_MARGINS,
    children: [new Paragraph({ alignment: align,
      children: [new TextRun({ text: String(text != null ? text : '—'), font: 'Arial', size: 16, color: color })]
    })]
  })
}

function secsToTime(secs) {
  if (secs == null) return '—'
  var h = Math.floor(secs / 3600)
  var m = Math.floor((secs % 3600) / 60)
  var ampm = h >= 12 ? 'PM' : 'AM'
  h = h % 12 || 12
  return h + ':' + String(m).padStart(2, '0') + ' ' + ampm
}

function fmtTime(ts) {
  if (!ts) return '—'
  var d = new Date(ts)
  var h = d.getHours()
  var m = String(d.getMinutes()).padStart(2, '0')
  var ampm = h >= 12 ? 'PM' : 'AM'
  h = h % 12 || 12
  return h + ':' + m + ' ' + ampm
}

function pctColor(v) { return v < 50 ? 'DC2626' : v < 75 ? 'D97706' : '059669' }
function hrsColor(v) { return v < 6 ? 'DC2626' : v < 8 ? 'D97706' : '059669' }

/* ── data fetchers ─────────────────────────────────────── */

async function fetchMonthly(fromDate, toDate, deptId) {
  var { data } = await supabase.rpc('monthly_summary_range', {
    p_from_date: fromDate, p_to_date: toDate,
    p_department_id: deptId || null,
  })
  return data || []
}

async function fetchTiming(fromDate, toDate, deptId) {
  var { data } = await supabase.rpc('avg_punch_times', {
    p_from_date: fromDate, p_to_date: toDate,
    p_department_id: deptId || null,
  })
  return data || []
}

async function fetchDAR(fromDate, toDate, deptId) {
  var { data } = await supabase.rpc('dar_compliance', {
    p_from_date: fromDate, p_to_date: toDate,
    p_department_id: deptId || null,
  })
  return data || []
}

async function fetchLeaves() {
  var { data } = await supabase.rpc('admin_all_leave_balances')
  return data || []
}

async function fetchClaimsPenalty(fyStart, fyEnd, claimLimit) {
  var { data: claims } = await supabase
    .from('missed_claims')
    .select('employee_id, created_at, status')
    .gte('attendance_date', fyStart)
    .lte('attendance_date', fyEnd)
    .neq('status', 'rejected')

  var byEmp = {}
  ;(claims || []).forEach(function (c) {
    if (!byEmp[c.employee_id]) byEmp[c.employee_id] = {}
    var ist = new Date(c.created_at)
    var mk = ist.getFullYear() + '-' + String(ist.getMonth() + 1).padStart(2, '0')
    if (!byEmp[c.employee_id][mk]) byEmp[c.employee_id][mk] = 0
    byEmp[c.employee_id][mk]++
  })

  var result = {}
  Object.keys(byEmp).forEach(function (eid) {
    var months = byEmp[eid]
    var total = 0, over = 0
    Object.keys(months).forEach(function (m) {
      total += months[m]
      if (months[m] > claimLimit) over += (months[m] - claimLimit)
    })
    result[eid] = { total: total, over: over, penalty: over * 500 }
  })
  return result
}

async function fetchClaimLimit() {
  var { data } = await supabase.from('app_config').select('value').eq('key', 'claim_limit').maybeSingle()
  if (data && data.value) {
    try { return parseInt(String(data.value).replace(/"/g, ''), 10) || 4 } catch (e) {}
  }
  return 4
}

async function fetchPunches(employeeIds, fromDate, toDate) {
  var all = []
  // Supabase has 1000 row default; batch by employee chunks
  for (var i = 0; i < employeeIds.length; i += 20) {
    var batch = employeeIds.slice(i, i + 20)
    var { data } = await supabase
      .from('punches')
      .select('employee_id, attendance_date, punch_type, punched_at, location_name')
      .in('employee_id', batch)
      .gte('attendance_date', fromDate)
      .lte('attendance_date', toDate)
      .order('attendance_date', { ascending: true })
      .order('punched_at', { ascending: true })
      .limit(1000)
    if (data) all = all.concat(data)
  }
  return all
}

/* ── column definitions per group ──────────────────────── */

function getColumns(selectedKeys) {
  var cols = []

  // Always include name + code + dept
  cols.push({ key: 'emp_code', label: 'Code', width: 900, getter: function (r) { return r.emp_code }, left: true })
  cols.push({ key: 'name', label: 'Name', width: 1600, getter: function (r) { return r.name }, left: true })
  cols.push({ key: 'dept', label: 'Dept', width: 1200, getter: function (r) { return r.department_name || '—' }, left: true })

  if (selectedKeys.indexOf('attendance') >= 0) {
    cols.push({ key: 'att_pct', label: 'Att%', width: 650, getter: function (r) { return r.attendance_pct != null ? Math.round(r.attendance_pct) + '%' : '—' }, colorFn: function (r) { return pctColor(r.attendance_pct || 0) } })
    cols.push({ key: 'present', label: 'Present', width: 650, getter: function (r) { return r.days_present || 0 } })
    cols.push({ key: 'half', label: 'Half', width: 550, getter: function (r) { return r.days_half || 0 } })
    cols.push({ key: 'absent', label: 'Absent', width: 600, getter: function (r) { return r.days_absent || 0 }, colorFn: function (r) { return (r.days_absent || 0) > 3 ? 'DC2626' : '334155' } })
    cols.push({ key: 'incomplete', label: 'Inc', width: 550, getter: function (r) { return r.days_incomplete || 0 } })
  }

  if (selectedKeys.indexOf('hours') >= 0) {
    cols.push({ key: 'total_hours', label: 'Total Hrs', width: 750, getter: function (r) { return r.total_hours ? Number(r.total_hours).toFixed(0) + 'h' : '—' } })
    cols.push({ key: 'avg_daily', label: 'Avg/Day', width: 700, getter: function (r) {
      var d = (r.days_present || 0) + (r.days_half || 0)
      return d > 0 ? (r.total_hours / d).toFixed(1) + 'h' : '—'
    }, colorFn: function (r) {
      var d = (r.days_present || 0) + (r.days_half || 0)
      var avg = d > 0 ? r.total_hours / d : 0
      return hrsColor(avg)
    }})
  }

  if (selectedKeys.indexOf('timing') >= 0) {
    cols.push({ key: 'avg_in', label: 'Avg In', width: 800, getter: function (r) { return secsToTime(r._avg_in_secs) } })
    cols.push({ key: 'avg_out', label: 'Avg Out', width: 800, getter: function (r) { return secsToTime(r._avg_out_secs) } })
    cols.push({ key: 'min_hrs', label: 'Min Hrs', width: 650, getter: function (r) { return r._min_hours != null ? Number(r._min_hours).toFixed(1) : '—' } })
    cols.push({ key: 'max_hrs', label: 'Max Hrs', width: 650, getter: function (r) { return r._max_hours != null ? Number(r._max_hours).toFixed(1) : '—' } })
  }

  if (selectedKeys.indexOf('dar') >= 0) {
    cols.push({ key: 'dar_pct', label: 'DAR%', width: 650, getter: function (r) {
      if (!r._dar_present || r._dar_present === 0) return '—'
      return Math.round((r._dar_submitted || 0) / r._dar_present * 100) + '%'
    }, colorFn: function (r) {
      if (!r._dar_present) return '334155'
      var p = (r._dar_submitted || 0) / r._dar_present * 100
      return pctColor(p)
    }})
    cols.push({ key: 'dar_submitted', label: 'DAR Sub', width: 650, getter: function (r) { return r._dar_submitted || 0 } })
    cols.push({ key: 'dar_missing', label: 'DAR Miss', width: 650, getter: function (r) {
      return Math.max(0, (r._dar_present || 0) - (r._dar_submitted || 0))
    }, colorFn: function (r) {
      var m = Math.max(0, (r._dar_present || 0) - (r._dar_submitted || 0))
      return m > 0 ? 'DC2626' : '334155'
    }})
  }

  if (selectedKeys.indexOf('claims') >= 0) {
    cols.push({ key: 'claims_used', label: 'Claims', width: 600, getter: function (r) {
      return (r.claims_used || 0) + '/' + (r.claims_limit || 0)
    }})
    cols.push({ key: 'claims_over', label: 'Over', width: 500, getter: function (r) { return r.claims_over_limit || 0 }, colorFn: function (r) { return (r.claims_over_limit || 0) > 0 ? 'DC2626' : '334155' } })
  }

  if (selectedKeys.indexOf('leaves') >= 0) {
    cols.push({ key: 'leave_used', label: 'Leave Used', width: 750, getter: function (r) { return (r._leave_used || 0) + '/' + (r._leave_total || 0) } })
    cols.push({ key: 'leave_rem', label: 'Remaining', width: 750, getter: function (r) { return r._leave_remaining || 0 }, colorFn: function (r) {
      if (!r._leave_total) return '334155'
      var pct = (r._leave_remaining || 0) / r._leave_total * 100
      return pctColor(pct)
    }})
    cols.push({ key: 'half_bal', label: 'Half Bal', width: 650, getter: function (r) {
      return (r._half_used || 0) + '/' + (r._half_total || 0)
    }})
  }

  if (selectedKeys.indexOf('deductions') >= 0) {
    cols.push({ key: 'leave_ded', label: 'Leave Ded', width: 700, getter: function (r) { return r._leave_deductions || 0 }, colorFn: function (r) { return (r._leave_deductions || 0) > 0 ? 'DC2626' : '334155' } })
    cols.push({ key: 'claims_over_fy', label: 'Claims Over', width: 750, getter: function (r) { return r._claims_over || 0 }, colorFn: function (r) { return (r._claims_over || 0) > 0 ? 'DC2626' : '334155' } })
    cols.push({ key: 'claim_penalty', label: '₹ Penalty', width: 750, getter: function (r) {
      var p = r._claims_penalty || 0
      return p > 0 ? '₹' + p.toLocaleString('en-IN') : '—'
    }, colorFn: function (r) { return (r._claims_penalty || 0) > 0 ? '7C3AED' : '334155' } })
  }

  return cols
}

/* ── daily punch detail pages ──────────────────────────── */

function buildDailyPunchPages(employees, punchData, includeLocations) {
  var pages = []
  var byEmp = {}
  punchData.forEach(function (p) {
    if (!byEmp[p.employee_id]) byEmp[p.employee_id] = []
    byEmp[p.employee_id].push(p)
  })

  var dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

  employees.forEach(function (emp) {
    var punches = byEmp[emp.employee_id] || []
    if (punches.length === 0) return

    // Group by date
    var byDate = {}
    punches.forEach(function (p) {
      var d = p.attendance_date
      if (!byDate[d]) byDate[d] = { inTime: null, outTime: null, inLoc: null, outLoc: null }
      if (p.punch_type === 'in') {
        byDate[d].inTime = fmtTime(p.punched_at)
        byDate[d].inLoc = p.location_name || '—'
      }
      if (p.punch_type === 'out') {
        byDate[d].outTime = fmtTime(p.punched_at)
        byDate[d].outLoc = p.location_name || '—'
      }
    })

    var dates = Object.keys(byDate).sort()

    // Build mini table
    var detailCols = [
      { label: 'Date', width: 1000 },
      { label: 'Day', width: 700 },
      { label: 'In', width: 900 },
    ]
    if (includeLocations) detailCols.push({ label: 'In Location', width: 1800 })
    detailCols.push({ label: 'Out', width: 900 })
    if (includeLocations) detailCols.push({ label: 'Out Location', width: 1800 })

    var colWidths = detailCols.map(function (c) { return c.width })
    var tableW = colWidths.reduce(function (s, w) { return s + w }, 0)

    var headerRow = new TableRow({
      children: detailCols.map(function (c) { return hdrCell(c.label, c.width) })
    })

    var rows = [headerRow]
    dates.forEach(function (dateStr, i) {
      var d = byDate[dateStr]
      var dt = new Date(dateStr + 'T00:00:00')
      var dayName = dayNames[dt.getDay()]
      var alt = i % 2 === 1
      var isWeekend = dt.getDay() === 0 || dt.getDay() === 6

      var cells = [
        dataCell(dateStr.slice(5), colWidths[0], { alt: alt }),
        dataCell(dayName, colWidths[1], { alt: alt, color: isWeekend ? 'DC2626' : '334155' }),
        dataCell(d.inTime || '—', colWidths[2], { alt: alt, color: '2563EB' }),
      ]
      var ci = 3
      if (includeLocations) {
        cells.push(dataCell(d.inLoc === '—' ? '— (no GPS)' : d.inLoc, colWidths[ci], { alt: alt, left: true, color: d.inLoc === '—' ? 'A0AEC0' : '059669' }))
        ci++
      }
      cells.push(dataCell(d.outTime || '—', colWidths[ci], { alt: alt, color: 'DC2626' }))
      ci++
      if (includeLocations) {
        cells.push(dataCell(d.outLoc === '—' ? '— (no GPS)' : d.outLoc, colWidths[ci], { alt: alt, left: true, color: d.outLoc === '—' ? 'A0AEC0' : '059669' }))
      }

      rows.push(new TableRow({ children: cells }))
    })

    pages.push(
      new Paragraph({
        spacing: { before: 300, after: 80 },
        children: [
          new TextRun({ text: emp.name, bold: true, font: 'Arial', size: 22, color: '0F172A' }),
          new TextRun({ text: '  ' + emp.emp_code + '  •  ' + (emp.department_name || ''), font: 'Arial', size: 18, color: '64748B' }),
        ]
      }),
      new Table({ width: { size: tableW, type: WidthType.DXA }, columnWidths: colWidths, rows: rows })
    )
  })

  return pages
}

/* ── main export function ──────────────────────────────── */

export async function exportMonthlyDocx(selectedKeys, opts) {
  // opts: { fromDate, toDate, deptId, deptName, employees (array with employee_id, emp_code, name, department_name) }

  // Determine which sources to fetch
  var needSources = {}
  FIELD_GROUPS.forEach(function (g) {
    if (selectedKeys.indexOf(g.key) >= 0) needSources[g.source] = true
  })

  // Parallel fetch
  var monthlyP = needSources['monthly_summary_range'] ? fetchMonthly(opts.fromDate, opts.toDate, opts.deptId) : Promise.resolve([])
  var timingP = needSources['avg_punch_times'] ? fetchTiming(opts.fromDate, opts.toDate, opts.deptId) : Promise.resolve([])
  var darP = needSources['dar_compliance'] ? fetchDAR(opts.fromDate, opts.toDate, opts.deptId) : Promise.resolve([])
  var leavesP = needSources['admin_all_leave_balances'] ? fetchLeaves() : Promise.resolve({})

  var needPunches = selectedKeys.indexOf('daily_punches') >= 0 || selectedKeys.indexOf('locations') >= 0

  var results = await Promise.all([monthlyP, timingP, darP, leavesP])
  var monthlyData = results[0]
  var timingData = results[1]
  var darData = results[2]
  var leavesRaw = results[3]
  var leavesData = (leavesRaw && leavesRaw.balances) || []
  var fyStart = (leavesRaw && leavesRaw.fy_start) || null
  var fyEnd = (leavesRaw && leavesRaw.fy_end) || null

  // Fetch claims penalty data if deductions selected
  var claimsPenaltyMap = {}
  if (selectedKeys.indexOf('deductions') >= 0 && fyStart && fyEnd) {
    var claimLimit = await fetchClaimLimit()
    claimsPenaltyMap = await fetchClaimsPenalty(fyStart, fyEnd, claimLimit)
  }

  // Build employee_id lookup from monthly (primary)
  var empMap = {}
  monthlyData.forEach(function (r) {
    empMap[r.employee_id] = { ...r }
  })

  // Merge timing data
  var timingMap = {}
  timingData.forEach(function (r) { timingMap[r.employee_id] = r })

  // Merge DAR data
  var darMap = {}
  darData.forEach(function (r) { darMap[r.employee_id] = r })

  // Merge leave data
  var leaveMap = {}
  leavesData.forEach(function (r) { leaveMap[r.employee_id] = r })

  // Enrich empMap with merged data
  Object.keys(empMap).forEach(function (eid) {
    var r = empMap[eid]
    var t = timingMap[eid] || {}
    r._avg_in_secs = t.avg_in_secs
    r._avg_out_secs = t.avg_out_secs
    r._min_hours = t.min_hours
    r._max_hours = t.max_hours

    var d = darMap[eid] || {}
    r._dar_submitted = d.days_submitted
    r._dar_present = d.days_present

    var l = leaveMap[eid] || {}
    r._leave_used = l.annual_used
    r._leave_total = l.annual_total
    r._leave_remaining = l.annual_remaining
    r._half_used = l.half_used
    r._half_total = l.half_annual_total
    r._leave_deductions = l.deductions || 0

    var cp = claimsPenaltyMap[eid] || {}
    r._claims_over = cp.over || 0
    r._claims_penalty = cp.penalty || 0
  })

  // If no monthly data but we have other sources, build from timing or DAR
  if (monthlyData.length === 0) {
    timingData.forEach(function (r) {
      if (!empMap[r.employee_id]) {
        empMap[r.employee_id] = { employee_id: r.employee_id, emp_code: r.emp_code, name: r.name, department_name: r.department_name }
      }
    })
    darData.forEach(function (r) {
      if (!empMap[r.employee_id]) {
        empMap[r.employee_id] = { employee_id: r.employee_id, emp_code: r.emp_code, name: r.name, department_name: r.department_name }
      }
    })
  }

  var employees = Object.values(empMap).filter(function (r) { return !r.is_casual })
  if (opts.selectedEmployeeIds) {
    employees = employees.filter(function (r) {
      return opts.selectedEmployeeIds.indexOf(r.employee_id) >= 0
    })
  }
  employees.sort(function (a, b) { return (a.emp_code || '').localeCompare(b.emp_code || '') })

  // Fetch punches if needed
  var punchData = []
  if (needPunches && employees.length > 0) {
    var ids = employees.map(function (e) { return e.employee_id })
    punchData = await fetchPunches(ids, opts.fromDate, opts.toDate)
  }

  // Build columns
  var cols = getColumns(selectedKeys)
  var colWidths = cols.map(function (c) { return c.width })
  var tableWidth = colWidths.reduce(function (s, w) { return s + w }, 0)

  // Header row
  var headerRow = new TableRow({
    tableHeader: true,
    children: cols.map(function (c) { return hdrCell(c.label, c.width) })
  })

  // Data rows
  var dataRows = [headerRow]
  employees.forEach(function (emp, i) {
    var alt = i % 2 === 1
    var cells = cols.map(function (c) {
      var val = c.getter(emp)
      var color = c.colorFn ? c.colorFn(emp) : '334155'
      return dataCell(val, c.width, { alt: alt, color: color, left: c.left })
    })
    dataRows.push(new TableRow({ children: cells }))
  })

  // Summary stats
  var statLines = []
  statLines.push(statLine('Employees', employees.length))
  statLines.push(statLine('Period', opts.fromDate + ' to ' + opts.toDate))
  if (opts.deptName) statLines.push(statLine('Department', opts.deptName))

  if (selectedKeys.indexOf('attendance') >= 0) {
    var totalPresent = 0, totalEff = 0, totalHalf = 0
    employees.forEach(function (r) {
      totalPresent += (r.days_present || 0)
      totalHalf += (r.days_half || 0)
      totalEff += (r.effective_days || 0)
    })
    var overallAtt = totalEff > 0 ? ((totalPresent + totalHalf * 0.5) / totalEff * 100).toFixed(1) + '%' : '—'
    statLines.push(statLine('Overall Attendance', overallAtt))
  }

  if (selectedKeys.indexOf('hours') >= 0) {
    var totalHrs = 0, totalWorkers = 0
    employees.forEach(function (r) {
      var d = (r.days_present || 0) + (r.days_half || 0)
      if (d > 0) { totalHrs += r.total_hours / d; totalWorkers++ }
    })
    var avgDaily = totalWorkers > 0 ? (totalHrs / totalWorkers).toFixed(1) + 'h' : '—'
    statLines.push(statLine('Avg Daily Hours', avgDaily))
  }

  if (selectedKeys.indexOf('deductions') >= 0) {
    var totLeaveDed = 0, totClaimsOver = 0, totClaimPenalty = 0
    employees.forEach(function (r) {
      totLeaveDed += (r._leave_deductions || 0)
      totClaimsOver += (r._claims_over || 0)
      totClaimPenalty += (r._claims_penalty || 0)
    })
    statLines.push(statLine('FY Leave Deductions', totLeaveDed + ' days'))
    statLines.push(statLine('FY Over-Limit Claims', totClaimsOver))
    statLines.push(statLine('Total Claims Penalty', '₹' + totClaimPenalty.toLocaleString('en-IN')))
  }

  // Sections label
  var sectionsUsed = selectedKeys.map(function (k) {
    var g = FIELD_GROUPS.find(function (fg) { return fg.key === k })
    return g ? g.label : k
  }).join(', ')

  // Build doc children
  var docChildren = [
    new Paragraph({
      spacing: { after: 100 },
      children: [new TextRun({ text: 'Ambria Attendance — Monthly Report', bold: true, font: 'Arial', size: 28, color: '0F172A' })]
    }),
    new Paragraph({
      spacing: { after: 40 },
      children: [new TextRun({ text: opts.fromDate + '  to  ' + opts.toDate + '   •   ' + (opts.deptName || 'All Departments'), font: 'Arial', size: 20, color: '64748B' })]
    }),
    new Paragraph({
      spacing: { after: 200 },
      children: [new TextRun({ text: 'Sections: ' + sectionsUsed, font: 'Arial', size: 16, color: '94A3B8', italics: true })]
    }),
    ...statLines,
    new Paragraph({ spacing: { after: 120 }, children: [] }),
    new Table({ width: { size: tableWidth, type: WidthType.DXA }, columnWidths: colWidths, rows: dataRows }),
  ]

  // Add daily punch detail pages if selected
  if (needPunches && punchData.length > 0) {
    var includeLocations = selectedKeys.indexOf('locations') >= 0
    docChildren.push(
      new Paragraph({ spacing: { before: 400, after: 100 },
        children: [new TextRun({ text: 'Daily Punch Detail', bold: true, font: 'Arial', size: 24, color: '0F172A' })]
      })
    )
    var detailPages = buildDailyPunchPages(employees, punchData, includeLocations)
    docChildren = docChildren.concat(detailPages)
  }

  // Footer
  docChildren.push(
    new Paragraph({ spacing: { before: 200 }, children: [] }),
    new Paragraph({
      children: [new TextRun({ text: 'Generated on ' + new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }), font: 'Arial', size: 16, color: '94A3B8', italics: true })]
    })
  )

  var doc = new Document({
    styles: { default: { document: { run: { font: 'Arial', size: 20 } } } },
    sections: [{
      properties: {
        page: {
          size: { width: 15840, height: 12240, orientation: 'landscape' },
          margin: { top: 720, right: 720, bottom: 720, left: 720 }
        }
      },
      children: docChildren
    }]
  })

  var blob = await Packer.toBlob(doc)
  var url = URL.createObjectURL(blob)
  var a = document.createElement('a')
  a.href = url
  a.download = 'monthly_report_' + opts.fromDate + '_to_' + opts.toDate + '.docx'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

/* ── helpers ───────────────────────────────────────────── */

function statLine(label, value) {
  return new Paragraph({
    spacing: { after: 40 },
    children: [
      new TextRun({ text: label + ':  ', font: 'Arial', size: 20, color: '64748B' }),
      new TextRun({ text: String(value), bold: true, font: 'Arial', size: 20, color: '0F172A' }),
    ]
  })
}