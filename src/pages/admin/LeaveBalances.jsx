import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'

export default function LeaveBalances() {
  var [data, setData] = useState(null)
  var [departments, setDepartments] = useState([])
  var [deptFilter, setDeptFilter] = useState('')
  var [search, setSearch] = useState('')
  var [loading, setLoading] = useState(true)
  var [error, setError] = useState('')
  var [sortCol, setSortCol] = useState('name')
  var [sortDir, setSortDir] = useState('asc')

  var loadData = useCallback(async function () {
    setLoading(true)
    var [cacheRes, deptRes, configRes] = await Promise.all([
      supabase.from('leave_balance_cache').select('*'),
      supabase.from('departments').select('id, name').eq('active', true).order('name'),
      supabase.from('app_config').select('key, value').in('key', ['annual_leaves', 'annual_half_days'])
    ])

    if (cacheRes.error) {
      setError(cacheRes.error.message)
    } else {
      var deptMap = {}
      ;(deptRes.data || []).forEach(function (d) { deptMap[d.id] = d.name })
      var configs = {}
      ;(configRes.data || []).forEach(function (c) {
        var v = c.value; if (typeof v === 'string') v = v.replace(/^"|"$/g, '')
        configs[c.key] = parseInt(v) || 0
      })
      var annualTotal = configs['annual_leaves'] || 76
      var halfTotal = configs['annual_half_days'] || 6

      // Compute FY and quarter from today
      var today = new Date()
      var fy_start, fy_end, q_start, q_end, q_label
      var yr = today.getFullYear(), mo = today.getMonth() + 1
      if (mo >= 4) { fy_start = yr + '-04-01'; fy_end = (yr + 1) + '-03-31' }
      else { fy_start = (yr - 1) + '-04-01'; fy_end = yr + '-03-31' }
      if (mo >= 4 && mo <= 6) { q_start = yr + '-04-01'; q_end = yr + '-06-30'; q_label = 'Q1' }
      else if (mo >= 7 && mo <= 9) { q_start = yr + '-07-01'; q_end = yr + '-09-30'; q_label = 'Q2' }
      else if (mo >= 10 && mo <= 12) { q_start = yr + '-10-01'; q_end = yr + '-12-31'; q_label = 'Q3' }
      else { q_start = yr + '-01-01'; q_end = yr + '-03-31'; q_label = 'Q4' }

      var balances = (cacheRes.data || []).map(function (r) {
        return {
          employee_id: r.employee_id,
          emp_code: r.emp_code,
          name: r.name,
          department_id: r.department_id,
          department_name: deptMap[r.department_id] || '—',
          annual_total: annualTotal,
          annual_used: r.leaves_used || 0,
          annual_remaining: r.annual_remaining || 0,
          quarter_total: r.quarterly_quota || Math.ceil(annualTotal / 4),
          quarter_used: r.quarterly_used || 0,
          quarter_remaining: r.quarterly_remaining || 0,
          half_annual_total: halfTotal,
          half_used: r.half_days_used || 0,
          half_remaining: halfTotal - (r.half_days_used || 0)
        }
      })

      setData({
        fy_start: fy_start, fy_end: fy_end,
        quarter_start: q_start, quarter_end: q_end, quarter_label: q_label,
        balances: balances, computed_at: (cacheRes.data[0] || {}).computed_at
      })
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

  function handleSort(col) {
    if (sortCol === col) { setSortDir(sortDir === 'asc' ? 'desc' : 'asc') }
    else { setSortCol(col); setSortDir('asc') }
  }
  filtered.sort(function (a, b) {
    var va, vb
    switch (sortCol) {
      case 'emp_code': va = a.emp_code; vb = b.emp_code; break
      case 'name': va = a.name; vb = b.name; break
      case 'department_name': va = a.department_name || ''; vb = b.department_name || ''; break
      case 'annual_used': va = a.annual_used; vb = b.annual_used; break
      case 'annual_remaining': va = a.annual_remaining; vb = b.annual_remaining; break
      case 'quarter_used': va = a.quarter_used; vb = b.quarter_used; break
      case 'quarter_remaining': va = a.quarter_remaining; vb = b.quarter_remaining; break
      case 'half_used': va = a.half_used; vb = b.half_used; break
      case 'half_remaining': va = a.half_remaining; vb = b.half_remaining; break
      default: va = a.name; vb = b.name
    }
    if (typeof va === 'string') {
      var cmp = va.localeCompare(vb)
      return sortDir === 'asc' ? cmp : -cmp
    }
    return sortDir === 'asc' ? va - vb : vb - va
  })

  var fyLabel = data ? data.fy_start.slice(0, 4) + '–' + data.fy_end.slice(0, 4) : ''

  return (
    <div>
      <h2 className="text-lg font-bold text-gray-900 mb-1">Leave Balances</h2>
      <p className="text-xs text-gray-500 mb-1">
        FY {fyLabel} · Quarter {data ? data.quarter_label : ''} ({data ? formatDate(data.quarter_start) + ' – ' + formatDate(data.quarter_end) : ''})
      </p>
      <div className="flex items-center gap-3 mb-4">
        {data && data.computed_at && <p className="text-[10px] text-gray-400">Last refreshed: {new Date(data.computed_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</p>}
        <button onClick={async function () { setLoading(true); await supabase.rpc('refresh_leave_balance_cache'); loadData() }}
          className="text-[10px] font-bold text-blue-600 hover:text-blue-800">↻ Refresh now</button>
      </div>

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
                {[
                  { key: 'emp_code', label: 'Code', align: 'text-left', color: 'text-gray-500' },
                  { key: 'name', label: 'Name', align: 'text-left', color: 'text-gray-500' },
                  { key: 'department_name', label: 'Department', align: 'text-left', color: 'text-gray-500' }
                ].map(function (col) {
                  var arrow = sortCol === col.key ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''
                  return (
                    <th key={col.key} onClick={function () { handleSort(col.key) }}
                      className={col.align + ' px-3 py-2.5 text-[10px] font-bold ' + col.color + ' uppercase tracking-wider cursor-pointer hover:bg-gray-100 select-none'}>
                      {col.label}{arrow}
                    </th>
                  )
                })}
                <th className="text-center px-3 py-2.5 text-[10px] font-bold text-emerald-600 uppercase tracking-wider" colSpan={2}>Annual Leave</th>
                <th className="text-center px-3 py-2.5 text-[10px] font-bold text-blue-600 uppercase tracking-wider" colSpan={2}>Quarterly</th>
                <th className="text-center px-3 py-2.5 text-[10px] font-bold text-orange-600 uppercase tracking-wider" colSpan={2}>Half Days</th>
              </tr>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th colSpan={3}></th>
                {[
                  { key: 'annual_used', label: 'Used' },
                  { key: 'annual_remaining', label: 'Left' },
                  { key: 'quarter_used', label: 'Used' },
                  { key: 'quarter_remaining', label: 'Left' },
                  { key: 'half_used', label: 'Used' },
                  { key: 'half_remaining', label: 'Left' }
                ].map(function (col) {
                  var arrow = sortCol === col.key ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''
                  return (
                    <th key={col.key} onClick={function () { handleSort(col.key) }}
                      className="text-center px-2 py-1.5 text-[9px] font-semibold text-gray-400 cursor-pointer hover:bg-gray-100 select-none">
                      {col.label}{arrow}
                    </th>
                  )
                })}
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