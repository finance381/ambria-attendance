import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'

export default function AnnualReport() {
  var [data, setData] = useState(null)
  var [departments, setDepartments] = useState([])
  var [deptFilter, setDeptFilter] = useState('')
  var [search, setSearch] = useState('')
  var [loading, setLoading] = useState(true)
  var [error, setError] = useState('')
  var [sortCol, setSortCol] = useState('name')
  var [sortDir, setSortDir] = useState('asc')
  var [schemeFilter, setSchemeFilter] = useState('')

  var loadData = useCallback(async function () {
    setLoading(true)
    var [rpcRes, deptRes] = await Promise.all([
      supabase.rpc('admin_all_leave_balances'),
      supabase.from('departments').select('id, name').eq('active', true).order('name')
    ])

    if (rpcRes.error) {
      setError(rpcRes.error.message)
    } else if (rpcRes.data && rpcRes.data.error) {
      setError(rpcRes.data.error)
    } else {
      setData(rpcRes.data)
    }
    setDepartments(deptRes.data || [])
    setLoading(false)
  }, [])

  useEffect(function () { loadData() }, [loadData])

  var balances = (data && data.balances) || []

  var filtered = balances.filter(function (b) {
    if (deptFilter && String(b.department_id) !== deptFilter) return false
    if (schemeFilter && b.leave_scheme !== schemeFilter) return false
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
      case 'deductions': va = a.deductions || 0; vb = b.deductions || 0; break
      case 'q1': va = a.q1_used || 0; vb = b.q1_used || 0; break
      case 'q2': va = a.q2_used || 0; vb = b.q2_used || 0; break
      case 'q3': va = a.q3_used || 0; vb = b.q3_used || 0; break
      case 'q4': va = a.q4_used || 0; vb = b.q4_used || 0; break
      case 'half': va = a.half_used || 0; vb = b.half_used || 0; break
      case 'net_ded': va = netDed(a); vb = netDed(b); break
      default: va = a.name; vb = b.name
    }
    if (typeof va === 'string') {
      var cmp = va.localeCompare(vb)
      return sortDir === 'asc' ? cmp : -cmp
    }
    return sortDir === 'asc' ? va - vb : vb - va
  })

  // Summary stats
  var totDed = 0, totNetDed = 0, overQuarter = 0, overHalf = 0
  filtered.forEach(function (b) {
    totDed += b.deductions || 0
    totNetDed += netDed(b)
    if ((b.deductions || 0) > 0) overQuarter++
    if ((b.half_used || 0) > (b.half_annual_total || 0) && b.leave_scheme !== 'monthly_cap') overHalf++
  })

  var fyLabel = data ? data.fy_start.slice(0, 4) + '–' + data.fy_end.slice(0, 4) : ''
  var qLabel = data ? data.quarter_label : ''

  return (
    <div>
      <h2 className="text-lg font-bold text-gray-900 mb-1">Annual Report — FY {fyLabel}</h2>
      <p className="text-xs text-gray-500 mb-1">
        Per-quarter breakdown with deductions · Current: {qLabel}
      </p>
      <div className="flex items-center gap-3 mb-4">
        <button onClick={function () { loadData() }}
          className="text-[10px] font-bold text-blue-600 hover:text-blue-800">↻ Refresh</button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-4">
        <div>
          <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1">Department</label>
          <select value={deptFilter} onChange={function (e) { setDeptFilter(e.target.value) }}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-700">
            <option value="">All</option>
            {departments.map(function (d) { return <option key={d.id} value={d.id}>{d.name}</option> })}
          </select>
        </div>
        <div>
          <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1">Scheme</label>
          <select value={schemeFilter} onChange={function (e) { setSchemeFilter(e.target.value) }}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-700">
            <option value="">All</option>
            <option value="standard">Standard</option>
            <option value="new_joiner">New Joiner</option>
            <option value="monthly_cap">Monthly Cap</option>
          </select>
        </div>
        <div className="flex-1 min-w-[200px]">
          <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1">Search</label>
          <input type="text" value={search} onChange={function (e) { setSearch(e.target.value) }}
            placeholder="Name or code…"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-700" />
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-4 gap-3 mb-4">
        <div className="bg-white border border-gray-200 rounded-xl px-4 py-3 text-center">
          <p className="text-[10px] font-semibold text-gray-400 uppercase">Employees</p>
          <p className="text-xl font-bold text-slate-700">{filtered.length}</p>
        </div>
        <div className="bg-white border border-pink-200 rounded-xl px-4 py-3 text-center">
          <p className="text-[10px] font-semibold text-pink-400 uppercase">Gross Deductions</p>
          <p className="text-xl font-bold text-pink-700">{totDed}</p>
        </div>
        <div className="bg-white border border-red-200 rounded-xl px-4 py-3 text-center">
          <p className="text-[10px] font-semibold text-red-400 uppercase">Net Deductions</p>
          <p className="text-xl font-bold text-red-700">{totNetDed}</p>
        </div>
        <div className="bg-white border border-amber-200 rounded-xl px-4 py-3 text-center">
          <p className="text-[10px] font-semibold text-amber-400 uppercase">Over Limits</p>
          <p className="text-xl font-bold text-amber-700">{overQuarter}</p>
          <p className="text-[9px] text-gray-400">employees</p>
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
                <SortTh col="emp_code" label="Code" sortCol={sortCol} sortDir={sortDir} onClick={handleSort} align="text-left" />
                <SortTh col="name" label="Name" sortCol={sortCol} sortDir={sortDir} onClick={handleSort} align="text-left" />
                <SortTh col="department_name" label="Dept" sortCol={sortCol} sortDir={sortDir} onClick={handleSort} align="text-left" />
                <SortTh col="q1" label="Q1" sortCol={sortCol} sortDir={sortDir} onClick={handleSort} color="text-blue-600" />
                <SortTh col="q2" label="Q2" sortCol={sortCol} sortDir={sortDir} onClick={handleSort} color="text-blue-600" />
                <SortTh col="q3" label="Q3" sortCol={sortCol} sortDir={sortDir} onClick={handleSort} color="text-blue-600" />
                <SortTh col="q4" label="Q4" sortCol={sortCol} sortDir={sortDir} onClick={handleSort} color="text-blue-600" />
                <SortTh col="annual_used" label="Annual" sortCol={sortCol} sortDir={sortDir} onClick={handleSort} color="text-emerald-600" />
                <SortTh col="annual_remaining" label="Left" sortCol={sortCol} sortDir={sortDir} onClick={handleSort} color="text-emerald-600" />
                <SortTh col="half" label="½ Day" sortCol={sortCol} sortDir={sortDir} onClick={handleSort} color="text-orange-600" />
                <SortTh col="deductions" label="Ded" sortCol={sortCol} sortDir={sortDir} onClick={handleSort} color="text-pink-600" />
                <SortTh col="net_ded" label="Net" sortCol={sortCol} sortDir={sortDir} onClick={handleSort} color="text-red-600" />
              </tr>
            </thead>
            <tbody>
              {filtered.map(function (b) {
                var isCap = b.leave_scheme === 'monthly_cap'
                var isNew = b.leave_scheme === 'new_joiner'
                var ded = b.deductions || 0
                var nd = netDed(b)

                return (
                  <tr key={b.employee_id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="px-3 py-2 text-xs text-gray-400 font-mono">{b.emp_code}</td>
                    <td className="px-3 py-2 font-medium text-gray-900 whitespace-nowrap">
                      {b.name}
                      {isCap && <span className="ml-1.5 text-[9px] font-bold text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded">{b.monthly_cap}/mo</span>}
                      {isNew && <span className="ml-1.5 text-[9px] font-bold text-teal-600 bg-teal-50 px-1.5 py-0.5 rounded">New</span>}
                    </td>
                    <td className="px-3 py-2 text-xs text-gray-500 whitespace-nowrap">{b.department_name || '—'}</td>

                    {/* Q1–Q4 */}
                    {isCap ? (
                      <>
                        <QCell used={b.q1_used} total={null} />
                        <QCell used={b.q2_used} total={null} />
                        <QCell used={b.q3_used} total={null} />
                        <QCell used={b.q4_used} total={null} />
                      </>
                    ) : (
                      <>
                        <QCell used={b.q1_used} total={b.q1_total} />
                        <QCell used={b.q2_used} total={b.q2_total} />
                        <QCell used={b.q3_used} total={b.q3_total} />
                        <QCell used={b.q4_used} total={b.q4_total} />
                      </>
                    )}

                    {/* Annual */}
                    <td className="px-2 py-2 text-xs text-center text-gray-700">
                      {b.annual_used}<span className="text-gray-400 text-[10px]">/{b.annual_total}</span>
                    </td>
                    <td className={'px-2 py-2 text-xs text-center font-semibold ' + remColor(b.annual_remaining, b.annual_total)}>
                      {b.annual_remaining}
                    </td>

                    {/* Half days */}
                    {isCap ? (
                      <td className="px-2 py-2 text-xs text-center text-gray-300">—</td>
                    ) : (
                      <td className="px-2 py-2 text-xs text-center text-gray-700">
                        <span className={(b.half_used || 0) > (b.half_annual_total || 0) ? 'text-red-600 font-semibold' : ''}>
                          {b.half_used}
                        </span>
                        <span className="text-gray-400 text-[10px]">/{b.half_annual_total}</span>
                      </td>
                    )}

                    {/* Deductions */}
                    <td className={'px-2 py-2 text-xs text-center font-semibold ' + (ded > 0 ? 'text-pink-700 bg-pink-50' : 'text-gray-300')}>
                      {ded > 0 ? ded : '—'}
                    </td>
                    <td className={'px-2 py-2 text-xs text-center font-bold ' + (nd > 0 ? 'text-red-700 bg-red-50' : 'text-gray-300')}>
                      {nd > 0 ? nd : '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>

            {/* Totals row */}
            <tfoot>
              <tr className="bg-gray-50 border-t-2 border-gray-300 font-semibold">
                <td colSpan={3} className="px-3 py-2 text-xs text-gray-600">Total ({filtered.length})</td>
                {[1,2,3,4].map(function (q) {
                  var totalUsed = 0
                  filtered.forEach(function (b) {
                    totalUsed += (b['q' + q + '_used'] || 0)
                  })
                  return <td key={q} className="px-2 py-2 text-xs text-center text-gray-700">{totalUsed}</td>
                })}
                <td className="px-2 py-2 text-xs text-center text-gray-700">
                  {filtered.reduce(function (s, b) { return s + (b.annual_used || 0) }, 0)}
                </td>
                <td className="px-2 py-2 text-xs text-center text-emerald-700">
                  {filtered.reduce(function (s, b) { return s + (b.annual_remaining || 0) }, 0)}
                </td>
                <td className="px-2 py-2 text-xs text-center text-gray-700">
                  {filtered.reduce(function (s, b) { return s + (b.half_used || 0) }, 0)}
                </td>
                <td className="px-2 py-2 text-xs text-center text-pink-700 font-bold">{totDed}</td>
                <td className="px-2 py-2 text-xs text-center text-red-700 font-bold">{totNetDed}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {/* Legend */}
      <div className="mt-3 flex flex-wrap gap-4 text-[10px] text-gray-400">
        <span><span className="inline-block w-2 h-2 rounded-full bg-pink-500 mr-1" />Ded = Gross FY deductions (quarterly over-limit + half-day excess)</span>
        <span><span className="inline-block w-2 h-2 rounded-full bg-red-500 mr-1" />Net = Ded offset by annual surplus (year-end projection)</span>
        <span><span className="text-red-600 font-bold mr-1">Red cells</span>= over quarterly limit</span>
      </div>
    </div>
  )
}

/* Year-end net deductions: offset gross by unused annual balance */
function netDed(b) {
  var gross = b.deductions || 0
  if (gross === 0) return 0
  var surplus = Math.max(b.annual_remaining || 0, 0)
  return Math.max(gross - surplus, 0)
}

function remColor(remaining, total) {
  if (total === 0) return 'text-gray-500'
  if (remaining < 0) return 'text-red-600'
  var pct = remaining / total
  if (pct > 0.4) return 'text-emerald-700'
  if (pct > 0.15) return 'text-amber-600'
  return 'text-red-600'
}

function SortTh({ col, label, sortCol, sortDir, onClick, align, color }) {
  var arrow = sortCol === col ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''
  return (
    <th onClick={function () { onClick(col) }}
      className={(align || 'text-center') + ' px-2 py-2.5 text-[10px] font-bold ' + (color || 'text-gray-500') + ' uppercase tracking-wider cursor-pointer hover:bg-gray-100 select-none whitespace-nowrap'}>
      {label}{arrow}
    </th>
  )
}

function QCell({ used, total }) {
  var u = used || 0
  if (total === null) {
    // monthly_cap: just show used count, no limit
    return (
      <td className="px-2 py-2 text-xs text-center text-gray-500">
        {u > 0 ? u : <span className="text-gray-300">—</span>}
      </td>
    )
  }
  if (total === 0 && u === 0) {
    return <td className="px-2 py-2 text-xs text-center text-gray-300">—</td>
  }
  var over = u > total
  return (
    <td className={'px-2 py-2 text-xs text-center ' + (over ? 'text-red-700 bg-red-50 font-bold' : 'text-gray-700')}>
      {u}<span className={'text-[10px] ' + (over ? 'text-red-400' : 'text-gray-400')}>/{total}</span>
    </td>
  )
}