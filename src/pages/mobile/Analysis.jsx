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
  if (pct >= 90) return '#059669'
  if (pct >= 75) return '#d97706'
  return '#dc2626'
}

function pctTextClass(pct) {
  if (pct >= 90) return 'text-emerald-600'
  if (pct >= 75) return 'text-amber-600'
  return 'text-red-600'
}

function hrsColor(h) {
  if (h >= 8) return '#059669'
  if (h >= 6) return '#d97706'
  return '#dc2626'
}

function hrsTextClass(h) {
  if (h >= 8) return 'text-emerald-600'
  if (h >= 6) return 'text-amber-600'
  return 'text-red-600'
}

/* ── Mini SVG Components ── */

function DonutChart({ pct, size, color, stroke }) {
  size = size || 44
  stroke = stroke || 4
  var r = (size - stroke) / 2
  var circ = 2 * Math.PI * r
  var clamped = Math.min(pct, 100)
  var offset = clamped >= 100 ? 0.001 : circ - (clamped / 100) * circ
  return (
    <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#f1f5f9" strokeWidth={stroke} />
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color || '#059669'}
        strokeWidth={stroke} strokeDasharray={circ} strokeDashoffset={offset}
        strokeLinecap="round" style={{ transition: 'stroke-dashoffset 0.6s ease' }} />
    </svg>
  )
}

function TimeRangeBar({ inSecs, outSecs }) {
  var minT = 21600, maxT = 82800, span = maxT - minT
  var left = Math.max(0, Math.min(100, ((inSecs - minT) / span) * 100))
  var right = Math.max(0, Math.min(100, ((outSecs - minT) / span) * 100))
  var width = Math.max(right - left, 2)
  return (
    <div className="relative w-full h-2 bg-slate-100 rounded-full overflow-hidden">
      <div className="absolute h-full rounded-full" style={{
        left: left + '%', width: width + '%',
        background: 'linear-gradient(90deg, #3b82f6, #8b5cf6)'
      }} />
    </div>
  )
}

/* ── Stat Card ── */
function StatCard({ label, value, sub, color, icon, donut }) {
  return (
    <div className="relative overflow-hidden rounded-2xl bg-white border border-slate-100 px-3 py-3"
      style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
      {donut != null && (
        <div className="absolute -right-1 -top-1 opacity-20">
          <DonutChart pct={donut} size={48} color={color} stroke={3} />
        </div>
      )}
      <p className="text-[9px] font-bold tracking-wider uppercase" style={{ color: '#94a3b8' }}>{label}</p>
      <p className="text-xl font-extrabold mt-0.5" style={{ color: color || '#1e293b', letterSpacing: '-0.02em' }}>{value}</p>
      {sub && <p className="text-[10px] mt-0.5" style={{ color: '#94a3b8' }}>{sub}</p>}
      {icon && <span className="absolute right-2.5 bottom-2 text-lg opacity-10">{icon}</span>}
    </div>
  )
}

