import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'

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

  var showToast = useCallback(function (msg) {
    setToast(msg)
    setTimeout(function () { setToast('') }, 2500)
  }, [])

  var loadData = useCallback(async function () {
    setLoading(true)
    var [summaryRes, deptRes] = await Promise.all([
      supabase.rpc('monthly_summary', {
        p_year: year,
        p_month: month,
        p_department_id: deptFilter ? Number(deptFilter) : null
      }),
      supabase.from('departments').select('id, name').eq('active', true).order('name')
    ])

    setRecords(summaryRes.data || [])
    setDepartments(deptRes.data || [])
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

  // Totals
  var totals = { effective: 0, present: 0, half: 0, absent: 0, incomplete: 0, hours: 0 }
  filtered.forEach(function (r) {
    totals.effective += r.effective_days
    totals.present += r.days_present
    totals.half += r.days_half
    totals.absent += r.days_absent
    totals.incomplete += r.days_incomplete
    totals.hours += r.total_hours
  })

  // Casual incomplete count
  var casualIncompleteCount = filtered.filter(function (r) {
    return r.is_casual && r.days_incomplete > 0
  }).length

  // Export CSV — supports multi-month range + search/dept filters
  async function exportCSV() {
    setExporting(true)

    // Build list of year/month pairs from → to
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

    // Apply same filters as on-screen table
    function applyFilters(rows) {
      return rows.filter(function (r) {
        if (!searchLower) return true
        return (r.name && r.name.toLowerCase().includes(searchLower)) ||
               (r.emp_code && r.emp_code.toLowerCase().includes(searchLower))
      })
    }

    var csvRows = []

    // Header block
    csvRows.push('GET YOUR VENUE EVENTS PVT LTD')
    csvRows.push('Attendance Report')

    var periodLabel
    if (isSingleMonth) {
      var daysInMonth = new Date(fy, fm, 0).getDate()
      periodLabel = '01 ' + MONTHS[fm - 1] + ' - ' + daysInMonth + ' ' + MONTHS[fm - 1] + ' ' + fy
    } else {
      var lastDay = new Date(ty, tm, 0).getDate()
      periodLabel = '01 ' + MONTHS[fm - 1] + ' ' + fy + ' - ' + lastDay + ' ' + MONTHS[tm - 1] + ' ' + ty
    }
    csvRows.push('Period: ' + periodLabel)
    csvRows.push('')

    // Column headers
    if (isSingleMonth) {
      csvRows.push(['S.No.', 'Name', 'Present', 'Absent', 'Half Days', 'Incomplete', 'Total Working Days'].join(','))
    } else {
      csvRows.push(['S.No.', 'Month', 'Name', 'Present', 'Absent', 'Half Days', 'Incomplete', 'Total Working Days'].join(','))
    }

    var grandTotals = { present: 0, absent: 0, half: 0, incomplete: 0, total: 0 }
    var serial = 1

    for (var i = 0; i < months.length; i++) {
      var m = months[i]
      var { data: mData } = await supabase.rpc('monthly_summary', {
        p_year: m.year, p_month: m.month,
        p_department_id: deptFilter ? Number(deptFilter) : null
      })

      var rows = applyFilters(mData || [])
      var monthLabel = MONTHS[m.month - 1] + ' ' + m.year

      rows.forEach(function (r) {
        var present = r.days_present || 0
        var absent = r.days_absent || 0
        var half = r.days_half || 0
        var incomplete = r.days_incomplete || 0
        var total = present + absent + half + incomplete

        grandTotals.present += present
        grandTotals.absent += absent
        grandTotals.half += half
        grandTotals.incomplete += incomplete
        grandTotals.total += total

        var row = [
          serial++,
          '"' + (r.name || '').replace(/"/g, '""') + '"',
          present, absent, half, incomplete, total
        ]
        if (!isSingleMonth) row.splice(1, 0, '"' + monthLabel + '"')
        csvRows.push(row.join(','))
      })
    }

    // If no rows matched
    if (serial === 1) {
      setExporting(false)
      showToast('No employees match current filters')
      return
    }

    // Totals row
    csvRows.push('')
    var totRow = isSingleMonth
      ? ['', '"TOTAL"', grandTotals.present, grandTotals.absent, grandTotals.half, grandTotals.incomplete, grandTotals.total]
      : ['', '', '"TOTAL"', grandTotals.present, grandTotals.absent, grandTotals.half, grandTotals.incomplete, grandTotals.total]
    csvRows.push(totRow.join(','))

    var blob = new Blob([csvRows.join('\n')], { type: 'text/csv' })
    var a = document.createElement('a')
    a.href = URL.createObjectURL(blob)

    var filterSuffix = searchLower ? '_' + searchLower.replace(/[^a-z0-9]/g, '') : ''
    var fileName = isSingleMonth
      ? 'attendance_' + MONTHS[fm - 1] + '_' + fy + filterSuffix + '.csv'
      : 'attendance_' + MONTHS[fm - 1] + fy + '_to_' + MONTHS[tm - 1] + ty + filterSuffix + '.csv'
    a.download = fileName
    a.click()

    setExporting(false)
    setShowExport(false)
    showToast('CSV exported — ' + (serial - 1) + ' row' + (serial - 1 !== 1 ? 's' : ''))
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
        <button
          onClick={function () { setShowExport(true); setExportFromYear(year); setExportFromMonth(month); setExportToYear(year); setExportToMonth(month) }}
          disabled={loading || filtered.length === 0}
          className="px-4 py-2 text-sm text-white bg-slate-800 rounded-lg hover:bg-slate-900 disabled:opacity-40 transition-colors font-medium"
        >
          ⬇ Export CSV
        </button>
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
                <th className="text-left px-3 py-2.5 text-[10px] font-bold text-gray-500 uppercase tracking-wider">Code</th>
                <th className="text-left px-3 py-2.5 text-[10px] font-bold text-gray-500 uppercase tracking-wider">Name</th>
                <th className="text-left px-3 py-2.5 text-[10px] font-bold text-gray-500 uppercase tracking-wider">Department</th>
                <th className="text-center px-3 py-2.5 text-[10px] font-bold text-gray-500 uppercase tracking-wider">Days</th>
                <th className="text-center px-3 py-2.5 text-[10px] font-bold text-emerald-600 uppercase tracking-wider">P</th>
                <th className="text-center px-3 py-2.5 text-[10px] font-bold text-orange-600 uppercase tracking-wider">H</th>
                <th className="text-center px-3 py-2.5 text-[10px] font-bold text-red-600 uppercase tracking-wider">A</th>
                <th className="text-center px-3 py-2.5 text-[10px] font-bold text-amber-600 uppercase tracking-wider">Inc</th>
                <th className="text-right px-3 py-2.5 text-[10px] font-bold text-gray-500 uppercase tracking-wider">Hours</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={9} className="text-center py-8 text-sm text-gray-400 italic">No data for this period</td>
                </tr>
              ) : (
                <>
                  {filtered.map(function (r) {
                    var hasIssue = r.days_incomplete > 0
                    return (
                      <tr key={r.employee_id} className={'border-b border-gray-100 hover:bg-gray-50' + (hasIssue ? ' bg-amber-50/40' : '')}>
                        <td className="px-3 py-2 text-xs text-gray-400 font-mono">{r.emp_code}</td>
                        <td className="px-3 py-2 font-medium text-gray-900">
                          {r.name}
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
                      </tr>
                    )
                  })}
                  {/* Totals row */}
                  <tr className="bg-gray-50 border-t-2 border-gray-300 font-bold">
                    <td className="px-3 py-2.5 text-xs text-gray-500" colSpan={3}>TOTAL ({filtered.length} employees)</td>
                    <td className="px-3 py-2.5 text-xs text-center text-gray-600">{totals.effective}</td>
                    <td className="px-3 py-2.5 text-xs text-center text-emerald-700">{totals.present}</td>
                    <td className="px-3 py-2.5 text-xs text-center text-orange-600">{totals.half}</td>
                    <td className="px-3 py-2.5 text-xs text-center text-red-600">{totals.absent}</td>
                    <td className="px-3 py-2.5 text-xs text-center text-amber-600">{totals.incomplete}</td>
                    <td className="px-3 py-2.5 text-xs text-right font-mono text-gray-700">{Math.round(totals.hours * 10) / 10}</td>
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
              <h3 className="text-sm font-bold text-gray-900">Export CSV</h3>
              <p className="text-xs text-gray-500">Select month range for export</p>
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

              <div className="flex gap-2 pt-1">
                <button onClick={function () { setShowExport(false) }} disabled={exporting}
                  className="flex-1 py-2 text-sm text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-40">Cancel</button>
                <button onClick={exportCSV}
                  disabled={exporting || exportToYear < exportFromYear || (exportToYear === exportFromYear && exportToMonth < exportFromMonth)}
                  className="flex-1 py-2 text-sm text-white bg-slate-800 rounded-lg hover:bg-slate-900 disabled:opacity-40 transition-colors font-medium">
                  {exporting ? 'Exporting…' : '⬇ Export'}
                </button>
              </div>
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