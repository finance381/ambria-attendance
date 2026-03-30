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
  var totals = { effective: 0, present: 0, half: 0, absent: 0, leave: 0, incomplete: 0, hours: 0 }
  filtered.forEach(function (r) {
    totals.effective += r.effective_days
    totals.present += r.days_present
    totals.half += r.days_half
    totals.absent += r.days_absent
    totals.leave += r.days_leave
    totals.incomplete += r.days_incomplete
    totals.hours += r.total_hours
  })

  // Casual incomplete count
  var casualIncompleteCount = filtered.filter(function (r) {
    return r.is_casual && r.days_incomplete > 0
  }).length

  // Export CSV
  function exportCSV() {
    var headers = ['Code', 'Name', 'Department', 'Designation', 'Type',
      'Effective Days', 'Present', 'Half Day', 'Absent', 'Leave', 'Incomplete', 'Total Hours']
    var csvRows = [headers.join(',')]

    filtered.forEach(function (r) {
      csvRows.push([
        r.emp_code,
        '"' + (r.name || '').replace(/"/g, '""') + '"',
        '"' + (r.department_name || '').replace(/"/g, '""') + '"',
        '"' + (r.designation || '').replace(/"/g, '""') + '"',
        r.is_casual ? 'Casual' : 'Permanent',
        r.effective_days,
        r.days_present,
        r.days_half,
        r.days_absent,
        r.days_leave,
        r.days_incomplete,
        r.total_hours
      ].join(','))
    })

    // Add totals row
    csvRows.push([
      '', '"TOTAL"', '', '', '',
      totals.effective, totals.present, totals.half,
      totals.absent, totals.leave, totals.incomplete,
      Math.round(totals.hours * 10) / 10
    ].join(','))

    var blob = new Blob([csvRows.join('\n')], { type: 'text/csv' })
    var a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'attendance_' + MONTHS[month - 1] + '_' + year + '.csv'
    a.click()
    showToast('CSV exported')
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
          onClick={exportCSV}
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
                <th className="text-center px-3 py-2.5 text-[10px] font-bold text-blue-600 uppercase tracking-wider">L</th>
                <th className="text-center px-3 py-2.5 text-[10px] font-bold text-amber-600 uppercase tracking-wider">Inc</th>
                <th className="text-right px-3 py-2.5 text-[10px] font-bold text-gray-500 uppercase tracking-wider">Hours</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={10} className="text-center py-8 text-sm text-gray-400 italic">No data for this period</td>
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
                        <td className="px-3 py-2 text-xs text-center font-semibold text-blue-600">{r.days_leave || '—'}</td>
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
                    <td className="px-3 py-2.5 text-xs text-center text-blue-600">{totals.leave}</td>
                    <td className="px-3 py-2.5 text-xs text-center text-amber-600">{totals.incomplete}</td>
                    <td className="px-3 py-2.5 text-xs text-right font-mono text-gray-700">{Math.round(totals.hours * 10) / 10}</td>
                  </tr>
                </>
              )}
            </tbody>
          </table>
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