export default function Analysis() {
  var { employee } = useAuth()
  var now = new Date()
  var [year, setYear] = useState(now.getFullYear())
  var [month, setMonth] = useState(now.getMonth() + 1)
  var [view, setView] = useState('concerns')
  var [depts, setDepts] = useState([])
  var [deptFilter, setDeptFilter] = useState('')
  var [managerDeptIds, setManagerDeptIds] = useState([employee.department_id])
  var [deptNames, setDeptNames] = useState({})

  var [timingData, setTimingData] = useState([])
  var [timingLoading, setTimingLoading] = useState(false)
  var [monthlyData, setMonthlyData] = useState([])
  var [monthlyLoading, setMonthlyLoading] = useState(false)
  var [darData, setDarData] = useState([])
  var [darLoading, setDarLoading] = useState(false)

  var [search, setSearch] = useState('')
  var isCurrentMonth = year === now.getFullYear() && month === now.getMonth() + 1

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

  var loadTiming = useCallback(async function () {
    setTimingLoading(true)
    var { data } = await supabase.rpc('avg_punch_times', {
      p_year: year, p_month: month,
      p_department_id: deptFilter ? Number(deptFilter) : null
    })
    var filtered = data || []
    if (employee.role !== 'admin' && !deptFilter) {
      filtered = filtered.filter(function (r) { return managerDeptIds.includes(r.department_id) })
    }
    setTimingData(filtered)
    setTimingLoading(false)
  }, [year, month, deptFilter, managerDeptIds, employee.role])

  var loadMonthly = useCallback(async function () {
    setMonthlyLoading(true)
    var { data } = await supabase.rpc('monthly_summary', {
      p_year: year, p_month: month,
      p_department_id: deptFilter ? Number(deptFilter) : null
    })
    var filtered = data || []
    if (employee.role !== 'admin' && !deptFilter) {
      filtered = filtered.filter(function (r) { return managerDeptIds.includes(r.department_id) })
    }
    setMonthlyData(filtered)
    setMonthlyLoading(false)
  }, [year, month, deptFilter, managerDeptIds, employee.role])

  var loadDAR = useCallback(async function () {
    setDarLoading(true)
    var { data } = await supabase.rpc('dar_compliance', {
      p_year: year, p_month: month,
      p_department_id: deptFilter ? Number(deptFilter) : null
    })
    var filtered = data || []
    if (employee.role !== 'admin' && !deptFilter) {
      filtered = filtered.filter(function (r) { return managerDeptIds.includes(r.department_id) })
    }
    setDarData(filtered)
    setDarLoading(false)
  }, [year, month, deptFilter, managerDeptIds, employee.role])

  useEffect(function () {
    if (view === 'timing') loadTiming()
    if (view === 'attendance') loadMonthly()
    if (view === 'hours') loadMonthly()
    if (view === 'dar') loadDAR()
    if (view === 'concerns') { loadTiming(); loadMonthly(); loadDAR() }
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

  var views = [
    { key: 'concerns', label: 'Concerns', emoji: '🚨' },
    { key: 'timing', label: 'Timing', emoji: '⏱' },
    { key: 'attendance', label: 'Attend', emoji: '📊' },
    { key: 'hours', label: 'Hours', emoji: '⏳' },
    { key: 'dar', label: 'DARs', emoji: '📝' },
  ]

  var isLoading = (view === 'timing' && timingLoading) ||
    ((view === 'attendance' || view === 'hours') && monthlyLoading) ||
    (view === 'dar' && darLoading) ||
    (view === 'concerns' && (timingLoading || monthlyLoading || darLoading))

  return (
    <div className="pb-4">
      {/* Header with month nav */}
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className="text-lg font-extrabold text-slate-900" style={{ letterSpacing: '-0.03em' }}>Analysis</h2>
          <p className="text-[11px] font-medium text-slate-400 -mt-0.5">{MONTHS[month - 1]} {year} Overview</p>
        </div>
        <div className="flex items-center gap-1 bg-slate-50 rounded-xl px-1 py-0.5">
          <button onClick={prevMonth}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-500 hover:bg-white hover:shadow-sm active:scale-95 transition-all text-sm font-bold">‹</button>
          <span className="text-xs font-bold text-slate-600 min-w-[52px] text-center">{MONTHS[month - 1].toUpperCase()}</span>
          <button onClick={nextMonth} disabled={isCurrentMonth}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-500 hover:bg-white hover:shadow-sm active:scale-95 transition-all text-sm font-bold disabled:opacity-20">›</button>
        </div>
      </div>

      {/* View pills */}
      <div className="flex gap-1.5 mb-3 overflow-x-auto pb-1 -mx-1 px-1">
        {views.map(function (v) {
          var active = view === v.key
          return (
            <button key={v.key} onClick={function () { setView(v.key); setSearch('') }}
              className={'flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap ' +
                (active
                  ? 'bg-slate-800 text-white shadow-md shadow-slate-300'
                  : 'bg-white text-slate-500 border border-slate-100 hover:border-slate-200')}>
              <span className="text-[10px]">{v.emoji}</span> {v.label}
            </button>
          )
        })}
      </div>

      {/* Dept filter */}
      {employee.role === 'admin' && depts.length > 0 && (
        <select value={deptFilter} onChange={function (e) { setDeptFilter(e.target.value) }}
          className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-medium mb-3 bg-white focus:outline-none focus:ring-2 focus:ring-slate-300">
          <option value="">All Departments</option>
          {depts.map(function (d) { return <option key={d.id} value={d.id}>{d.name}</option> })}
        </select>
      )}
      {employee.role === 'manager' && managerDeptIds.length > 1 && (
        <select value={deptFilter} onChange={function (e) { setDeptFilter(e.target.value) }}
          className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-medium mb-3 bg-white focus:outline-none focus:ring-2 focus:ring-slate-300">
          <option value="">All My Departments</option>
          {managerDeptIds.map(function (id) { return <option key={id} value={id}>{deptNames[id] || 'Dept ' + id}</option> })}
        </select>
      )}

      {/* Search */}
      <div className="relative mb-3">
        <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
        </svg>
        <input type="text" value={search} onChange={function (e) { setSearch(e.target.value) }}
          placeholder="Search name or code…"
          className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-xl text-xs font-medium bg-white focus:outline-none focus:ring-2 focus:ring-slate-300 placeholder:text-slate-300" />
      </div>

      {/* Loading state */}
      {isLoading && (
        <div className="flex items-center justify-center py-16">
          <div className="w-6 h-6 border-2 border-slate-200 border-t-slate-600 rounded-full animate-spin" />
        </div>
      )}

      {/* ─── CONCERNS VIEW ─── */}
      {view === 'concerns' && !timingLoading && !monthlyLoading && !darLoading && (function () {
        var empMap = {}
        function getEmp(id, name, code, dept) {
          if (!empMap[id]) empMap[id] = { id: id, name: name, emp_code: code, department_name: dept, score: 0, tags: [] }
          return empMap[id]
        }

        timingData.forEach(function (r) {
          var e = getEmp(r.employee_id, r.name, r.emp_code, r.department_name)
          var avgInHr = (r.avg_in_secs || 0) / 3600
          if (avgInHr >= 12) { e.score += 30; e.tags.push({ label: 'Late arrival', color: '#dc2626' }) }
          else if (avgInHr >= 11) { e.score += 15; e.tags.push({ label: 'Late-ish', color: '#f97316' }) }
          if (r.avg_hours < 6) { e.score += 25; e.tags.push({ label: 'Very low hours', color: '#dc2626' }) }
          else if (r.avg_hours < 8) { e.score += 10; e.tags.push({ label: 'Low hours', color: '#d97706' }) }
        })

        monthlyData.filter(function (r) { return !r.is_casual && r.effective_days > 0 }).forEach(function (r) {
          var e = getEmp(r.employee_id, r.name, r.emp_code, r.department_name)
          var attPct = ((r.days_present + (r.days_half || 0) * 0.5) / r.effective_days) * 100
          if (attPct < 50) { e.score += 35; e.tags.push({ label: 'Critical attendance', color: '#dc2626' }) }
          else if (attPct < 75) { e.score += 20; e.tags.push({ label: 'Low attendance', color: '#f97316' }) }
          if ((r.days_incomplete || 0) >= 3) { e.score += 15; e.tags.push({ label: r.days_incomplete + ' incomplete', color: '#d97706' }) }
          var daysWorked = (r.days_present || 0) + (r.days_half || 0)
          var avgH = daysWorked > 0 ? r.total_hours / daysWorked : 0
          if (avgH > 0 && avgH < 6) { e.score += 25; e.tags.push({ label: 'Avg <6h', color: '#dc2626' }) }
          else if (avgH > 0 && avgH < 8) { e.score += 10; e.tags.push({ label: 'Avg <8h', color: '#d97706' }) }
        })

        darData.forEach(function (r) {
          var e = getEmp(r.employee_id, r.name, r.emp_code, r.department_name)
          if (r.compliance_pct < 30) { e.score += 25; e.tags.push({ label: 'DAR <30%', color: '#dc2626' }) }
          else if (r.compliance_pct < 70) { e.score += 12; e.tags.push({ label: 'DAR <70%', color: '#d97706' }) }
        })

        var ranked = Object.values(empMap).filter(function (e) { return e.score > 0 })
        ranked.sort(function (a, b) { return b.score - a.score })
        var top10 = ranked.slice(0, 10)
        var maxScore = top10.length > 0 ? top10[0].score : 100

        return (
          <>
            <div className="bg-white border border-slate-100 rounded-2xl p-3 mb-3" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
              <p className="text-[9px] font-bold tracking-wider uppercase text-slate-400 mb-1">Top Concerns · {MONTHS[month - 1]} {year}</p>
              <p className="text-[10px] text-slate-400">Employees ranked by composite concern score across timing, attendance, hours, and DAR compliance.</p>
            </div>

            {top10.length === 0 && <p className="text-xs text-slate-400 text-center py-12">No concerns this period 🎉</p>}

            <div className="space-y-1.5">
              {top10.map(function (e, i) {
                var barPct = maxScore > 0 ? Math.round((e.score / maxScore) * 100) : 0
                var barColor = e.score >= 60 ? '#dc2626' : e.score >= 30 ? '#f97316' : '#d97706'
                return (
                  <div key={e.id} className="bg-white border border-slate-100 rounded-2xl px-3.5 py-2.5"
                    style={{ boxShadow: '0 1px 2px rgba(0,0,0,0.03)' }}>
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-extrabold text-white flex-shrink-0"
                        style={{ background: barColor }}>
                        {i + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <p className="text-[13px] font-bold text-slate-800 truncate">{e.name}</p>
                          <p className="text-sm font-extrabold" style={{ color: barColor }}>{Math.round(e.score)}</p>
                        </div>
                        <p className="text-[10px] text-slate-400 font-medium">{e.emp_code} · {e.department_name || ''}</p>
                        <div className="w-full bg-slate-100 rounded-full h-1.5 mt-1">
                          <div className="h-1.5 rounded-full transition-all duration-500" style={{ width: barPct + '%', background: barColor }} />
                        </div>
                        <div className="flex flex-wrap gap-1 mt-1.5">
                          {e.tags.map(function (t, ti) {
                            return (
                              <span key={ti} className="text-[9px] font-bold px-1.5 py-0.5 rounded-full text-white"
                                style={{ background: t.color, opacity: 0.85 }}>
                                {t.label}
                              </span>
                            )
                          })}
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>

            <div className="mt-4 bg-slate-50 border border-slate-100 rounded-2xl p-3">
              <p className="text-[9px] font-bold tracking-wider uppercase text-slate-400 mb-2">Scoring Criteria</p>
              <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[9px] text-slate-500">
                <span>Late arrival (after 12PM): <strong>30</strong></span>
                <span>Critical attend (&lt;50%): <strong>35</strong></span>
                <span>Very low hours (&lt;6h): <strong>25</strong></span>
                <span>DAR &lt;30%: <strong>25</strong></span>
                <span>Low attendance (&lt;75%): <strong>20</strong></span>
                <span>3+ incomplete days: <strong>15</strong></span>
                <span>DAR &lt;70%: <strong>12</strong></span>
                <span>Low hours (&lt;8h): <strong>10</strong></span>
              </div>
            </div>
          </>
        )
      })()}

      {/* ─── TIMING VIEW ─── */}
      {view === 'timing' && !timingLoading && (function () {
        var filtered = filterBySearch(timingData)
        var avgIn = filtered.length > 0 ? Math.round(filtered.reduce(function (s, r) { return s + (r.avg_in_secs || 0) }, 0) / filtered.length) : 0
        var avgOut = filtered.length > 0 ? Math.round(filtered.reduce(function (s, r) { return s + (r.avg_out_secs || 0) }, 0) / filtered.length) : 0
        var avgHrs = filtered.length > 0 ? Math.round(filtered.reduce(function (s, r) { return s + (r.avg_hours || 0) }, 0) / filtered.length * 10) / 10 : 0

        var inBuckets = new Array(8).fill(0)
        filtered.forEach(function (r) {
          var h = Math.floor((r.avg_in_secs || 0) / 3600)
          var idx = Math.max(0, Math.min(7, h - 6))
          inBuckets[idx]++
        })
        var maxBucket = Math.max.apply(null, inBuckets.concat([1]))

        return (
          <>
            <div className="grid grid-cols-3 gap-2 mb-3">
              <StatCard label="Avg In" value={fmtSecs(avgIn)} icon="🌅" />
              <StatCard label="Avg Out" value={fmtSecs(avgOut)} icon="🌆" />
              <StatCard label="Avg Hrs" value={avgHrs + 'h'} color="#3b82f6" icon="⏱" />
            </div>

            {filtered.length > 0 && (
              <div className="bg-white border border-slate-100 rounded-2xl p-3 mb-3" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
                <p className="text-[9px] font-bold tracking-wider uppercase text-slate-400 mb-2">Punch-In Distribution</p>
                <div className="flex items-end gap-1 h-10">
                  {inBuckets.map(function (count, i) {
                    var h = maxBucket > 0 ? (count / maxBucket) * 36 : 0
                    var label = (i + 6 > 12 ? (i + 6 - 12) + 'P' : (i + 6) + 'A')
                    return (
                      <div key={i} className="flex-1 flex flex-col items-center">
                        <div className="w-full rounded-t" style={{
                          height: Math.max(h, 2) + 'px',
                          background: count > 0 ? 'linear-gradient(180deg, #3b82f6, #6366f1)' : '#e2e8f0',
                          borderRadius: '3px 3px 0 0',
                          transition: 'height 0.4s ease'
                        }} />
                        <span className="text-[7px] text-slate-400 mt-0.5 font-medium">{label}</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            <div className="space-y-1.5">
              {filtered.map(function (r) {
                return (
                  <div key={r.employee_id} className="bg-white border border-slate-100 rounded-2xl px-3.5 py-2.5"
                    style={{ boxShadow: '0 1px 2px rgba(0,0,0,0.03)' }}>
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="min-w-0 flex-1">
                        <p className="text-[13px] font-bold text-slate-800 truncate">{r.name}</p>
                        <p className="text-[10px] text-slate-400 font-medium">{r.emp_code} · {r.department_name || ''}</p>
                      </div>
                      <div className="flex items-center gap-2 ml-2">
                        <span className={'text-sm font-extrabold ' + hrsTextClass(r.avg_hours)}>{r.avg_hours}h</span>
                        <span className="text-[9px] text-slate-400 font-medium">{r.days_worked}d</span>
                      </div>
                    </div>
                    <TimeRangeBar inSecs={r.avg_in_secs || 0} outSecs={r.avg_out_secs || 0} />
                    <div className="flex gap-3 mt-1.5 text-[10px] text-slate-500 font-medium">
                      <span>In <strong className="text-slate-700">{fmtSecs(r.avg_in_secs)}</strong></span>
                      <span>Out <strong className="text-slate-700">{fmtSecs(r.avg_out_secs)}</strong></span>
                      <span className="text-slate-400">{r.min_hours}–{r.max_hours}h</span>
                    </div>
                  </div>
                )
              })}
              {filtered.length === 0 && <p className="text-xs text-slate-400 text-center py-12">No data for this period</p>}
            </div>
          </>
        )
      })()}

      {/* ─── ATTENDANCE VIEW ─── */}
      {view === 'attendance' && !monthlyLoading && (function () {
        var filtered = filterBySearch(monthlyData).filter(function (r) { return !r.is_casual })
        filtered.sort(function (a, b) {
          var pctA = a.effective_days > 0 ? (a.days_present + (a.days_half || 0) * 0.5) / a.effective_days : 0
          var pctB = b.effective_days > 0 ? (b.days_present + (b.days_half || 0) * 0.5) / b.effective_days : 0
          return pctA - pctB
        })

        var totalPresent = filtered.reduce(function (s, r) { return s + (r.days_present || 0) + (r.days_half || 0) * 0.5 }, 0)
        var totalEffective = filtered.reduce(function (s, r) { return s + (r.effective_days || 0) }, 0)
        var overallPct = totalEffective > 0 ? Math.round((totalPresent / totalEffective) * 100) : 0

        var attBuckets = [0, 0, 0, 0, 0]
        filtered.forEach(function (r) {
          var p = r.attendance_pct != null ? r.attendance_pct : (r.effective_days > 0 ? Math.round(((r.days_present + (r.days_half || 0) * 0.5) / r.effective_days) * 100) : 0)
          if (p < 60) attBuckets[0]++
          else if (p < 75) attBuckets[1]++
          else if (p < 85) attBuckets[2]++
          else if (p < 95) attBuckets[3]++
          else attBuckets[4]++
        })
        var attColors = ['#dc2626', '#f97316', '#d97706', '#059669', '#047857']
        var attLabels = ['<60', '60s', '70s', '80s', '90+']

        return (
          <>
            <div className="grid grid-cols-3 gap-2 mb-3">
              <div className="relative rounded-2xl bg-white border border-slate-100 px-3 py-3 flex items-center gap-2"
                style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
                <DonutChart pct={overallPct} size={38} color={pctColor(overallPct)} stroke={3.5} />
                <div>
                  <p className="text-[9px] font-bold tracking-wider uppercase text-slate-400">Att %</p>
                  <p className="text-lg font-extrabold" style={{ color: pctColor(overallPct), letterSpacing: '-0.02em' }}>{overallPct}%</p>
                </div>
              </div>
              <StatCard label="Half Days" value={filtered.reduce(function (s, r) { return s + (r.days_half || 0) }, 0)} color="#f97316" icon="½" />
              <StatCard label="Absent" value={filtered.reduce(function (s, r) { return s + (r.days_absent || 0) }, 0)} color="#dc2626" icon="✕" />
            </div>

            {filtered.length > 0 && (
              <div className="bg-white border border-slate-100 rounded-2xl p-3 mb-3" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
                <p className="text-[9px] font-bold tracking-wider uppercase text-slate-400 mb-2">Attendance Distribution</p>
                <div className="flex items-end gap-1.5 h-10">
                  {attBuckets.map(function (count, i) {
                    var maxB = Math.max.apply(null, attBuckets.concat([1]))
                    var h = maxB > 0 ? (count / maxB) * 36 : 0
                    return (
                      <div key={i} className="flex-1 flex flex-col items-center">
                        {count > 0 && <span className="text-[8px] font-bold text-slate-500 mb-0.5">{count}</span>}
                        <div className="w-full" style={{
                          height: Math.max(h, 2) + 'px',
                          background: attColors[i],
                          borderRadius: '3px 3px 0 0',
                          opacity: 0.8,
                          transition: 'height 0.4s ease'
                        }} />
                        <span className="text-[7px] text-slate-400 mt-0.5 font-bold">{attLabels[i]}</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            <div className="space-y-1.5">
              {filtered.map(function (r) {
                var pct = r.attendance_pct != null ? r.attendance_pct : (r.effective_days > 0 ? Math.round(((r.days_present + (r.days_half || 0) * 0.5) / r.effective_days) * 100) : 0)
                return (
                  <div key={r.employee_id} className="bg-white border border-slate-100 rounded-2xl px-3.5 py-2.5"
                    style={{ boxShadow: '0 1px 2px rgba(0,0,0,0.03)' }}>
                    <div className="flex items-center gap-2.5">
                      <DonutChart pct={pct} size={36} color={pctColor(pct)} stroke={3} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <p className="text-[13px] font-bold text-slate-800 truncate">{r.name}</p>
                          <p className={'text-sm font-extrabold ' + pctTextClass(pct)}>{pct}%</p>
                        </div>
                        <p className="text-[10px] text-slate-400 font-medium">{r.emp_code} · {r.department_name || ''}</p>
                        <div className="flex gap-2.5 mt-1 text-[10px] font-bold">
                          <span className="text-emerald-600">{r.days_present || 0}P</span>
                          <span className="text-orange-500">{r.days_half || 0}H</span>
                          <span className="text-red-500">{r.days_absent || 0}A</span>
                          <span className="text-amber-500">{r.days_incomplete || 0}Inc</span>
                          <span className="text-slate-400 font-medium">{r.total_hours}h</span>
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
              {filtered.length === 0 && <p className="text-xs text-slate-400 text-center py-12">No data</p>}
            </div>
          </>
        )
      })()}

      {/* ─── HOURS VIEW ─── */}
      {view === 'hours' && !monthlyLoading && (function () {
        var filtered = filterBySearch(monthlyData).filter(function (r) { return !r.is_casual && r.effective_days > 0 })
        var avgHrsPerPerson = filtered.map(function (r) {
          var daysWorked = (r.days_present || 0) + (r.days_half || 0)
          return { ...r, avgDaily: daysWorked > 0 ? Math.round((r.total_hours / daysWorked) * 10) / 10 : 0 }
        })
        avgHrsPerPerson.sort(function (a, b) { return a.avgDaily - b.avgDaily })

        var overallAvg = avgHrsPerPerson.length > 0
          ? Math.round(avgHrsPerPerson.reduce(function (s, r) { return s + r.avgDaily }, 0) / avgHrsPerPerson.length * 10) / 10 : 0
        var below8 = avgHrsPerPerson.filter(function (r) { return r.avgDaily < 8 }).length
        var above10 = avgHrsPerPerson.filter(function (r) { return r.avgDaily >= 10 }).length

        var hrValues = avgHrsPerPerson.map(function (r) { return r.avgDaily })
        var hrColors = avgHrsPerPerson.map(function (r) { return hrsColor(r.avgDaily) })
        var maxHr = hrValues.length > 0 ? Math.max.apply(null, hrValues) : 14

        return (
          <>
            <div className="grid grid-cols-3 gap-2 mb-3">
              <StatCard label="Avg Daily" value={overallAvg + 'h'} color="#3b82f6" icon="📊" />
              <StatCard label="< 8h Avg" value={below8} color="#dc2626" icon="⚠" />
              <StatCard label="≥ 10h Avg" value={above10} color="#059669" icon="💪" />
            </div>

            {hrValues.length > 0 && (
              <div className="bg-white border border-slate-100 rounded-2xl p-3 mb-3" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
                <p className="text-[9px] font-bold tracking-wider uppercase text-slate-400 mb-2">Hours per Person (sorted low→high)</p>
                <div className="flex items-end gap-px h-10">
                  {hrValues.map(function (v, i) {
                    var h = maxHr > 0 ? (v / maxHr) * 36 : 0
                    return (
                      <div key={i} className="flex-1" style={{
                        height: Math.max(h, 1) + 'px',
                        background: hrColors[i],
                        borderRadius: '2px 2px 0 0',
                        opacity: 0.75,
                        transition: 'height 0.3s ease'
                      }} />
                    )
                  })}
                </div>
                <div className="flex justify-between mt-1">
                  <span className="text-[7px] text-red-400 font-bold">Low</span>
                  <span className="text-[7px] text-slate-300">— 8h threshold —</span>
                  <span className="text-[7px] text-emerald-500 font-bold">High</span>
                </div>
              </div>
            )}

            <div className="space-y-1.5">
              {avgHrsPerPerson.map(function (r) {
                var barWidth = Math.min(Math.round((r.avgDaily / 14) * 100), 100)
                return (
                  <div key={r.employee_id} className="bg-white border border-slate-100 rounded-2xl px-3.5 py-2.5"
                    style={{ boxShadow: '0 1px 2px rgba(0,0,0,0.03)' }}>
                    <div className="flex items-center justify-between mb-1">
                      <div className="min-w-0 flex-1">
                        <p className="text-[13px] font-bold text-slate-800 truncate">{r.name}</p>
                        <p className="text-[10px] text-slate-400 font-medium">{r.emp_code} · {r.department_name || ''}</p>
                      </div>
                      <div className="text-right ml-2">
                        <p className={'text-sm font-extrabold ' + hrsTextClass(r.avgDaily)}>{r.avgDaily}h</p>
                        <p className="text-[8px] text-slate-400">avg/day</p>
                      </div>
                    </div>
                    <div className="w-full bg-slate-100 rounded-full h-1.5">
                      <div className="h-1.5 rounded-full transition-all duration-500" style={{
                        width: barWidth + '%',
                        background: 'linear-gradient(90deg, ' + hrsColor(r.avgDaily) + ', ' + hrsColor(r.avgDaily) + '88)'
                      }} />
                    </div>
                    <div className="flex gap-3 mt-1 text-[10px] text-slate-500 font-medium">
                      <span>Total <strong className="text-slate-700">{r.total_hours}h</strong></span>
                      <span>{r.days_present}d present</span>
                    </div>
                  </div>
                )
              })}
              {avgHrsPerPerson.length === 0 && <p className="text-xs text-slate-400 text-center py-12">No data</p>}
            </div>
          </>
        )
      })()}

      {/* ─── DAR VIEW ─── */}
      {view === 'dar' && !darLoading && (function () {
        var filtered = filterBySearch(darData)
        filtered.sort(function (a, b) { return a.compliance_pct - b.compliance_pct })

        var totalPresent = filtered.reduce(function (s, r) { return s + (r.days_present || 0) }, 0)
        var totalSubmitted = filtered.reduce(function (s, r) { return s + (r.days_submitted || 0) }, 0)
        var overallPct = totalPresent > 0 ? Math.min(100, Math.round((totalSubmitted / totalPresent) * 100)) : 0
        var perfect = filtered.filter(function (r) { return r.compliance_pct >= 100 }).length
        var zero = filtered.filter(function (r) { return r.compliance_pct === 0 }).length
        var isRecent = year === now.getFullYear() && month === now.getMonth() + 1

        return (
          <>
            {isRecent && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 mb-3">
                <p className="text-[10px] text-amber-700 font-medium">🕑 Today's DARs may not be reflected yet (nightly consolidation at 11:20 PM)</p>
              </div>
            )}
            {filtered.length > 0 && filtered[0].dar_cutoff && (
              <div className="bg-slate-50 border border-slate-100 rounded-xl px-3 py-1.5 mb-3">
                <p className="text-[10px] text-slate-500 font-medium">📅 DAR data through <strong className="text-slate-700">{filtered[0].dar_cutoff}</strong></p>
              </div>
            )}
            <div className="grid grid-cols-3 gap-2 mb-3">
              <div className="relative overflow-hidden rounded-2xl bg-white border border-slate-100 px-3 py-3 flex items-center gap-2"
                style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
                <DonutChart pct={overallPct} size={38} color={pctColor(overallPct)} stroke={3.5} />
                <div>
                  <p className="text-[9px] font-bold tracking-wider uppercase text-slate-400">Rate</p>
                  <p className="text-lg font-extrabold" style={{ color: pctColor(overallPct), letterSpacing: '-0.02em' }}>{overallPct}%</p>
                </div>
              </div>
              <StatCard label="100% ✓" value={perfect} color="#059669" />
              <StatCard label="0% ✕" value={zero} color="#dc2626" />
            </div>

            <div className="space-y-1.5">
              {filtered.map(function (r) {
                return (
                  <div key={r.employee_id} className="bg-white border border-slate-100 rounded-2xl px-3.5 py-2.5"
                    style={{ boxShadow: '0 1px 2px rgba(0,0,0,0.03)' }}>
                    <div className="flex items-center gap-2.5">
                      <DonutChart pct={r.compliance_pct} size={36} color={pctColor(r.compliance_pct)} stroke={3} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <p className="text-[13px] font-bold text-slate-800 truncate">{r.name}</p>
                          <p className={'text-sm font-extrabold ' + pctTextClass(r.compliance_pct)}>{r.compliance_pct}%</p>
                        </div>
                        <p className="text-[10px] text-slate-400 font-medium">{r.emp_code} · {r.department_name || ''}</p>
                        <div className="flex gap-3 mt-1 text-[10px] font-medium">
                          <span className="text-emerald-600">{r.days_submitted} submitted</span>
                          <span className="text-slate-400">{r.days_present} present</span>
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
              {filtered.length === 0 && <p className="text-xs text-slate-400 text-center py-12">No data</p>}
            </div>
          </>
        )
      })()}
    </div>
  )
}
