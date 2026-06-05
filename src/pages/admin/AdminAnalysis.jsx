import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/useAuth'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, Legend, PieChart, Pie } from 'recharts'

var MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

function fmtSecs(secs) {
  if (!secs && secs !== 0) return '—'
  var h = Math.floor(secs / 3600)
  var m = Math.floor((secs % 3600) / 60)
  var ampm = h >= 12 ? 'PM' : 'AM'
  h = h % 12 || 12
  return h + ':' + String(m).padStart(2, '0') + ' ' + ampm
}

function fmtHour(decimalHour) {
  var h = Math.floor(decimalHour)
  var ampm = h >= 12 ? 'PM' : 'AM'
  h = h % 12 || 12
  return h + ' ' + ampm
}

var COLORS = {
  emerald: '#10b981', red: '#ef4444', amber: '#f59e0b', blue: '#3b82f6',
  purple: '#8b5cf6', orange: '#f97316', slate: '#475569', teal: '#14b8a6'
}

export default function AdminAnalysis() {
  var { employee } = useAuth()
  var now = new Date()
  var [year, setYear] = useState(now.getFullYear())
  var [month, setMonth] = useState(now.getMonth() + 1)
  var [view, setView] = useState('timing')
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
    setTimingData(data || [])
    setTimingLoading(false)
  }, [year, month, deptFilter])

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
    setDarData(data || [])
    setDarLoading(false)
  }, [year, month, deptFilter])

  useEffect(function () {
    if (view === 'timing') loadTiming()
    if (view === 'attendance' || view === 'hours') loadMonthly()
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

  var TABS = [
    { key: 'timing', label: 'Punch Timing' },
    { key: 'attendance', label: 'Attendance' },
    { key: 'hours', label: 'Hours' },
    { key: 'dar', label: 'DAR Compliance' },
  ]

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-lg font-bold text-gray-900">Analysis</h2>
          <p className="text-xs text-gray-500">{MONTHS[month - 1]} {year}</p>
        </div>
        <div className="flex items-center gap-3">
          {/* Dept filter */}
          {employee.role === 'admin' && depts.length > 0 && (
            <select value={deptFilter} onChange={function (e) { setDeptFilter(e.target.value) }}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-slate-700">
              <option value="">All Departments</option>
              {depts.map(function (d) { return <option key={d.id} value={d.id}>{d.name}</option> })}
            </select>
          )}
          {employee.role === 'manager' && managerDeptIds.length > 1 && (
            <select value={deptFilter} onChange={function (e) { setDeptFilter(e.target.value) }}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-slate-700">
              <option value="">All My Departments</option>
              {managerDeptIds.map(function (id) { return <option key={id} value={id}>{deptNames[id] || 'Dept ' + id}</option> })}
            </select>
          )}
          {/* Month nav */}
          <button onClick={prevMonth} className="px-3 py-2 text-sm bg-gray-100 rounded-lg hover:bg-gray-200">←</button>
          <span className="text-sm font-semibold text-gray-700 min-w-[90px] text-center">{MONTHS[month - 1]} {year}</span>
          <button onClick={nextMonth} disabled={isCurrentMonth} className="px-3 py-2 text-sm bg-gray-100 rounded-lg hover:bg-gray-200 disabled:opacity-30">→</button>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 mb-5 bg-white border border-gray-200 rounded-xl p-1 w-fit">
        {TABS.map(function (t) {
          return (
            <button key={t.key} onClick={function () { setView(t.key); setSearch('') }}
              className={'px-4 py-2 text-xs font-semibold rounded-lg transition-colors ' +
                (view === t.key ? 'bg-slate-800 text-white' : 'text-gray-600 hover:bg-gray-100')}>
              {t.label}
            </button>
          )
        })}
      </div>

      {/* Search */}
      <input type="text" value={search} onChange={function (e) { setSearch(e.target.value) }}
        placeholder="Search name or code\u2026"
        className="px-3 py-2 border border-gray-300 rounded-lg text-sm mb-4 w-64 focus:outline-none focus:ring-2 focus:ring-slate-700" />

      {/* TIMING VIEW */}
      {view === 'timing' && (function () {
        var filtered = filterBySearch(timingData)
        if (timingLoading) return <Loader />

        var chartData = filtered.map(function (r) {
          return {
            name: r.name.length > 12 ? r.name.slice(0, 12) + '\u2026' : r.name,
            fullName: r.name,
            inHour: r.avg_in_secs ? Math.round(r.avg_in_secs / 360) / 10 : 0,
            outHour: r.avg_out_secs ? Math.round(r.avg_out_secs / 360) / 10 : 0,
            hours: r.avg_hours || 0,
            days: r.days_worked
          }
        })

        var avgIn = filtered.length > 0 ? Math.round(filtered.reduce(function (s, r) { return s + (r.avg_in_secs || 0) }, 0) / filtered.length) : 0
        var avgOut = filtered.length > 0 ? Math.round(filtered.reduce(function (s, r) { return s + (r.avg_out_secs || 0) }, 0) / filtered.length) : 0
        var avgHrs = filtered.length > 0 ? Math.round(filtered.reduce(function (s, r) { return s + (r.avg_hours || 0) }, 0) / filtered.length * 10) / 10 : 0

        return (
          <>
            <div className="grid grid-cols-4 gap-4 mb-6">
              <StatCard label="Employees" value={filtered.length} />
              <StatCard label="Avg Punch In" value={fmtSecs(avgIn)} color="text-emerald-600" />
              <StatCard label="Avg Punch Out" value={fmtSecs(avgOut)} color="text-red-500" />
              <StatCard label="Avg Hours/Day" value={avgHrs + 'h'} color="text-blue-600" />
            </div>

            {/* Chart */}
            <div className="bg-white border border-gray-200 rounded-xl p-5 mb-6">
              <h3 className="text-sm font-bold text-gray-700 mb-4">Average punch-in and punch-out times</h3>
              <ResponsiveContainer width="100%" height={Math.max(filtered.length * 36, 200)}>
                <BarChart data={chartData} layout="vertical" margin={{ left: 100, right: 30, top: 5, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" domain={[8, 22]} tickFormatter={fmtHour} tick={{ fontSize: 11 }} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={100} />
                  <Tooltip formatter={function (val, name) {
                    return [fmtHour(val), name === 'inHour' ? 'Punch In' : 'Punch Out']
                  }} labelFormatter={function (label, payload) {
                    return payload && payload[0] ? payload[0].payload.fullName : label
                  }} />
                  <Bar dataKey="inHour" name="Punch In" fill={COLORS.emerald} radius={[4, 4, 4, 4]} barSize={10} />
                  <Bar dataKey="outHour" name="Punch Out" fill={COLORS.red} radius={[4, 4, 4, 4]} barSize={10} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Table */}
            <DataTable
              headers={['Employee', 'Dept', 'Days', 'Avg In', 'Avg Out', 'Avg Hrs', 'Min', 'Max']}
              rows={filtered.map(function (r) {
                var hrsClass = r.avg_hours >= 8 ? 'text-emerald-600 font-semibold' : r.avg_hours >= 6 ? 'text-amber-600 font-semibold' : 'text-red-600 font-semibold'
                return [
                  { text: r.name, sub: r.emp_code },
                  r.department_name || '—',
                  r.days_worked,
                  fmtSecs(r.avg_in_secs),
                  fmtSecs(r.avg_out_secs),
                  { text: r.avg_hours + 'h', className: hrsClass },
                  r.min_hours + 'h',
                  r.max_hours + 'h'
                ]
              })}
            />
          </>
        )
      })()}

      {/* ATTENDANCE VIEW */}
      {view === 'attendance' && (function () {
        var filtered = filterBySearch(monthlyData).filter(function (r) { return !r.is_casual })
        if (monthlyLoading) return <Loader />

        filtered.sort(function (a, b) {
          var pctA = a.effective_days > 0 ? a.days_present / a.effective_days : 0
          var pctB = b.effective_days > 0 ? b.days_present / b.effective_days : 0
          return pctA - pctB
        })

        var totalPresent = filtered.reduce(function (s, r) { return s + (r.days_present || 0) }, 0)
        var totalHalf = filtered.reduce(function (s, r) { return s + (r.days_half || 0) }, 0)
        var totalAbsent = filtered.reduce(function (s, r) { return s + (r.days_absent || 0) }, 0)
        var totalInc = filtered.reduce(function (s, r) { return s + (r.days_incomplete || 0) }, 0)
        var totalEffective = filtered.reduce(function (s, r) { return s + (r.effective_days || 0) }, 0)
        var overallPct = totalEffective > 0 ? Math.round((totalPresent / totalEffective) * 100) : 0

        var pieData = [
          { name: 'Present', value: totalPresent, color: COLORS.emerald },
          { name: 'Half Day', value: totalHalf, color: COLORS.orange },
          { name: 'Absent', value: totalAbsent, color: COLORS.red },
          { name: 'Incomplete', value: totalInc, color: COLORS.amber },
        ].filter(function (d) { return d.value > 0 })

        var chartData = filtered.map(function (r) {
          var pct = r.effective_days > 0 ? Math.round((r.days_present / r.effective_days) * 100) : 0
          return { name: r.name.length > 15 ? r.name.slice(0, 15) + '\u2026' : r.name, pct: pct, present: r.days_present, absent: r.days_absent, half: r.days_half }
        })

        return (
          <>
            <div className="grid grid-cols-5 gap-4 mb-6">
              <StatCard label="Staff" value={filtered.length} />
              <StatCard label="Overall Attendance" value={overallPct + '%'} color={overallPct >= 90 ? 'text-emerald-600' : overallPct >= 75 ? 'text-amber-600' : 'text-red-600'} />
              <StatCard label="Present Days" value={totalPresent} color="text-emerald-600" />
              <StatCard label="Absent Days" value={totalAbsent} color="text-red-600" />
              <StatCard label="Half Days" value={totalHalf} color="text-orange-600" />
            </div>

            <div className="grid grid-cols-3 gap-6 mb-6">
              {/* Pie chart */}
              <div className="bg-white border border-gray-200 rounded-xl p-5">
                <h3 className="text-sm font-bold text-gray-700 mb-3">Status breakdown</h3>
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} innerRadius={45} paddingAngle={2}>
                      {pieData.map(function (d, i) { return <Cell key={i} fill={d.color} /> })}
                    </Pie>
                    <Tooltip />
                    <Legend iconType="circle" wrapperStyle={{ fontSize: 11 }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              {/* Bar chart — attendance % per employee */}
              <div className="col-span-2 bg-white border border-gray-200 rounded-xl p-5">
                <h3 className="text-sm font-bold text-gray-700 mb-3">Attendance % by employee (lowest first)</h3>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="name" tick={{ fontSize: 9 }} angle={-35} textAnchor="end" height={60} />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} tickFormatter={function (v) { return v + '%' }} />
                    <Tooltip formatter={function (v) { return v + '%' }} />
                    <Bar dataKey="pct" name="Attendance %">
                      {chartData.map(function (d, i) {
                        return <Cell key={i} fill={d.pct >= 90 ? COLORS.emerald : d.pct >= 75 ? COLORS.amber : COLORS.red} />
                      })}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <DataTable
              headers={['Employee', 'Dept', 'Att %', 'Present', 'Half', 'Absent', 'Incomplete', 'Hours']}
              rows={filtered.map(function (r) {
                var pct = r.effective_days > 0 ? Math.round((r.days_present / r.effective_days) * 100) : 0
                var pctClass = pct >= 90 ? 'text-emerald-600 font-semibold' : pct >= 75 ? 'text-amber-600 font-semibold' : 'text-red-600 font-semibold'
                return [
                  { text: r.name, sub: r.emp_code },
                  r.department_name || '—',
                  { text: pct + '%', className: pctClass },
                  r.days_present || 0,
                  r.days_half || 0,
                  r.days_absent || 0,
                  r.days_incomplete || 0,
                  r.total_hours + 'h'
                ]
              })}
            />
          </>
        )
      })()}

      {/* HOURS VIEW */}
      {view === 'hours' && (function () {
        var filtered = filterBySearch(monthlyData).filter(function (r) { return !r.is_casual && r.effective_days > 0 })
        if (monthlyLoading) return <Loader />

        var withAvg = filtered.map(function (r) {
          return { ...r, avgDaily: r.days_present > 0 ? Math.round((r.total_hours / r.days_present) * 10) / 10 : 0 }
        })
        withAvg.sort(function (a, b) { return a.avgDaily - b.avgDaily })

        var overallAvg = withAvg.length > 0
          ? Math.round(withAvg.reduce(function (s, r) { return s + r.avgDaily }, 0) / withAvg.length * 10) / 10 : 0
        var below8 = withAvg.filter(function (r) { return r.avgDaily < 8 }).length
        var above10 = withAvg.filter(function (r) { return r.avgDaily >= 10 }).length

        var chartData = withAvg.map(function (r) {
          return {
            name: r.name.length > 15 ? r.name.slice(0, 15) + '\u2026' : r.name,
            avgDaily: r.avgDaily,
            total: r.total_hours
          }
        })

        return (
          <>
            <div className="grid grid-cols-4 gap-4 mb-6">
              <StatCard label="Staff" value={withAvg.length} />
              <StatCard label="Avg Daily Hours" value={overallAvg + 'h'} color="text-blue-600" />
              <StatCard label="Below 8h Avg" value={below8} color="text-red-600" />
              <StatCard label="Above 10h Avg" value={above10} color="text-emerald-600" />
            </div>

            <div className="bg-white border border-gray-200 rounded-xl p-5 mb-6">
              <h3 className="text-sm font-bold text-gray-700 mb-4">Average daily hours by employee (lowest first)</h3>
              <ResponsiveContainer width="100%" height={Math.max(withAvg.length * 32, 200)}>
                <BarChart data={chartData} layout="vertical" margin={{ left: 110, right: 30, top: 5, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" domain={[0, 14]} tick={{ fontSize: 11 }} tickFormatter={function (v) { return v + 'h' }} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={110} />
                  <Tooltip formatter={function (v, name) { return [v + 'h', name === 'avgDaily' ? 'Avg Daily' : 'Total'] }} />
                  <Bar dataKey="avgDaily" name="Avg Daily">
                    {chartData.map(function (d, i) {
                      return <Cell key={i} fill={d.avgDaily >= 8 ? COLORS.emerald : d.avgDaily >= 6 ? COLORS.amber : COLORS.red} />
                    })}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            <DataTable
              headers={['Employee', 'Dept', 'Avg Daily', 'Total Hours', 'Days Present', 'Status']}
              rows={withAvg.map(function (r) {
                var hrsClass = r.avgDaily >= 8 ? 'text-emerald-600 font-semibold' : r.avgDaily >= 6 ? 'text-amber-600 font-semibold' : 'text-red-600 font-semibold'
                var flag = r.avgDaily < 6 ? 'Low hours' : r.avgDaily < 8 ? 'Below target' : r.avgDaily >= 10 ? 'Extended shifts' : 'On track'
                var flagColor = r.avgDaily < 6 ? 'text-red-600 bg-red-50' : r.avgDaily < 8 ? 'text-amber-600 bg-amber-50' : r.avgDaily >= 10 ? 'text-blue-600 bg-blue-50' : 'text-emerald-600 bg-emerald-50'
                return [
                  { text: r.name, sub: r.emp_code },
                  r.department_name || '—',
                  { text: r.avgDaily + 'h', className: hrsClass },
                  r.total_hours + 'h',
                  r.days_present,
                  { text: flag, className: 'text-[10px] font-bold px-2 py-0.5 rounded-full ' + flagColor }
                ]
              })}
            />
          </>
        )
      })()}

      {/* DAR VIEW */}
      {view === 'dar' && (function () {
        var filtered = filterBySearch(darData)
        if (darLoading) return <Loader />

        filtered.sort(function (a, b) { return a.compliance_pct - b.compliance_pct })

        var totalPresent = filtered.reduce(function (s, r) { return s + (r.days_present || 0) }, 0)
        var totalSubmitted = filtered.reduce(function (s, r) { return s + (r.days_submitted || 0) }, 0)
        var overallPct = totalPresent > 0 ? Math.round((totalSubmitted / totalPresent) * 100) : 0
        var fullCompliance = filtered.filter(function (r) { return r.compliance_pct >= 90 }).length
        var lowCompliance = filtered.filter(function (r) { return r.compliance_pct < 50 }).length

        var chartData = filtered.map(function (r) {
          return {
            name: r.name.length > 15 ? r.name.slice(0, 15) + '\u2026' : r.name,
            pct: r.compliance_pct,
            submitted: r.days_submitted,
            expected: r.days_present
          }
        })

        return (
          <>
            <div className="grid grid-cols-5 gap-4 mb-6">
              <StatCard label="DAR Required" value={filtered.length} />
              <StatCard label="Overall Compliance" value={overallPct + '%'} color={overallPct >= 90 ? 'text-emerald-600' : overallPct >= 75 ? 'text-amber-600' : 'text-red-600'} />
              <StatCard label="Total Submitted" value={totalSubmitted} color="text-emerald-600" />
              <StatCard label="90%+ Compliance" value={fullCompliance} color="text-blue-600" />
              <StatCard label="Below 50%" value={lowCompliance} color="text-red-600" />
            </div>

            <div className="bg-white border border-gray-200 rounded-xl p-5 mb-6">
              <h3 className="text-sm font-bold text-gray-700 mb-4">DAR submission rate by employee (lowest first)</h3>
              <ResponsiveContainer width="100%" height={Math.max(filtered.length * 32, 200)}>
                <BarChart data={chartData} layout="vertical" margin={{ left: 110, right: 30, top: 5, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11 }} tickFormatter={function (v) { return v + '%' }} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={110} />
                  <Tooltip formatter={function (v, name) { return [name === 'pct' ? v + '%' : v, name === 'pct' ? 'Compliance' : name] }} />
                  <Bar dataKey="pct" name="Compliance %">
                    {chartData.map(function (d, i) {
                      return <Cell key={i} fill={d.pct >= 90 ? COLORS.emerald : d.pct >= 50 ? COLORS.amber : COLORS.red} />
                    })}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            <DataTable
              headers={['Employee', 'Dept', 'Compliance', 'Submitted', 'Days Present', 'Missing']}
              rows={filtered.map(function (r) {
                var pctClass = r.compliance_pct >= 90 ? 'text-emerald-600 font-semibold' : r.compliance_pct >= 50 ? 'text-amber-600 font-semibold' : 'text-red-600 font-semibold'
                var missing = (r.days_present || 0) - (r.days_submitted || 0)
                return [
                  { text: r.name, sub: r.emp_code },
                  r.department_name || '—',
                  { text: r.compliance_pct + '%', className: pctClass },
                  r.days_submitted || 0,
                  r.days_present || 0,
                  missing > 0 ? { text: String(missing), className: 'text-red-600 font-semibold' } : '0'
                ]
              })}
            />
          </>
        )
      })()}
    </div>
  )
}

function StatCard({ label, value, color }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl px-4 py-3">
      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-0.5">{label}</p>
      <p className={'text-2xl font-bold ' + (color || 'text-gray-900')}>{value}</p>
    </div>
  )
}

function Loader() {
  return (
    <div className="text-center py-16">
      <div className="w-6 h-6 border-2 border-slate-700 border-t-transparent rounded-full animate-spin mx-auto" />
    </div>
  )
}

function DataTable({ headers, rows }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-50 border-b border-gray-200">
            {headers.map(function (h, i) {
              return <th key={i} className="text-left px-4 py-2.5 text-[10px] font-bold text-gray-500 uppercase tracking-wider">{h}</th>
            })}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><td colSpan={headers.length} className="text-center py-8 text-sm text-gray-400">No data</td></tr>
          ) : rows.map(function (row, ri) {
            return (
              <tr key={ri} className="border-b border-gray-100 hover:bg-gray-50">
                {row.map(function (cell, ci) {
                  if (typeof cell === 'object' && cell !== null && cell.text !== undefined) {
                    return (
                      <td key={ci} className="px-4 py-2.5">
                        <span className={cell.className || ''}>{cell.text}</span>
                        {cell.sub && <span className="block text-[10px] text-gray-400">{cell.sub}</span>}
                      </td>
                    )
                  }
                  return <td key={ci} className="px-4 py-2.5 text-gray-700">{cell}</td>
                })}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
