import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/useAuth'

var MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

function fmtSecs(secs) {
  if (!secs && secs !== 0) return '—'
  var h = Math.floor(secs / 3600)
  var m = Math.floor((secs % 3600) / 60)
  var ampm = h >= 12 ? 'PM' : 'AM'
  h = h % 12 || 12
  return h + ':' + String(m).padStart(2, '0') + ' ' + ampm
}

function pctColor(pct) {
  if (pct >= 90) return 'text-emerald-600'
  if (pct >= 75) return 'text-amber-600'
  return 'text-red-600'
}

function pctBg(pct) {
  if (pct >= 90) return 'bg-emerald-500'
  if (pct >= 75) return 'bg-amber-500'
  return 'bg-red-500'
}

export default function Analysis() {
  var { employee } = useAuth()
  var now = new Date()
  var [year, setYear] = useState(now.getFullYear())
  var [month, setMonth] = useState(now.getMonth() + 1)
  var [view, setView] = useState('timing')
  var [depts, setDepts] = useState([])
  var [deptFilter, setDeptFilter] = useState('')
  var [managerDeptIds, setManagerDeptIds] = useState([employee.department_id])
  var [deptNames, setDeptNames] = useState({})

  // Data states
  var [timingData, setTimingData] = useState([])
  var [timingLoading, setTimingLoading] = useState(false)
  var [monthlyData, setMonthlyData] = useState([])
  var [monthlyLoading, setMonthlyLoading] = useState(false)
  var [darData, setDarData] = useState([])
  var [darLoading, setDarLoading] = useState(false)

  var [search, setSearch] = useState('')

  var isCurrentMonth = year === now.getFullYear() && month === now.getMonth() + 1

  // Load manager depts
  useEffect(function () {
    if (employee.role === 'manager') {
      supabase.from('manager_departments').select('department_id, departments(name)')
        .eq('employee_id', employee.id)
        .then(function (res) {
          var ids = (res.data || []).map(function (d) { return d.department_id })
          if (ids.length === 0) ids = [employee.department_id]
          setManagerDeptIds(ids)
          var names = {}
          ;(res.data || []).forEach(function (d) { if (d.departments) names[d.department_id] = d.departments.name })
          setDeptNames(names)
        })
    }
    if (employee.role === 'admin') {
      supabase.from('departments').select('id, name').order('name')
        .then(function (res) { setDepts(res.data || []) })
    }
  }, [employee.id, employee.role, employee.department_id])

  // Load timing data
  var loadTiming = useCallback(async function () {
    setTimingLoading(true)
    var { data } = await supabase.rpc('avg_punch_times', {
      p_year: year,
      p_month: month,
      p_department_id: deptFilter ? Number(deptFilter) : null
    })
    setTimingData(data || [])
    setTimingLoading(false)
  }, [year, month, deptFilter])

  // Load monthly (attendance) data
  var loadMonthly = useCallback(async function () {
    setMonthlyLoading(true)
    var { data } = await supabase.rpc('monthly_summary', {
      p_year: year,
      p_month: month,
      p_department_id: deptFilter ? Number(deptFilter) : null
    })
    var filtered = data || []
    if (employee.role !== 'admin' && !deptFilter) {
      filtered = filtered.filter(function (r) { return managerDeptIds.includes(r.department_id) })
    }
    setMonthlyData(filtered)
    setMonthlyLoading(false)
  }, [year, month, deptFilter, managerDeptIds, employee.role])

  // Load DAR compliance
  var loadDAR = useCallback(async function () {
    setDarLoading(true)
    var { data } = await supabase.rpc('dar_compliance', {
      p_year: year,
      p_month: month,
      p_department_id: deptFilter ? Number(deptFilter) : null
    })
    setDarData(data || [])
    setDarLoading(false)
  }, [year, month, deptFilter])

  // Load data on view/month/dept change
  useEffect(function () {
    if (view === 'timing') loadTiming()
    if (view === 'attendance') loadMonthly()
    if (view === 'hours') loadMonthly()
    if (view === 'dar') loadDAR()
  }, [view, loadTiming, loadMonthly, loadDAR])

  function prevMonth() {
    if (month === 1) { setMonth(12); setYear(year - 1) }
    else setMonth(month - 1)
  }
  function nextMonth() {
    if (isCurrentMonth) return
    if (month === 12) { setMonth(1); setYear(year + 1) }
    else setMonth(month + 1)
  }

  function filterBySearch(list) {
    if (!search) return list
    var q = search.toLowerCase()
    return list.filter(function (r) {
      return r.name.toLowerCase().includes(q) || (r.emp_code && r.emp_code.toLowerCase().includes(q))
    })
  }

  return (
    <div>
      <h2 className="text-lg font-bold text-gray-900 mb-0.5">Analysis</h2>
      <p className="text-xs text-gray-400 mb-3">{MONTHS[month - 1]} {year}</p>

      {/* View toggle */}
      <div className="flex bg-gray-100 rounded-lg p-0.5 mb-3 overflow-x-auto">
        {[
          { key: 'timing', label: 'Timing' },
          { key: 'attendance', label: 'Attendance' },
          { key: 'hours', label: 'Hours' },
          { key: 'dar', label: 'DARs' },
        ].map(function (v) {
          return (
            <button key={v.key} onClick={function () { setView(v.key); setSearch('') }}
              className={'flex-1 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap px-2 ' +
                (view === v.key ? 'bg-white text-slate-800 shadow-sm' : 'text-gray-500')}>
              {v.label}
            </button>
          )
        })}
      </div>

      {/* Month nav */}
      <div className="flex items-center gap-2 mb-3">
        <button onClick={prevMonth}
          className="px-2.5 py-1.5 text-sm bg-gray-100 rounded-lg hover:bg-gray-200 active:bg-gray-300">←</button>
        <div className="flex-1 text-center text-sm font-semibold text-gray-700">
          {MONTHS[month - 1]} {year}
        </div>
        <button onClick={nextMonth} disabled={isCurrentMonth}
          className="px-2.5 py-1.5 text-sm bg-gray-100 rounded-lg hover:bg-gray-200 active:bg-gray-300 disabled:opacity-30">→</button>
      </div>

      {/* Dept filter */}
      {employee.role === 'admin' && depts.length > 0 && (
        <select value={deptFilter} onChange={function (e) { setDeptFilter(e.target.value) }}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm mb-3 bg-white focus:outline-none focus:ring-2 focus:ring-slate-700">
          <option value="">All Departments</option>
          {depts.map(function (d) {
            return <option key={d.id} value={d.id}>{d.name}</option>
          })}
        </select>
      )}
      {employee.role === 'manager' && managerDeptIds.length > 1 && (
        <select value={deptFilter} onChange={function (e) { setDeptFilter(e.target.value) }}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm mb-3 bg-white focus:outline-none focus:ring-2 focus:ring-slate-700">
          <option value="">All My Departments</option>
          {managerDeptIds.map(function (id) {
            return <option key={id} value={id}>{deptNames[id] || 'Dept ' + id}</option>
          })}
        </select>
      )}

      {/* Search */}
      <input type="text" value={search} onChange={function (e) { setSearch(e.target.value) }}
        placeholder="Search name or code\u2026"
        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-slate-700" />

      {/* TIMING VIEW */}
      {view === 'timing' && (function () {
        var filtered = filterBySearch(timingData)
        var avgIn = filtered.length > 0 ? Math.round(filtered.reduce(function (s, r) { return s + (r.avg_in_secs || 0) }, 0) / filtered.length) : 0
        var avgOut = filtered.length > 0 ? Math.round(filtered.reduce(function (s, r) { return s + (r.avg_out_secs || 0) }, 0) / filtered.length) : 0
        var avgHrs = filtered.length > 0 ? Math.round(filtered.reduce(function (s, r) { return s + (r.avg_hours || 0) }, 0) / filtered.length * 10) / 10 : 0

        return timingLoading ? (
          <p className="text-sm text-gray-400 text-center py-12">Loading\u2026</p>
        ) : (
          <>
            {/* Summary */}
            <div className="grid grid-cols-3 gap-2 mb-3">
              <div className="bg-white border border-gray-200 rounded-lg px-2 py-2.5 text-center">
                <p className="text-[8px] font-semibold text-gray-400 uppercase">Avg In</p>
                <p className="text-base font-bold text-slate-700">{fmtSecs(avgIn)}</p>
              </div>
              <div className="bg-white border border-gray-200 rounded-lg px-2 py-2.5 text-center">
                <p className="text-[8px] font-semibold text-gray-400 uppercase">Avg Out</p>
                <p className="text-base font-bold text-slate-700">{fmtSecs(avgOut)}</p>
              </div>
              <div className="bg-white border border-gray-200 rounded-lg px-2 py-2.5 text-center">
                <p className="text-[8px] font-semibold text-gray-400 uppercase">Avg Hrs</p>
                <p className="text-base font-bold text-blue-600">{avgHrs}h</p>
              </div>
            </div>

            {/* Employee cards */}
            <div className="space-y-2">
              {filtered.map(function (r) {
                var hrsColor = r.avg_hours >= 8 ? 'text-emerald-600' : r.avg_hours >= 6 ? 'text-amber-600' : 'text-red-600'
                return (
                  <div key={r.employee_id} className="bg-white border border-gray-200 rounded-xl px-4 py-3">
                    <div className="flex items-center justify-between mb-1.5">
                      <div>
                        <p className="text-sm font-semibold text-gray-900">{r.name}</p>
                        <p className="text-[11px] text-gray-400">{r.emp_code} · {r.department_name || ''}</p>
                      </div>
                      <div className="text-right">
                        <p className={'text-base font-bold ' + hrsColor}>{r.avg_hours}h</p>
                        <p className="text-[9px] text-gray-400">{r.days_worked}d worked</p>
                      </div>
                    </div>
                    <div className="flex gap-4 text-[11px] text-gray-500">
                      <span>In: <strong className="text-gray-700">{fmtSecs(r.avg_in_secs)}</strong></span>
                      <span>Out: <strong className="text-gray-700">{fmtSecs(r.avg_out_secs)}</strong></span>
                      <span>Range: {r.min_hours}–{r.max_hours}h</span>
                    </div>
                  </div>
                )
              })}
              {filtered.length === 0 && <p className="text-sm text-gray-400 text-center py-8">No data</p>}
            </div>
          </>
        )
      })()}

      {/* ATTENDANCE VIEW */}
      {view === 'attendance' && (function () {
        var filtered = filterBySearch(monthlyData).filter(function (r) { return !r.is_casual })
        filtered.sort(function (a, b) {
          var pctA = a.effective_days > 0 ? a.days_present / a.effective_days : 0
          var pctB = b.effective_days > 0 ? b.days_present / b.effective_days : 0
          return pctA - pctB
        })

        var totalPresent = filtered.reduce(function (s, r) { return s + (r.days_present || 0) }, 0)
        var totalEffective = filtered.reduce(function (s, r) { return s + (r.effective_days || 0) }, 0)
        var overallPct = totalEffective > 0 ? Math.round((totalPresent / totalEffective) * 100) : 0

        return monthlyLoading ? (
          <p className="text-sm text-gray-400 text-center py-12">Loading\u2026</p>
        ) : (
          <>
            {/* Summary */}
            <div className="grid grid-cols-4 gap-1.5 mb-3">
              <div className="bg-white border border-gray-200 rounded-lg px-1 py-2 text-center">
                <p className="text-[8px] font-semibold text-gray-400 uppercase">Staff</p>
                <p className="text-lg font-bold text-slate-700">{filtered.length}</p>
              </div>
              <div className="bg-white border border-gray-200 rounded-lg px-1 py-2 text-center">
                <p className="text-[8px] font-semibold text-gray-400 uppercase">Att %</p>
                <p className={'text-lg font-bold ' + pctColor(overallPct)}>{overallPct}%</p>
              </div>
              <div className="bg-white border border-gray-200 rounded-lg px-1 py-2 text-center">
                <p className="text-[8px] font-semibold text-gray-400 uppercase">Half Days</p>
                <p className="text-lg font-bold text-orange-600">{filtered.reduce(function (s, r) { return s + (r.days_half || 0) }, 0)}</p>
              </div>
              <div className="bg-white border border-gray-200 rounded-lg px-1 py-2 text-center">
                <p className="text-[8px] font-semibold text-gray-400 uppercase">Absent</p>
                <p className="text-lg font-bold text-red-600">{filtered.reduce(function (s, r) { return s + (r.days_absent || 0) }, 0)}</p>
              </div>
            </div>

            {/* Employee cards sorted worst attendance first */}
            <div className="space-y-2">
              {filtered.map(function (r) {
                var pct = r.effective_days > 0 ? Math.round((r.days_present / r.effective_days) * 100) : 0
                return (
                  <div key={r.employee_id} className="bg-white border border-gray-200 rounded-xl px-4 py-3">
                    <div className="flex items-center justify-between mb-1.5">
                      <div>
                        <p className="text-sm font-semibold text-gray-900">{r.name}</p>
                        <p className="text-[11px] text-gray-400">{r.emp_code} · {r.department_name || ''}</p>
                      </div>
                      <div className="text-right">
                        <p className={'text-lg font-bold ' + pctColor(pct)}>{pct}%</p>
                      </div>
                    </div>
                    {/* Progress bar */}
                    <div className="w-full bg-gray-100 rounded-full h-1.5 mb-1.5">
                      <div className={'h-1.5 rounded-full ' + pctBg(pct)} style={{ width: pct + '%' }} />
                    </div>
                    <div className="flex gap-3 text-[11px]">
                      <span className="text-emerald-600 font-semibold">{r.days_present || 0}P</span>
                      <span className="text-orange-600 font-semibold">{r.days_half || 0}H</span>
                      <span className="text-red-600 font-semibold">{r.days_absent || 0}A</span>
                      <span className="text-amber-600 font-semibold">{r.days_incomplete || 0}Inc</span>
                      <span className="text-gray-500">{r.total_hours}hrs</span>
                    </div>
                  </div>
                )
              })}
              {filtered.length === 0 && <p className="text-sm text-gray-400 text-center py-8">No data</p>}
            </div>
          </>
        )
      })()}

      {/* HOURS VIEW */}
      {view === 'hours' && (function () {
        var filtered = filterBySearch(monthlyData).filter(function (r) { return !r.is_casual && r.effective_days > 0 })
        var avgHrsPerPerson = filtered.map(function (r) {
          return { ...r, avgDaily: r.days_present > 0 ? Math.round((r.total_hours / r.days_present) * 10) / 10 : 0 }
        })
        avgHrsPerPerson.sort(function (a, b) { return a.avgDaily - b.avgDaily })

        var overallAvg = avgHrsPerPerson.length > 0
          ? Math.round(avgHrsPerPerson.reduce(function (s, r) { return s + r.avgDaily }, 0) / avgHrsPerPerson.length * 10) / 10
          : 0
        var below8 = avgHrsPerPerson.filter(function (r) { return r.avgDaily < 8 }).length
        var above10 = avgHrsPerPerson.filter(function (r) { return r.avgDaily >= 10 }).length

        return monthlyLoading ? (
          <p className="text-sm text-gray-400 text-center py-12">Loading\u2026</p>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-2 mb-3">
              <div className="bg-white border border-gray-200 rounded-lg px-2 py-2.5 text-center">
                <p className="text-[8px] font-semibold text-gray-400 uppercase">Avg Daily</p>
                <p className="text-base font-bold text-slate-700">{overallAvg}h</p>
              </div>
              <div className="bg-white border border-gray-200 rounded-lg px-2 py-2.5 text-center">
                <p className="text-[8px] font-semibold text-gray-400 uppercase">&lt; 8h Avg</p>
                <p className="text-base font-bold text-red-600">{below8}</p>
              </div>
              <div className="bg-white border border-gray-200 rounded-lg px-2 py-2.5 text-center">
                <p className="text-[8px] font-semibold text-gray-400 uppercase">&ge; 10h Avg</p>
                <p className="text-base font-bold text-emerald-600">{above10}</p>
              </div>
            </div>

            <div className="space-y-2">
              {avgHrsPerPerson.map(function (r) {
                var barWidth = Math.min(Math.round((r.avgDaily / 14) * 100), 100)
                var hrsColor = r.avgDaily >= 8 ? 'text-emerald-600' : r.avgDaily >= 6 ? 'text-amber-600' : 'text-red-600'
                var barColor = r.avgDaily >= 8 ? 'bg-emerald-500' : r.avgDaily >= 6 ? 'bg-amber-500' : 'bg-red-500'
                return (
                  <div key={r.employee_id} className="bg-white border border-gray-200 rounded-xl px-4 py-3">
                    <div className="flex items-center justify-between mb-1">
                      <div>
                        <p className="text-sm font-semibold text-gray-900">{r.name}</p>
                        <p className="text-[11px] text-gray-400">{r.emp_code} · {r.department_name || ''}</p>
                      </div>
                      <div className="text-right">
                        <p className={'text-base font-bold ' + hrsColor}>{r.avgDaily}h</p>
                        <p className="text-[9px] text-gray-400">avg/day</p>
                      </div>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-1.5 mb-1">
                      <div className={'h-1.5 rounded-full ' + barColor} style={{ width: barWidth + '%' }} />
                    </div>
                    <div className="flex gap-3 text-[11px] text-gray-500">
                      <span>Total: <strong>{r.total_hours}h</strong></span>
                      <span>{r.days_present}d present</span>
                    </div>
                  </div>
                )
              })}
              {avgHrsPerPerson.length === 0 && <p className="text-sm text-gray-400 text-center py-8">No data</p>}
            </div>
          </>
        )
      })()}

      {/* DAR VIEW */}
      {view === 'dar' && (function () {
        var filtered = filterBySearch(darData)
        filtered.sort(function (a, b) { return a.compliance_pct - b.compliance_pct })

        var totalPresent = filtered.reduce(function (s, r) { return s + (r.days_present || 0) }, 0)
        var totalSubmitted = filtered.reduce(function (s, r) { return s + (r.days_submitted || 0) }, 0)
        var overallPct = totalPresent > 0 ? Math.round((totalSubmitted / totalPresent) * 100) : 0

        return darLoading ? (
          <p className="text-sm text-gray-400 text-center py-12">Loading\u2026</p>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-2 mb-3">
              <div className="bg-white border border-gray-200 rounded-lg px-2 py-2.5 text-center">
                <p className="text-[8px] font-semibold text-gray-400 uppercase">Overall</p>
                <p className={'text-base font-bold ' + pctColor(overallPct)}>{overallPct}%</p>
              </div>
              <div className="bg-white border border-gray-200 rounded-lg px-2 py-2.5 text-center">
                <p className="text-[8px] font-semibold text-gray-400 uppercase">Submitted</p>
                <p className="text-base font-bold text-emerald-600">{totalSubmitted}</p>
              </div>
              <div className="bg-white border border-gray-200 rounded-lg px-2 py-2.5 text-center">
                <p className="text-[8px] font-semibold text-gray-400 uppercase">Expected</p>
                <p className="text-base font-bold text-slate-700">{totalPresent}</p>
              </div>
            </div>

            <div className="space-y-2">
              {filtered.map(function (r) {
                return (
                  <div key={r.employee_id} className="bg-white border border-gray-200 rounded-xl px-4 py-3">
                    <div className="flex items-center justify-between mb-1.5">
                      <div>
                        <p className="text-sm font-semibold text-gray-900">{r.name}</p>
                        <p className="text-[11px] text-gray-400">{r.emp_code} · {r.department_name || ''}</p>
                      </div>
                      <div className="text-right">
                        <p className={'text-lg font-bold ' + pctColor(r.compliance_pct)}>{r.compliance_pct}%</p>
                      </div>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-1.5 mb-1.5">
                      <div className={'h-1.5 rounded-full ' + pctBg(r.compliance_pct)} style={{ width: r.compliance_pct + '%' }} />
                    </div>
                    <div className="flex gap-3 text-[11px] text-gray-500">
                      <span className="text-emerald-600 font-semibold">{r.days_submitted} submitted</span>
                      <span>{r.days_present} days present</span>
                    </div>
                  </div>
                )
              })}
              {filtered.length === 0 && <p className="text-sm text-gray-400 text-center py-8">No data</p>}
            </div>
          </>
        )
      })()}
    </div>
  )
}
