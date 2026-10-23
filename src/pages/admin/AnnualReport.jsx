// AnnualReport.jsx
// Admin → Annual Report for the current FY. Per-employee quarter-by-quarter
// leave usage (Q1–Q4), annual used/left, half days, missed-attendance claims
// with the ₹ penalty for going over the monthly claim limit, and gross / net
// salary deductions. Data comes from admin_all_leave_balances() plus the FY's
// missed_claims rows; summary cards on top total the filtered view.
// Phones (< md): stacked toolbar with scrolling scheme chips, compact cards, and
// the wide table scrolls inside its card with a sticky Employee column.

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import DeptPicker from '../../components/DeptPicker'

// Phone-only sticky Employee column (released at md)
var STICKY_COL = 'sticky left-0 z-10 shadow-[4px_0_6px_-4px_rgba(15,23,42,0.18)] md:static md:z-auto md:shadow-none'

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
  var [claimsMap, setClaimsMap] = useState({})
  var [claimLimit, setClaimLimit] = useState(4)

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

      // Fetch claim limit
      var limitVal = 4
      var cfgRes = await supabase.from('app_config').select('value').eq('key', 'claim_limit').maybeSingle()
      if (cfgRes.data && cfgRes.data.value) {
        try { limitVal = parseInt(String(cfgRes.data.value).replace(/"/g, ''), 10) || 4 } catch (e) {}
      }
      setClaimLimit(limitVal)

      // Fetch FY claims
      var fyStart = rpcRes.data.fy_start
      var fyEnd = rpcRes.data.fy_end
      var { data: claims } = await supabase
        .from('missed_claims')
        .select('employee_id, created_at, status')
        .gte('attendance_date', fyStart)
        .lte('attendance_date', fyEnd)
        .neq('status', 'rejected')

      // Aggregate: per employee → per month → count, then compute over-limit
      var map = {}
      ;(claims || []).forEach(function (c) {
        if (!map[c.employee_id]) map[c.employee_id] = {}
        var ist = new Date(c.created_at)
        var monthKey = ist.getFullYear() + '-' + String(ist.getMonth() + 1).padStart(2, '0')
        if (!map[c.employee_id][monthKey]) map[c.employee_id][monthKey] = 0
        map[c.employee_id][monthKey]++
      })

      var result = {}
      Object.keys(map).forEach(function (empId) {
        var months = map[empId]
        var total = 0, over = 0
        Object.keys(months).forEach(function (m) {
          total += months[m]
          if (months[m] > limitVal) over += (months[m] - limitVal)
        })
        result[empId] = { total: total, over: over, penalty: over * 500 }
      })
      setClaimsMap(result)
    }
    setDepartments(deptRes.data || [])
    setLoading(false)
  }, [])

  useEffect(function () { loadData() }, [loadData])

  var balances = (data && data.balances) || []

  // People per department (shown in the department picker)
  var deptCounts = {}
  balances.forEach(function (b) { deptCounts[b.department_id] = (deptCounts[b.department_id] || 0) + 1 })

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

  function empClaims(b) { return claimsMap[b.employee_id] || { total: 0, over: 0, penalty: 0 } }

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
      case 'claims': va = empClaims(a).total; vb = empClaims(b).total; break
      case 'claims_penalty': va = empClaims(a).penalty; vb = empClaims(b).penalty; break
      default: va = a.name; vb = b.name
    }
    if (typeof va === 'string') {
      var cmp = va.localeCompare(vb)
      return sortDir === 'asc' ? cmp : -cmp
    }
    return sortDir === 'asc' ? va - vb : vb - va
  })

  // Summary stats
  var totDed = 0, totNetDed = 0, overQuarter = 0, totClaimsPenalty = 0
  filtered.forEach(function (b) {
    totDed += b.deductions || 0
    totNetDed += netDed(b)
    if ((b.deductions || 0) > 0) overQuarter++
    totClaimsPenalty += empClaims(b).penalty
  })

  var fyLabel = data ? data.fy_start.slice(0, 4) + '–' + data.fy_end.slice(0, 4) : ''
  var qLabel = data ? data.quarter_label : ''

  var SCHEMES = [
    { id: '', label: 'All' },
    { id: 'standard', label: 'Standard' },
    { id: 'new_joiner', label: 'New Joiner' },
    { id: 'monthly_cap', label: 'Monthly Cap' }
  ]
  var SUMMARY = [
    { label: 'Employees', value: filtered.length, sub: 'in view', dot: 'bg-slate-400', color: 'text-gray-900' },
    { label: 'Gross deductions', value: totDed, sub: 'days, before offset', dot: 'bg-pink-500', color: 'text-pink-600' },
    { label: 'Net deductions', value: totNetDed, sub: 'after annual surplus', dot: 'bg-red-500', color: 'text-red-600' },
    { label: 'Over limits', value: overQuarter, sub: 'employees', dot: 'bg-amber-500', color: 'text-amber-600' },
    { label: 'Claims penalty', value: '₹' + totClaimsPenalty.toLocaleString('en-IN'), sub: '₹500 per claim over ' + claimLimit + '/mo', dot: 'bg-purple-500', color: 'text-purple-600' }
  ]

  var sortProps = { sortCol: sortCol, sortDir: sortDir, onClick: handleSort }

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3 mb-4">
        <div>
          <h2 className="text-xl md:text-2xl font-bold text-gray-900 tracking-tight">Annual Report — FY {fyLabel}</h2>
          <p className="text-xs md:text-sm text-gray-500 mt-0.5">
            Per-quarter breakdown with deductions · Current: {qLabel} · Claims limit: {claimLimit}/month
          </p>
        </div>
        <button onClick={function () { loadData() }}
          className="h-9 px-3 inline-flex items-center gap-1.5 rounded-lg bg-white ring-1 ring-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50">
          <svg className={'w-4 h-4 ' + (loading ? 'animate-spin' : '')} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
            strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 11a8 8 0 0 0-14.9-3.9M4 4v4h4" /><path d="M4 13a8 8 0 0 0 14.9 3.9M20 20v-4h-4" /></svg>
          Refresh
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2 md:gap-3 mb-4">
        {SUMMARY.map(function (c) {
          return (
            <div key={c.label} className="rounded-2xl px-3 py-2.5 md:px-4 md:py-3 bg-white shadow-sm ring-1 ring-gray-200/70 last:col-span-2 md:last:col-span-1">
              <p className="flex items-center gap-2 text-[12px] md:text-[13px] font-medium text-gray-500">
                <span className={'w-2 h-2 shrink-0 rounded-full ' + c.dot} />
                {c.label}
              </p>
              <p className={'text-[22px] md:text-[26px] font-bold leading-tight mt-0.5 md:mt-1 tabular-nums ' + c.color}>{c.value}</p>
              <p className="text-[11px] md:text-xs text-gray-400">{c.sub}</p>
            </div>
          )
        })}
      </div>

      {/* Toolbar */}
      <div className="bg-white rounded-2xl ring-1 ring-gray-200/70 shadow-sm p-3 mb-4 flex flex-col items-stretch md:flex-row md:flex-wrap md:items-center gap-3">
        <DeptPicker departments={departments} value={deptFilter} onChange={setDeptFilter}
          counts={deptCounts} total={balances.length} className="h-10 rounded-xl w-full md:w-auto" />

        <div className="flex gap-1 bg-gray-100 rounded-xl p-1 max-w-full overflow-x-auto [scrollbar-width:none] md:overflow-visible">
          {SCHEMES.map(function (s) {
            var active = schemeFilter === s.id
            return (
              <button key={s.label} onClick={function () { setSchemeFilter(s.id) }}
                className={'flex-1 md:flex-initial shrink-0 md:shrink px-2.5 md:px-3 h-8 rounded-lg text-[13px] md:text-sm font-semibold transition-colors whitespace-nowrap ' +
                  (active ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-800')}>
                {s.label}
              </button>
            )
          })}
        </div>

        <div className="relative md:flex-1 min-w-52">
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

      {loading ? (
        <p className="text-sm text-gray-400 text-center py-12">Loading…</p>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-2xl ring-1 ring-gray-200/70 shadow-sm text-center py-12">
          <p className="text-sm text-gray-500">No employees found</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl ring-1 ring-gray-200/70 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-max md:min-w-0 text-sm">
              <thead>
                <tr className="bg-gray-50/80 border-b border-gray-200">
                  <SortTh col="name" label="Employee" align="text-left" extra={STICKY_COL + ' bg-gray-50 md:bg-transparent'} {...sortProps} />
                  <SortTh col="department_name" label="Department" align="text-left" {...sortProps} />
                  <SortTh col="q1" label="Q1" tint="text-blue-600/80" {...sortProps} />
                  <SortTh col="q2" label="Q2" tint="text-blue-600/80" {...sortProps} />
                  <SortTh col="q3" label="Q3" tint="text-blue-600/80" {...sortProps} />
                  <SortTh col="q4" label="Q4" tint="text-blue-600/80" {...sortProps} />
                  <SortTh col="annual_used" label="Annual" tint="text-emerald-600/80" {...sortProps} />
                  <SortTh col="annual_remaining" label="Left" tint="text-emerald-600/80" {...sortProps} />
                  <SortTh col="half" label="½ Day" tint="text-orange-600/80" {...sortProps} />
                  <SortTh col="claims" label="Claims" tint="text-purple-600/80" {...sortProps} />
                  <SortTh col="claims_penalty" label="₹ Penalty" tint="text-purple-600/80" {...sortProps} />
                  <SortTh col="deductions" label="Ded" tint="text-pink-600/80" {...sortProps} />
                  <SortTh col="net_ded" label="Net" tint="text-red-600/80" {...sortProps} />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map(function (b) {
                  var isCap = b.leave_scheme === 'monthly_cap'
                  var isNew = b.leave_scheme === 'new_joiner'
                  var ded = b.deductions || 0
                  var nd = netDed(b)
                  var cl = empClaims(b)
                  var initials = (b.name || '?').trim().split(/\s+/).slice(0, 2).map(function (w) { return w[0] }).join('').toUpperCase()

                  return (
                    <tr key={b.employee_id} className="hover:bg-blue-50/30 transition-colors">
                      <td className={'px-3 py-2.5 md:px-4 md:py-3 bg-white md:bg-transparent ' + STICKY_COL}>
                        <div className="flex items-center gap-3 w-36 md:w-auto md:min-w-52">
                          <span className="hidden md:inline-flex w-8 h-8 rounded-full bg-slate-100 text-slate-500 text-[11px] font-bold items-center justify-center shrink-0">{initials}</span>
                          <div className="min-w-0">
                            <p className="font-semibold text-gray-900 md:truncate">
                              {b.name}
                              {isCap && <span className="ml-1.5 text-[10px] font-semibold text-indigo-700 bg-indigo-50 ring-1 ring-indigo-100 px-1.5 py-0.5 rounded align-middle">{b.monthly_cap}/mo</span>}
                              {isNew && <span className="ml-1.5 text-[10px] font-semibold text-teal-700 bg-teal-50 ring-1 ring-teal-100 px-1.5 py-0.5 rounded align-middle">New</span>}
                            </p>
                            <p className="text-xs text-gray-400 tabular-nums">{b.emp_code}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-2.5 py-2.5 md:px-4 md:py-3 text-[13px] text-gray-600 whitespace-nowrap">{b.department_name || <Dash />}</td>

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
                      <td className="px-2.5 py-2.5 md:px-3 md:py-3 text-[13px] text-center text-gray-700 tabular-nums whitespace-nowrap">
                        {b.annual_used}<span className="text-gray-400 text-[11px]">/{b.annual_total}</span>
                      </td>
                      <td className={'px-2.5 py-2.5 md:px-3 md:py-3 text-[13px] text-center font-semibold tabular-nums ' + remColor(b.annual_remaining, b.annual_total)}>
                        {b.annual_remaining}
                      </td>

                      {/* Half days */}
                      {isCap ? (
                        <td className="px-2.5 py-2.5 md:px-3 md:py-3 text-[13px] text-center"><Dash /></td>
                      ) : (
                        <td className="px-2.5 py-2.5 md:px-3 md:py-3 text-[13px] text-center text-gray-700 tabular-nums whitespace-nowrap">
                          {(b.half_used || 0) > (b.half_annual_total || 0)
                            ? <Pill tone="red">{b.half_used}<span className="text-red-400 font-medium">/{b.half_annual_total}</span></Pill>
                            : <>{b.half_used}<span className="text-gray-400 text-[11px]">/{b.half_annual_total}</span></>}
                        </td>
                      )}

                      {/* Claims */}
                      <td className="px-2.5 py-2.5 md:px-3 md:py-3 text-[13px] text-center tabular-nums whitespace-nowrap">
                        {cl.total > 0 ? (
                          cl.over > 0
                            ? <Pill tone="red" title={cl.over + ' over the ' + claimLimit + '/month limit'}>
                                {cl.total}
                                <span className="ml-1 inline-flex items-center gap-0.5 text-[11px] font-semibold text-red-500">
                                  <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 19V5M5 12l7-7 7 7" /></svg>
                                  {cl.over}
                                </span>
                              </Pill>
                            : <span className="font-semibold text-purple-600">{cl.total}</span>
                        ) : <Dash />}
                      </td>
                      <td className="px-2.5 py-2.5 md:px-3 md:py-3 text-[13px] text-center tabular-nums whitespace-nowrap">
                        {cl.penalty > 0 ? <Pill tone="purple">₹{cl.penalty.toLocaleString('en-IN')}</Pill> : <Dash />}
                      </td>

                      {/* Deductions */}
                      <td className="px-2.5 py-2.5 md:px-3 md:py-3 text-[13px] text-center tabular-nums">
                        {ded > 0 ? <Pill tone="pink">{ded}</Pill> : <Dash />}
                      </td>
                      <td className="px-2.5 py-2.5 md:px-3 md:py-3 text-[13px] text-center tabular-nums">
                        {nd > 0 ? <Pill tone="red" strong>{nd}</Pill> : <Dash />}
                      </td>
                    </tr>
                  )
                })}
              </tbody>

              {/* Totals row */}
              <tfoot>
                <tr className="bg-gray-50/80 border-t border-gray-200 font-semibold tabular-nums">
                  <td className={'px-3 py-2.5 md:px-4 md:py-3 text-xs font-semibold uppercase tracking-wider text-gray-500 whitespace-nowrap bg-gray-50 md:bg-transparent ' + STICKY_COL}>Total ({filtered.length})</td>
                  <td />
                  {[1,2,3,4].map(function (q) {
                    var totalUsed = 0
                    filtered.forEach(function (b) { totalUsed += (b['q' + q + '_used'] || 0) })
                    return <td key={q} className="px-2.5 py-2.5 md:px-3 md:py-3 text-[13px] text-center text-gray-700">{totalUsed}</td>
                  })}
                  <td className="px-2.5 py-2.5 md:px-3 md:py-3 text-[13px] text-center text-gray-700">
                    {filtered.reduce(function (s, b) { return s + (b.annual_used || 0) }, 0)}
                  </td>
                  <td className="px-2.5 py-2.5 md:px-3 md:py-3 text-[13px] text-center text-emerald-700">
                    {filtered.reduce(function (s, b) { return s + (b.annual_remaining || 0) }, 0)}
                  </td>
                  <td className="px-2.5 py-2.5 md:px-3 md:py-3 text-[13px] text-center text-gray-700">
                    {filtered.reduce(function (s, b) { return s + (b.half_used || 0) }, 0)}
                  </td>
                  <td className="px-2.5 py-2.5 md:px-3 md:py-3 text-[13px] text-center text-purple-700 font-bold">
                    {filtered.reduce(function (s, b) { return s + empClaims(b).total }, 0)}
                  </td>
                  <td className="px-2.5 py-2.5 md:px-3 md:py-3 text-[13px] text-center text-purple-700 font-bold whitespace-nowrap">
                    ₹{totClaimsPenalty.toLocaleString('en-IN')}
                  </td>
                  <td className="px-2.5 py-2.5 md:px-3 md:py-3 text-[13px] text-center text-pink-700 font-bold">{totDed}</td>
                  <td className="px-2.5 py-2.5 md:px-3 md:py-3 text-[13px] text-center text-red-700 font-bold">{totNetDed}</td>
                </tr>
              </tfoot>
            </table>
          </div>
          <div className="px-4 py-2.5 border-t border-gray-100 text-xs text-gray-500">
            Showing {filtered.length} of {balances.length}
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-xs text-gray-500">
        <span className="inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-pink-500" />Ded = Gross FY leave deductions</span>
        <span className="inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-red-500" />Net = Ded offset by annual surplus</span>
        <span className="inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-purple-500" />Claims = FY total (arrow = over {claimLimit}/mo limit) · ₹500/over-claim</span>
        <span className="inline-flex items-center gap-1.5"><Pill tone="red">2<span className="text-red-400 font-medium">/1</span></Pill>= over quarterly limit</span>
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

// Sortable header; tint gives column groups a soft colour, active column goes dark
function SortTh({ col, label, sortCol, sortDir, onClick, align, tint, extra }) {
  var active = sortCol === col
  var arrow = active ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''
  return (
    <th onClick={function () { onClick(col) }}
      className={(align || 'text-center') + ' px-2.5 py-2.5 md:px-3 md:py-3 first:px-3 md:first:px-4 text-[11px] font-semibold uppercase tracking-wider cursor-pointer select-none whitespace-nowrap hover:text-gray-900 ' +
        (active ? 'text-gray-900' : (tint || 'text-gray-500')) + (extra ? ' ' + extra : '')}>
      {label}{arrow}
    </th>
  )
}

// Small rounded highlight placed on the value itself (instead of tinting the whole cell)
var PILL_TONES = {
  red: 'bg-red-50 ring-red-200 text-red-700',
  purple: 'bg-purple-50 ring-purple-200 text-purple-700',
  pink: 'bg-pink-50 ring-pink-200 text-pink-700'
}
function Pill({ tone, strong, title, children }) {
  return (
    <span title={title}
      className={'inline-flex items-center px-2 py-0.5 rounded-full ring-1 text-xs tabular-nums ' + (strong ? 'font-bold ' : 'font-semibold ') + PILL_TONES[tone]}>
      {children}
    </span>
  )
}

function Dash() {
  return <span className="text-gray-300">—</span>
}

function QCell({ used, total }) {
  var u = used || 0
  if (total === null) {
    return (
      <td className="px-2.5 py-2.5 md:px-3 md:py-3 text-[13px] text-center text-gray-500 tabular-nums">
        {u > 0 ? u : <Dash />}
      </td>
    )
  }
  if (total === 0 && u === 0) {
    return <td className="px-2.5 py-2.5 md:px-3 md:py-3 text-[13px] text-center"><Dash /></td>
  }
  var over = u > total
  return (
    <td className="px-2.5 py-2.5 md:px-3 md:py-3 text-[13px] text-center text-gray-700 tabular-nums whitespace-nowrap">
      {over
        ? <Pill tone="red">{u}<span className="text-red-400 font-medium">/{total}</span></Pill>
        : <>{u}<span className="text-[11px] text-gray-400">/{total}</span></>}
    </td>
  )
}
