// LeaveBalances.jsx
// Admin → Requests → Leave Balances. Every employee's FY leave position from
// admin_all_leave_balances(): annual, the chosen quarter, half days and
// salary deductions. Summary cards on top count people who need a look (over
// the annual limit, quarter used up, deductions) and filter the table to them.
// Phones (< md) get a stacked toolbar and a card list instead of the table.

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import DeptPicker from '../../components/DeptPicker'

export default function LeaveBalances() {
  var [data, setData] = useState(null)
  var [departments, setDepartments] = useState([])
  var [deptFilter, setDeptFilter] = useState('')
  var [search, setSearch] = useState('')
  var [quarterFilter, setQuarterFilter] = useState('')
  // '' | 'over' | 'quarter' | 'ded' — set by the summary cards
  var [issueFilter, setIssueFilter] = useState('')
  var [loading, setLoading] = useState(true)
  var [error, setError] = useState('')
  var [sortCol, setSortCol] = useState('name')
  var [sortDir, setSortDir] = useState('asc')

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

  // People per department (shown in the department picker)
  var deptCounts = {}
  balances.forEach(function (b) { deptCounts[b.department_id] = (deptCounts[b.department_id] || 0) + 1 })

  var scoped = balances.filter(function (b) {
    if (deptFilter && String(b.department_id) !== deptFilter) return false
    if (search) {
      var q = search.toLowerCase()
      if (!b.name.toLowerCase().includes(q) && !b.emp_code.toLowerCase().includes(q)) return false
    }
    return true
  })

  function isOver(b) { return b.annual_remaining < 0 }
  function isQuarterOut(b) { return b.leave_scheme !== 'monthly_cap' && resolveQuarter(b, quarterFilter).total > 0 && resolveQuarter(b, quarterFilter).remaining <= 0 }
  function hasDed(b) { return b.leave_scheme !== 'monthly_cap' && b.deductions > 0 }

  var counts = {
    all: scoped.length,
    over: scoped.filter(isOver).length,
    quarter: scoped.filter(isQuarterOut).length,
    ded: scoped.filter(hasDed).length,
    dedDays: scoped.filter(hasDed).reduce(function (sum, b) { return sum + b.deductions }, 0)
  }

  var filtered = scoped.filter(function (b) {
    if (issueFilter === 'over') return isOver(b)
    if (issueFilter === 'quarter') return isQuarterOut(b)
    if (issueFilter === 'ded') return hasDed(b)
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
      case 'quarter_used': va = resolveQuarter(a, quarterFilter).used; vb = resolveQuarter(b, quarterFilter).used; break
      case 'quarter_remaining': va = resolveQuarter(a, quarterFilter).remaining; vb = resolveQuarter(b, quarterFilter).remaining; break
      case 'half_used': va = a.half_used; vb = b.half_used; break
      case 'half_remaining': va = a.half_remaining; vb = b.half_remaining; break
      case 'deductions': va = a.deductions || 0; vb = b.deductions || 0; break
      default: va = a.name; vb = b.name
    }
    if (typeof va === 'string') {
      var cmp = va.localeCompare(vb)
      return sortDir === 'asc' ? cmp : -cmp
    }
    return sortDir === 'asc' ? va - vb : vb - va
  })

  var fyLabel = data ? data.fy_start.slice(0, 4) + '–' + data.fy_end.slice(0, 4) : ''

  var QUARTERS = [
    { id: '', label: 'Current' },
    { id: 'q1', label: 'Q1', hint: 'Apr–Jun' },
    { id: 'q2', label: 'Q2', hint: 'Jul–Sep' },
    { id: 'q3', label: 'Q3', hint: 'Oct–Dec' },
    { id: 'q4', label: 'Q4', hint: 'Jan–Mar' }
  ]
  var SUMMARY = [
    { id: '', label: 'Employees', value: counts.all, sub: 'in view', dot: 'bg-slate-400', color: 'text-gray-900' },
    { id: 'over', label: 'Over annual limit', value: counts.over, sub: 'used more than allowed', dot: 'bg-red-500', color: 'text-red-600' },
    { id: 'quarter', label: 'Quarter used up', value: counts.quarter, sub: 'no quarterly leave left', dot: 'bg-amber-500', color: 'text-amber-600' },
    { id: 'ded', label: 'Salary deductions', value: counts.ded, sub: counts.dedDays + ' day' + (counts.dedDays !== 1 ? 's' : '') + ' in total', dot: 'bg-pink-500', color: 'text-pink-600' }
  ]

  function SortHead({ col, label, align }) {
    var arrow = sortCol === col ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''
    return (
      <th onClick={function () { handleSort(col) }}
        className={(align || 'text-left') + ' px-4 py-3 text-[11px] font-semibold uppercase tracking-wider cursor-pointer select-none whitespace-nowrap hover:text-gray-900 ' +
          (sortCol === col ? 'text-gray-900' : 'text-gray-500')}>
        {label}{arrow}
      </th>
    )
  }

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3 mb-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-gray-900 tracking-tight">Leave Balances</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            FY {fyLabel} · {quarterFilter
              ? 'Viewing ' + quarterLabel(data && data.fy_start, quarterFilter)
              : 'Current quarter ' + (data ? data.quarter_label : '') + ' (' + (data ? formatDate(data.quarter_start) + ' – ' + formatDate(data.quarter_end) : '') + ')'}
          </p>
        </div>
        <button onClick={function () { loadData() }}
          className="h-9 px-3 inline-flex items-center gap-1.5 rounded-lg bg-white ring-1 ring-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50">
          <svg className={'w-4 h-4 ' + (loading ? 'animate-spin' : '')} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
            strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 11a8 8 0 0 0-14.9-3.9M4 4v4h4" /><path d="M4 13a8 8 0 0 0 14.9 3.9M20 20v-4h-4" /></svg>
          Refresh
        </button>
      </div>

      {/* Summary — click a card to show only those people */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3 mb-4">
        {SUMMARY.map(function (c) {
          var active = issueFilter === c.id
          return (
            <button key={c.label} onClick={function () { setIssueFilter(active && c.id ? '' : c.id) }}
              className={'text-left rounded-2xl px-3 py-2.5 sm:px-4 sm:py-3 bg-white shadow-sm transition-all ' +
                (active ? 'ring-2 ring-blue-500' : 'ring-1 ring-gray-200/70 hover:ring-gray-300')}>
              <p className="flex items-center gap-2 text-[13px] font-medium text-gray-500">
                <span className={'w-2 h-2 rounded-full shrink-0 ' + c.dot} />
                {c.label}
              </p>
              <p className={'text-[22px] sm:text-[26px] font-bold leading-tight mt-1 tabular-nums ' + c.color}>{c.value}</p>
              <p className="text-[11px] sm:text-xs text-gray-400">{c.sub}</p>
            </button>
          )
        })}
      </div>

      {/* Toolbar */}
      <div className="bg-white rounded-2xl ring-1 ring-gray-200/70 shadow-sm p-3 mb-4 flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-3">
        <DeptPicker departments={departments} value={deptFilter} onChange={setDeptFilter}
          counts={deptCounts} total={balances.length} className="h-10 rounded-xl w-full sm:w-auto" />

        <div className="flex gap-1 bg-gray-100 rounded-xl p-1 max-w-full overflow-x-auto sm:overflow-visible">
          {QUARTERS.map(function (q) {
            var active = quarterFilter === q.id
            return (
              <button key={q.label} onClick={function () { setQuarterFilter(q.id) }} title={q.hint}
                className={'shrink-0 flex-1 sm:flex-none px-3 h-8 rounded-lg text-sm font-semibold transition-colors ' +
                  (active ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-800')}>
                {q.label}
              </button>
            )
          })}
        </div>

        <div className="relative sm:flex-1 sm:min-w-52">
          <svg className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
          <input type="text" value={search} onChange={function (e) { setSearch(e.target.value) }}
            placeholder="Search name or code…"
            className="w-full h-10 pl-9 pr-3 border border-gray-200 rounded-xl bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
      </div>

      {error && (
        <div className="mb-4 px-4 py-3 bg-red-50 ring-1 ring-red-200 rounded-xl">
          <p className="text-sm text-red-600">{error}</p>
        </div>
      )}

      {loading && !data ? (
        <p className="text-sm text-gray-400 text-center py-12">Loading…</p>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-2xl ring-1 ring-gray-200/70 shadow-sm text-center py-12">
          <p className="text-sm text-gray-500">No employees found</p>
        </div>
      ) : (
        <>
        {/* Phone: one card per employee in place of the wide table */}
        <div className="md:hidden space-y-2">
          {filtered.map(function (b) {
            var isCap = b.leave_scheme === 'monthly_cap'
            var isNewJoiner = b.leave_scheme === 'new_joiner'
            var q = resolveQuarter(b, quarterFilter)
            var initials = (b.name || '?').trim().split(/\s+/).slice(0, 2).map(function (w) { return w[0] }).join('').toUpperCase()
            return (
              <div key={b.employee_id} className="bg-white rounded-2xl ring-1 ring-gray-200/70 shadow-sm p-3">
                <div className="flex items-start gap-3">
                  <span className="w-8 h-8 rounded-full bg-slate-100 text-slate-500 text-[11px] font-bold inline-flex items-center justify-center shrink-0">{initials}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-gray-900">
                      {b.name}
                      {isCap && <span className="ml-1.5 text-[10px] font-semibold text-indigo-700 bg-indigo-50 ring-1 ring-indigo-100 px-1.5 py-0.5 rounded align-middle whitespace-nowrap">{b.monthly_cap}/mo cap</span>}
                      {isNewJoiner && <span className="ml-1.5 text-[10px] font-semibold text-teal-700 bg-teal-50 ring-1 ring-teal-100 px-1.5 py-0.5 rounded align-middle">New</span>}
                    </p>
                    <p className="text-xs text-gray-400">
                      <span className="tabular-nums">{b.emp_code}</span> · {b.department_name || '—'}
                      {isNewJoiner && b.date_of_joining && <span> · joined {formatDate(b.date_of_joining)}</span>}
                      {isCap && <span> · {b.months_elapsed}mo × {b.monthly_cap}{b.bonus_days > 0 ? ' + ' + b.bonus_days + ' bonus' : ''}</span>}
                    </p>
                  </div>
                  {!isCap && b.deductions > 0 && (
                    <span className="shrink-0 inline-flex px-2 py-0.5 rounded-full bg-pink-50 ring-1 ring-pink-200 text-[11px] font-bold text-pink-700 tabular-nums whitespace-nowrap">{b.deductions} day{b.deductions !== 1 ? 's' : ''} ded.</span>
                  )}
                </div>

                <div className="mt-3 grid grid-cols-3 gap-2">
                  <div className="rounded-xl bg-gray-50 px-2.5 py-2 min-w-0">
                    <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-0.5">Annual</p>
                    <BalanceCell used={b.annual_used} total={b.annual_total} left={b.annual_remaining} bar="bg-emerald-500" compact />
                  </div>
                  <div className="rounded-xl bg-gray-50 px-2.5 py-2 min-w-0">
                    <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-0.5 truncate">{quarterFilter ? quarterFilter.toUpperCase() : 'Quarter'}</p>
                    {isCap ? <span className="text-gray-300">—</span> : <BalanceCell used={q.used} total={q.total} left={q.remaining} bar="bg-blue-500" compact />}
                  </div>
                  <div className="rounded-xl bg-gray-50 px-2.5 py-2 min-w-0">
                    <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-0.5">Half days</p>
                    {isCap ? <span className="text-gray-300">—</span> : <BalanceCell used={b.half_used} total={b.half_annual_total} left={b.half_remaining} bar="bg-orange-400" compact />}
                  </div>
                </div>
              </div>
            )
          })}
          <p className="px-1 pt-1 text-xs text-gray-500">Showing {filtered.length} of {balances.length}</p>
        </div>

        {/* Desktop table */}
        <div className="hidden md:block bg-white rounded-2xl ring-1 ring-gray-200/70 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50/80 border-b border-gray-200">
                  <SortHead col="name" label="Employee" />
                  <SortHead col="department_name" label="Department" />
                  <SortHead col="annual_remaining" label="Annual leave" />
                  <SortHead col="quarter_remaining" label={quarterFilter ? quarterFilter.toUpperCase() + ' quarter' : 'This quarter'} />
                  <SortHead col="half_remaining" label="Half days" />
                  <SortHead col="deductions" label="Deductions" align="text-right" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map(function (b) {
                  var isCap = b.leave_scheme === 'monthly_cap'
                  var isNewJoiner = b.leave_scheme === 'new_joiner'
                  var q = resolveQuarter(b, quarterFilter)
                  var initials = (b.name || '?').trim().split(/\s+/).slice(0, 2).map(function (w) { return w[0] }).join('').toUpperCase()
                  return (
                    <tr key={b.employee_id} className="hover:bg-blue-50/30 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3 min-w-52">
                          <span className="w-8 h-8 rounded-full bg-slate-100 text-slate-500 text-[11px] font-bold inline-flex items-center justify-center shrink-0">{initials}</span>
                          <div className="min-w-0">
                            <p className="font-semibold text-gray-900 truncate">
                              {b.name}
                              {isCap && <span className="ml-1.5 text-[10px] font-semibold text-indigo-700 bg-indigo-50 ring-1 ring-indigo-100 px-1.5 py-0.5 rounded align-middle">{b.monthly_cap}/mo cap</span>}
                              {isNewJoiner && <span className="ml-1.5 text-[10px] font-semibold text-teal-700 bg-teal-50 ring-1 ring-teal-100 px-1.5 py-0.5 rounded align-middle">New</span>}
                            </p>
                            <p className="text-xs text-gray-400 tabular-nums">
                              {b.emp_code}
                              {isNewJoiner && b.date_of_joining && <span> · joined {formatDate(b.date_of_joining)}</span>}
                              {isCap && <span> · {b.months_elapsed}mo × {b.monthly_cap}{b.bonus_days > 0 ? ' + ' + b.bonus_days + ' bonus' : ''}</span>}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-[13px] text-gray-600 whitespace-nowrap">{b.department_name || '—'}</td>
                      <td className="px-4 py-3"><BalanceCell used={b.annual_used} total={b.annual_total} left={b.annual_remaining} bar="bg-emerald-500" /></td>
                      <td className="px-4 py-3">
                        {isCap ? <span className="text-gray-300">—</span> : <BalanceCell used={q.used} total={q.total} left={q.remaining} bar="bg-blue-500" />}
                      </td>
                      <td className="px-4 py-3">
                        {isCap ? <span className="text-gray-300">—</span> : <BalanceCell used={b.half_used} total={b.half_annual_total} left={b.half_remaining} bar="bg-orange-400" />}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {!isCap && b.deductions > 0
                          ? <span className="inline-flex px-2 py-0.5 rounded-full bg-pink-50 ring-1 ring-pink-200 text-xs font-bold text-pink-700 tabular-nums">{b.deductions} day{b.deductions !== 1 ? 's' : ''}</span>
                          : <span className="text-gray-300">—</span>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-2.5 border-t border-gray-100 text-xs text-gray-500">
            Showing {filtered.length} of {balances.length}
          </div>
        </div>
        </>
      )}
    </div>
  )
}

// Left (big, coloured by how much is left) + used/total + a thin bar.
// `compact` (phone cards) drops the min width and the "left" word.
function BalanceCell({ used, total, left, bar, compact }) {
  var frac = total > 0 ? Math.max(0, Math.min(1, used / total)) : 0
  var over = left < 0
  return (
    <div className={compact ? 'min-w-0' : 'min-w-32'}>
      <div className="flex items-baseline gap-1.5">
        <span className={'text-base font-bold tabular-nums ' + remainingColor(left, total)}>{left}</span>
        {!compact && <span className="text-[11px] text-gray-400">left</span>}
        <span className="ml-auto text-xs text-gray-500 tabular-nums">{used}<span className="text-gray-400">/{total}</span></span>
      </div>
      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden mt-1">
        <div className={'h-full rounded-full ' + (over ? 'bg-red-500' : left === 0 && total > 0 ? 'bg-amber-500' : bar)} style={{ width: Math.round(frac * 100) + '%' }} />
      </div>
    </div>
  )
}

function resolveQuarter(b, qKey) {
  if (!qKey) return { used: b.quarter_used, total: b.quarter_total, remaining: b.quarter_remaining }
  var used = b[qKey + '_used'] || 0
  var total = b[qKey + '_total'] || 0
  return { used: used, total: total, remaining: total - used }
}

function quarterLabel(fyStart, qKey) {
  if (!qKey || !fyStart) return ''
  var y = parseInt(fyStart.slice(0, 4), 10)
  var ranges = {
    q1: [new Date(y, 3, 1), new Date(y, 5, 30)],
    q2: [new Date(y, 6, 1), new Date(y, 8, 30)],
    q3: [new Date(y, 9, 1), new Date(y, 11, 31)],
    q4: [new Date(y + 1, 0, 1), new Date(y + 1, 2, 31)]
  }
  var r = ranges[qKey]
  var fmt = function (d) { return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) }
  return qKey.toUpperCase() + ' (' + fmt(r[0]) + ' – ' + fmt(r[1]) + ')'
}

function remainingColor(remaining, total) {
  if (total === 0) return 'text-gray-500'
  if (remaining < 0) return 'text-red-600'
  var pct = remaining / total
  if (pct > 0.4) return 'text-emerald-700'
  if (pct > 0.15) return 'text-amber-600'
  return 'text-red-600'
}

function formatDate(d) {
  if (!d) return ''
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
}