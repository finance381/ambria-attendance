import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'

export default function LeaveBalances() {
  var [data, setData] = useState(null)
  var [departments, setDepartments] = useState([])
  var [deptFilter, setDeptFilter] = useState('')
  var [search, setSearch] = useState('')
  var [loading, setLoading] = useState(true)
  var [error, setError] = useState('')

  var loadData = useCallback(async function () {
    setLoading(true)
    var [balRes, deptRes] = await Promise.all([
      supabase.rpc('admin_all_leave_balances'),
      supabase.from('departments').select('id, name').eq('active', true).order('name')
    ])

    if (balRes.error || (balRes.data && balRes.data.error)) {
      setError((balRes.data && balRes.data.error) || balRes.error.message)
    } else {
      setData(balRes.data)
    }
    setDepartments(deptRes.data || [])
    setLoading(false)
  }, [])

  useEffect(function () { loadData() }, [loadData])

  var balances = (data && data.balances) || []

  var filtered = balances.filter(function (b) {
    if (deptFilter && String(b.department_id) !== deptFilter) return false
    if (search) {
      var q = search.toLowerCase()
      if (!b.name.toLowerCase().includes(q) && !b.emp_code.toLowerCase().includes(q)) return false
    }
    return true
  })

  var fyLabel = data ? data.fy_start.slice(0, 4) + '–' + data.fy_end.slice(0, 4) : ''

  return (
    <div>
      <h2 className="text-lg font-bold text-gray-900 mb-1">Leave Balances</h2>
      <p className="text-xs text-gray-500 mb-4">
        FY {fyLabel} · Quarter {data ? data.quarter_label : ''} ({data ? formatDate(data.quarter_start) + ' – ' + formatDate(data.quarter_end) : ''})
      </p>

      <div className="flex flex-wrap gap-3 mb-4">
        <div>
          <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1">Department</label>
          <select value={deptFilter} onChange={function (e) { setDeptFilter(e.target.value) }}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-700">
            <option value="">All</option>
            {departments.map(function (d) { return <option key={d.id} value={d.id}>{d.name}</option> })}
          </select>
        </div>
        <div className="flex-1 min-w-[200px]">
          <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1">Search</label>
          <input type="text" value={search} onChange={function (e) { setSearch(e.target.value) }}
            placeholder="Name or code…"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-700" />
        </div>
      </div>

      {error && (
        <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-sm text-red-600">{error}</p>
        </div>
      )}

      {loading ? (
        <p className="text-sm text-gray-400 text-center py-12">Loading…</p>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-12">No employees found</p>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-x-auto shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-3 py-2.5 text-[10px] font-bold text-gray-500 uppercase tracking-wider">Code</th>
                <th className="text-left px-3 py-2.5 text-[10px] font-bold text-gray-500 uppercase tracking-wider">Name</th>
                <th className="text-left px-3 py-2.5 text-[10px] font-bold text-gray-500 uppercase tracking-wider">Department</th>
                <th className="text-center px-3 py-2.5 text-[10px] font-bold text-emerald-600 uppercase tracking-wider" colSpan={2}>Annual Leave</th>
                <th className="text-center px-3 py-2.5 text-[10px] font-bold text-blue-600 uppercase tracking-wider" colSpan={2}>Quarterly</th>
                <th className="text-center px-3 py-2.5 text-[10px] font-bold text-orange-600 uppercase tracking-wider" colSpan={2}>Half Days</th>
              </tr>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th colSpan={3}></th>
                <th className="text-center px-2 py-1.5 text-[9px] font-semibold text-gray-400">Used</th>
                <th className="text-center px-2 py-1.5 text-[9px] font-semibold text-gray-400">Left</th>
                <th className="text-center px-2 py-1.5 text-[9px] font-semibold text-gray-400">Used</th>
                <th className="text-center px-2 py-1.5 text-[9px] font-semibold text-gray-400">Left</th>
                <th className="text-center px-2 py-1.5 text-[9px] font-semibold text-gray-400">Used</th>
                <th className="text-center px-2 py-1.5 text-[9px] font-semibold text-gray-400">Left</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(function (b) {
                return (
                  <tr key={b.employee_id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="px-3 py-2 text-xs text-gray-400 font-mono">{b.emp_code}</td>
                    <td className="px-3 py-2 font-medium text-gray-900">{b.name}</td>
                    <td className="px-3 py-2 text-xs text-gray-500">{b.department_name || '—'}</td>
                    <td className="px-2 py-2 text-xs text-center text-gray-700">{b.annual_used}<span className="text-gray-400 text-[10px]">/{b.annual_total}</span></td>
                    <td className={'px-2 py-2 text-xs text-center font-semibold ' + remainingColor(b.annual_remaining, b.annual_total)}>{b.annual_remaining}</td>
                    <td className="px-2 py-2 text-xs text-center text-gray-700">{b.quarter_used}<span className="text-gray-400 text-[10px]">/{b.quarter_total}</span></td>
                    <td className={'px-2 py-2 text-xs text-center font-semibold ' + remainingColor(b.quarter_remaining, b.quarter_total)}>{b.quarter_remaining}</td>
                    <td className="px-2 py-2 text-xs text-center text-gray-700">{b.half_used}<span className="text-gray-400 text-[10px]">/{b.half_annual_total}</span></td>
                    <td className={'px-2 py-2 text-xs text-center font-semibold ' + remainingColor(b.half_remaining, b.half_annual_total)}>{b.half_remaining}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function remainingColor(remaining, total) {
  if (total === 0) return 'text-gray-500'
  var pct = remaining / total
  if (pct > 0.4) return 'text-emerald-700'
  if (pct > 0.15) return 'text-amber-600'
  return 'text-red-600'
}

function formatDate(d) {
  if (!d) return ''
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
}