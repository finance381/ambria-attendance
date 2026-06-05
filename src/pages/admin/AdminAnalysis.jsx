import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/useAuth'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Cell, Legend, PieChart, Pie
} from 'recharts'

var MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
var TABLE_PREVIEW = 10

function fmtSecs(secs) {
  if (!secs && secs !== 0) return '\u2014'
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

function pctToColor(pct) {
  if (pct >= 90) return COLORS.emerald
  if (pct >= 75) return COLORS.amber
  return COLORS.red
}

function hrsToColor(hrs) {
  if (hrs >= 8) return COLORS.emerald
  if (hrs >= 6) return COLORS.amber
  return COLORS.red
}

function downloadCSV(filename, headers, rows) {
  var csv = headers.join(',') + '\n'
  rows.forEach(function (row) {
    csv += row.map(function (cell) {
      var val = typeof cell === 'object' && cell !== null ? (cell.text || '') : String(cell)
      return '"' + val.replace(/"/g, '""') + '"'
    }).join(',') + '\n'
  })
  var blob = new Blob([csv], { type: 'text/csv' })
  var url = URL.createObjectURL(blob)
  var a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
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
    { key: 'timing', label: 'Punch Timing', icon: '\u{1F551}' },
    { key: 'attendance', label: 'Attendance', icon: '\u{1F4CB}' },
    { key: 'hours', label: 'Hours', icon: '\u{23F1}' },
    { key: 'dar', label: 'DAR Compliance', icon: '\u{1F4DD}' },
  ]

  return (
    <div>
      {/* HEADER */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-lg font-bold text-gray-900">Analysis</h2>
          <p className="text-xs text-gray-500">{MONTHS[month - 1]} {year}</p>
        </div>
        <div className="flex items-center gap-3">
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
          <button onClick={prevMonth} className="px-3 py-2 text-sm bg-gray-100 rounded-lg hover:bg-gray-200">{'\u2190'}</button>
          <span className="text-sm font-semibold text-gray-700 min-w-[90px] text-center">{MONTHS[month - 1]} {year}</span>
          <button onClick={nextMonth} disabled={isCurrentMonth} className="px-3 py-2 text-sm bg-gray-100 rounded-lg hover:bg-gray-200 disabled:opacity-30">{'\u2192'}</button>
        </div>
      </div>

      {/* TAB BAR + SEARCH */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex gap-1 bg-white border border-gray-200 rounded-xl p-1">
          {TABS.map(function (t) {
            return (
              <button key={t.key} onClick={function () { setView(t.key); setSearch('') }}
                className={'px-4 py-2 text-xs font-semibold rounded-lg transition-colors ' +
                  (view === t.key ? 'bg-slate-800 text-white' : 'text-gray-600 hover:bg-gray-100')}>
                {t.icon + ' ' + t.label}
              </button>
            )
          })}
        </div>
        <input type="text" value={search} onChange={function (e) { setSearch(e.target.value) }}
          placeholder="Search name or code\u2026"
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm w-56 focus:outline-none focus:ring-2 focus:ring-slate-700" />
      </div>

      {/* TIMING VIEW */}
      {view === 'timing' && <TimingView data={filterBySearch(timingData)} loading={timingLoading} month={month} year={year} />}

      {/* ATTENDANCE VIEW */}
      {view === 'attendance' && <AttendanceView data={filterBySearch(monthlyData)} loading={monthlyLoading} month={month} year={year} />}

      {/* HOURS VIEW */}
      {view === 'hours' && <HoursView data={filterBySearch(monthlyData)} loading={monthlyLoading} month={month} year={year} />}

      {/* DAR VIEW */}
      {view === 'dar' && <DARView data={filterBySearch(darData)} loading={darLoading} month={month} year={year} />}
    </div>
  )
}

/* ========================== TIMING VIEW ========================== */
function TimingView({ data, loading, month, year }) {
  var [showAll, setShowAll] = useState(false)
  if (loading) return <Loader />

  var filtered = data
  var chartData = filtered.map(function (r) {
    var inH = r.avg_in_secs ? Math.round(r.avg_in_secs / 360) / 10 : 0
    var outH = r.avg_out_secs ? Math.round(r.avg_out_secs / 360) / 10 : 0
    return {
      name: r.name.length > 14 ? r.name.slice(0, 14) + '\u2026' : r.name,
      fullName: r.name,
      rangeStart: inH,
      rangeLen: Math.max(outH - inH, 0.2),
      inH: inH,
      outH: outH,
      hours: r.avg_hours || 0
    }
  })
  chartData.sort(function (a, b) { return a.inH - b.inH })

  var avgIn = filtered.length > 0 ? Math.round(filtered.reduce(function (s, r) { return s + (r.avg_in_secs || 0) }, 0) / filtered.length) : 0
  var avgOut = filtered.length > 0 ? Math.round(filtered.reduce(function (s, r) { return s + (r.avg_out_secs || 0) }, 0) / filtered.length) : 0
  var avgHrs = filtered.length > 0 ? Math.round(filtered.reduce(function (s, r) { return s + (r.avg_hours || 0) }, 0) / filtered.length * 10) / 10 : 0

  var tableRows = filtered.map(function (r) {
    var hrsClass = r.avg_hours >= 8 ? 'text-emerald-600 font-semibold' : r.avg_hours >= 6 ? 'text-amber-600 font-semibold' : 'text-red-600 font-semibold'
    return [
      { text: r.name, sub: r.emp_code },
      r.department_name || '\u2014',
      r.days_worked,
      fmtSecs(r.avg_in_secs),
      fmtSecs(r.avg_out_secs),
      { text: r.avg_hours + 'h', className: hrsClass },
      r.min_hours + 'h',
      r.max_hours + 'h'
    ]
  })

  return (
    <>
      <div className="grid grid-cols-4 gap-4 mb-5">
        <StatCard label="Employees" value={filtered.length} />
        <StatCard label="Avg Punch In" value={fmtSecs(avgIn)} color="text-emerald-600" />
        <StatCard label="Avg Punch Out" value={fmtSecs(avgOut)} color="text-red-500" />
        <StatCard label="Avg Hours/Day" value={avgHrs + 'h'} color="text-blue-600" />
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-5 mb-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold text-gray-700">Shift window per employee (avg punch-in to punch-out)</h3>
          <ExportBtn onClick={function () {
            downloadCSV('timing_' + MONTHS[month - 1] + year + '.csv',
              ['Employee', 'Code', 'Dept', 'Days', 'Avg In', 'Avg Out', 'Avg Hrs', 'Min Hrs', 'Max Hrs'],
              filtered.map(function (r) { return [r.name, r.emp_code, r.department_name, r.days_worked, fmtSecs(r.avg_in_secs), fmtSecs(r.avg_out_secs), r.avg_hours, r.min_hours, r.max_hours] }))
          }} />
        </div>
        <ResponsiveContainer width="100%" height={Math.max(chartData.length * 30, 200)}>
          <BarChart data={chartData} layout="vertical" margin={{ left: 110, right: 30, top: 5, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" horizontal={false} />
            <XAxis type="number" domain={[6, 26]} tickFormatter={fmtHour} tick={{ fontSize: 11 }} ticks={[8, 10, 12, 14, 16, 18, 20, 22, 24]} />
            <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={110} />
            <Tooltip content={function (props) {
              if (!props.active || !props.payload || !props.payload[0]) return null
              var d = props.payload[0].payload
              return (
                <div className="bg-white border border-gray-200 rounded-lg shadow-lg px-3 py-2 text-xs">
                  <p className="font-bold text-gray-800 mb-1">{d.fullName}</p>
                  <p className="text-emerald-600">In: {fmtHour(d.inH)}</p>
                  <p className="text-red-500">Out: {fmtHour(d.outH)}</p>
                  <p className="text-blue-600">Avg: {d.hours}h</p>
                </div>
              )
            }} />
            <Bar dataKey="rangeStart" stackId="shift" fill="transparent" barSize={14} radius={0} />
            <Bar dataKey="rangeLen" stackId="shift" barSize={14} radius={[4, 4, 4, 4]}>
              {chartData.map(function (d, i) {
                return <Cell key={i} fill={d.hours >= 8 ? COLORS.emerald : d.hours >= 6 ? COLORS.amber : COLORS.red} />
              })}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <DataTable
        headers={['Employee', 'Dept', 'Days', 'Avg In', 'Avg Out', 'Avg Hrs', 'Min', 'Max']}
        rows={showAll ? tableRows : tableRows.slice(0, TABLE_PREVIEW)}
      />
      {tableRows.length > TABLE_PREVIEW && (
        <ShowAllToggle count={tableRows.length} expanded={showAll} onToggle={function () { setShowAll(!showAll) }} />
      )}
    </>
  )
}

/* ========================== ATTENDANCE VIEW ========================== */
function AttendanceView({ data, loading, month, year }) {
  var [showAll, setShowAll] = useState(false)
  var [chartMode, setChartMode] = useState('bottom')
  var CHART_LIMIT = 15
  if (loading) return <Loader />

  var filtered = data.filter(function (r) { return !r.is_casual })
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

  // Build dept aggregation for chart
  var deptMap = {}
  filtered.forEach(function (r) {
    var dn = r.department_name || 'Unknown'
    if (!deptMap[dn]) deptMap[dn] = { present: 0, effective: 0, count: 0 }
    deptMap[dn].present += (r.days_present || 0)
    deptMap[dn].effective += (r.effective_days || 0)
    deptMap[dn].count++
  })
  var deptAggData = Object.keys(deptMap).map(function (dn) {
    var pct = deptMap[dn].effective > 0 ? Math.round((deptMap[dn].present / deptMap[dn].effective) * 100) : 0
    return { name: dn, pct: pct, count: deptMap[dn].count, fill: pctToColor(pct) }
  }).sort(function (a, b) { return a.pct - b.pct })

  // Employee chart: capped
  var attWithPct = filtered.map(function (r) {
    var pct = r.effective_days > 0 ? Math.round((r.days_present / r.effective_days) * 100) : 0
    return { name: r.name.length > 15 ? r.name.slice(0, 15) + '\u2026' : r.name, pct: pct, fill: pctToColor(pct) }
  })
  var chartSlice = chartMode === 'bottom' ? attWithPct.slice(0, CHART_LIMIT) : attWithPct.slice(-CHART_LIMIT).reverse()

  var tableRows = filtered.map(function (r) {
    var pct = r.effective_days > 0 ? Math.round((r.days_present / r.effective_days) * 100) : 0
    var pctClass = pct >= 90 ? 'text-emerald-600 font-semibold' : pct >= 75 ? 'text-amber-600 font-semibold' : 'text-red-600 font-semibold'
    return [
      { text: r.name, sub: r.emp_code },
      r.department_name || '\u2014',
      { text: pct + '%', className: pctClass },
      r.days_present || 0,
      r.days_half || 0,
      r.days_absent || 0,
      r.days_incomplete || 0,
      r.total_hours + 'h'
    ]
  })

  return (
    <>
      <div className="grid grid-cols-5 gap-4 mb-5">
        <StatCard label="Staff" value={filtered.length} />
        <StatCard label="Overall Attendance" value={overallPct + '%'} color={overallPct >= 90 ? 'text-emerald-600' : overallPct >= 75 ? 'text-amber-600' : 'text-red-600'} />
        <StatCard label="Present Days" value={totalPresent} color="text-emerald-600" />
        <StatCard label="Absent Days" value={totalAbsent} color="text-red-600" />
        <StatCard label="Half Days" value={totalHalf} color="text-orange-600" />
      </div>

      <div className="grid grid-cols-3 gap-5 mb-5">
        {/* PIE */}
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <h3 className="text-sm font-bold text-gray-700 mb-3">Status breakdown</h3>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={75} innerRadius={42} paddingAngle={2}>
                {pieData.map(function (d, i) { return <Cell key={i} fill={d.color} /> })}
              </Pie>
              <Tooltip />
              <Legend iconType="circle" wrapperStyle={{ fontSize: 11 }} />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* EMPLOYEE BAR (capped) */}
        <div className="col-span-2 bg-white border border-gray-200 rounded-xl p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold text-gray-700">
              {chartMode === 'bottom' ? 'Bottom' : 'Top'} {Math.min(CHART_LIMIT, filtered.length)} by attendance %
            </h3>
            <div className="flex items-center gap-1">
              <button onClick={function () { setChartMode('bottom') }}
                className={'px-2.5 py-1 text-[10px] font-bold rounded-md ' + (chartMode === 'bottom' ? 'bg-slate-800 text-white' : 'bg-gray-100 text-gray-600')}>Bottom</button>
              <button onClick={function () { setChartMode('top') }}
                className={'px-2.5 py-1 text-[10px] font-bold rounded-md ' + (chartMode === 'top' ? 'bg-slate-800 text-white' : 'bg-gray-100 text-gray-600')}>Top</button>
              <ExportBtn onClick={function () {
                downloadCSV('attendance_' + MONTHS[month - 1] + year + '.csv',
                  ['Employee', 'Code', 'Dept', 'Att%', 'Present', 'Half', 'Absent', 'Incomplete', 'Hours'],
                  filtered.map(function (r) {
                    var pct = r.effective_days > 0 ? Math.round((r.days_present / r.effective_days) * 100) : 0
                    return [r.name, r.emp_code, r.department_name, pct, r.days_present, r.days_half, r.days_absent, r.days_incomplete, r.total_hours]
                  }))
              }} />
            </div>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={chartSlice}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 9 }} angle={-35} textAnchor="end" height={55} />
              <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} tickFormatter={function (v) { return v + '%' }} />
              <Tooltip formatter={function (v) { return v + '%' }} />
              <Bar dataKey="pct" name="Attendance %">
                {chartSlice.map(function (d, i) { return <Cell key={i} fill={d.fill} /> })}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* DEPT AGGREGATION */}
      {deptAggData.length > 1 && (
        <div className="bg-white border border-gray-200 rounded-xl p-5 mb-5">
          <h3 className="text-sm font-bold text-gray-700 mb-3">Attendance % by department</h3>
          <ResponsiveContainer width="100%" height={Math.max(deptAggData.length * 40, 120)}>
            <BarChart data={deptAggData} layout="vertical" margin={{ left: 110, right: 40, top: 5, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11 }} tickFormatter={function (v) { return v + '%' }} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={110} />
              <Tooltip formatter={function (v) { return v + '%' }} />
              <Bar dataKey="pct" name="Dept Attendance %" barSize={18} radius={[0, 4, 4, 0]}>
                {deptAggData.map(function (d, i) { return <Cell key={i} fill={d.fill} /> })}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      <DataTable
        headers={['Employee', 'Dept', 'Att %', 'Present', 'Half', 'Absent', 'Incomplete', 'Hours']}
        rows={showAll ? tableRows : tableRows.slice(0, TABLE_PREVIEW)}
      />
      {tableRows.length > TABLE_PREVIEW && (
        <ShowAllToggle count={tableRows.length} expanded={showAll} onToggle={function () { setShowAll(!showAll) }} />
      )}
    </>
  )
}

/* ========================== HOURS VIEW ========================== */
function HoursView({ data, loading, month, year }) {
  var [showAll, setShowAll] = useState(false)
  if (loading) return <Loader />

  var filtered = data.filter(function (r) { return !r.is_casual && r.effective_days > 0 })
  var withAvg = filtered.map(function (r) {
    return { ...r, avgDaily: r.days_present > 0 ? Math.round((r.total_hours / r.days_present) * 10) / 10 : 0 }
  })
  withAvg.sort(function (a, b) { return a.avgDaily - b.avgDaily })

  var overallAvg = withAvg.length > 0
    ? Math.round(withAvg.reduce(function (s, r) { return s + r.avgDaily }, 0) / withAvg.length * 10) / 10 : 0
  var below8 = withAvg.filter(function (r) { return r.avgDaily < 8 }).length
  var above10 = withAvg.filter(function (r) { return r.avgDaily >= 10 }).length

  var hrsChartData = withAvg.map(function (r) {
    return {
      name: r.name.length > 15 ? r.name.slice(0, 15) + '\u2026' : r.name,
      avgDaily: r.avgDaily,
      fill: hrsToColor(r.avgDaily)
    }
  })

  var tableRows = withAvg.map(function (r) {
    var hrsClass = r.avgDaily >= 8 ? 'text-emerald-600 font-semibold' : r.avgDaily >= 6 ? 'text-amber-600 font-semibold' : 'text-red-600 font-semibold'
    var flag = r.avgDaily < 6 ? 'Low hours' : r.avgDaily < 8 ? 'Below target' : r.avgDaily >= 10 ? 'Extended shifts' : 'On track'
    var flagColor = r.avgDaily < 6 ? 'text-red-600 bg-red-50' : r.avgDaily < 8 ? 'text-amber-600 bg-amber-50' : r.avgDaily >= 10 ? 'text-blue-600 bg-blue-50' : 'text-emerald-600 bg-emerald-50'
    return [
      { text: r.name, sub: r.emp_code },
      r.department_name || '\u2014',
      { text: r.avgDaily + 'h', className: hrsClass },
      r.total_hours + 'h',
      r.days_present,
      { text: flag, className: 'text-[10px] font-bold px-2 py-0.5 rounded-full ' + flagColor }
    ]
  })

  return (
    <>
      <div className="grid grid-cols-4 gap-4 mb-5">
        <StatCard label="Staff" value={withAvg.length} />
        <StatCard label="Avg Daily Hours" value={overallAvg + 'h'} color="text-blue-600" />
        <StatCard label="Below 8h Avg" value={below8} color="text-red-600" />
        <StatCard label="Above 10h Avg" value={above10} color="text-emerald-600" />
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-5 mb-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold text-gray-700">Average daily hours by employee (lowest first)</h3>
          <ExportBtn onClick={function () {
            downloadCSV('hours_' + MONTHS[month - 1] + year + '.csv',
              ['Employee', 'Code', 'Dept', 'Avg Daily', 'Total Hours', 'Days Present'],
              withAvg.map(function (r) { return [r.name, r.emp_code, r.department_name, r.avgDaily, r.total_hours, r.days_present] }))
          }} />
        </div>
        <ResponsiveContainer width="100%" height={Math.max(withAvg.length * 28, 200)}>
          <BarChart data={hrsChartData} layout="vertical" margin={{ left: 110, right: 30, top: 5, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" horizontal={false} />
            <XAxis type="number" domain={[0, 14]} tick={{ fontSize: 11 }} tickFormatter={function (v) { return v + 'h' }} />
            <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={110} />
            <Tooltip formatter={function (v) { return [v + 'h', 'Avg Daily'] }} />
            <Bar dataKey="avgDaily" name="Avg Daily" barSize={14} radius={[0, 4, 4, 0]}>
              {hrsChartData.map(function (d, i) { return <Cell key={i} fill={d.fill} /> })}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <DataTable
        headers={['Employee', 'Dept', 'Avg Daily', 'Total Hours', 'Days Present', 'Status']}
        rows={showAll ? tableRows : tableRows.slice(0, TABLE_PREVIEW)}
      />
      {tableRows.length > TABLE_PREVIEW && (
        <ShowAllToggle count={tableRows.length} expanded={showAll} onToggle={function () { setShowAll(!showAll) }} />
      )}
    </>
  )
}

/* ========================== DAR VIEW ========================== */
function DARView({ data, loading, month, year }) {
  var [showAll, setShowAll] = useState(false)
  if (loading) return <Loader />

  var filtered = data.slice()
  filtered.sort(function (a, b) { return a.compliance_pct - b.compliance_pct })

  var totalPresent = filtered.reduce(function (s, r) { return s + (r.days_present || 0) }, 0)
  var totalSubmitted = filtered.reduce(function (s, r) { return s + (r.days_submitted || 0) }, 0)
  var overallPct = totalPresent > 0 ? Math.round((totalSubmitted / totalPresent) * 100) : 0
  var fullCompliance = filtered.filter(function (r) { return r.compliance_pct >= 90 }).length
  var lowCompliance = filtered.filter(function (r) { return r.compliance_pct < 50 }).length

  var darChartData = filtered.map(function (r) {
    return {
      name: r.name.length > 15 ? r.name.slice(0, 15) + '\u2026' : r.name,
      pct: r.compliance_pct,
      fill: pctToColor(r.compliance_pct)
    }
  })

  var tableRows = filtered.map(function (r) {
    var pctClass = r.compliance_pct >= 90 ? 'text-emerald-600 font-semibold' : r.compliance_pct >= 50 ? 'text-amber-600 font-semibold' : 'text-red-600 font-semibold'
    var missing = (r.days_present || 0) - (r.days_submitted || 0)
    return [
      { text: r.name, sub: r.emp_code },
      r.department_name || '\u2014',
      { text: r.compliance_pct + '%', className: pctClass },
      r.days_submitted || 0,
      r.days_present || 0,
      missing > 0 ? { text: String(missing), className: 'text-red-600 font-semibold' } : '0'
    ]
  })

  return (
    <>
      <div className="grid grid-cols-5 gap-4 mb-5">
        <StatCard label="DAR Required" value={filtered.length} />
        <StatCard label="Overall Compliance" value={overallPct + '%'} color={overallPct >= 90 ? 'text-emerald-600' : overallPct >= 75 ? 'text-amber-600' : 'text-red-600'} />
        <StatCard label="Total Submitted" value={totalSubmitted} color="text-emerald-600" />
        <StatCard label="90%+ Compliance" value={fullCompliance} color="text-blue-600" />
        <StatCard label="Below 50%" value={lowCompliance} color="text-red-600" />
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-5 mb-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold text-gray-700">DAR submission rate by employee (lowest first)</h3>
          <ExportBtn onClick={function () {
            downloadCSV('dar_compliance_' + MONTHS[month - 1] + year + '.csv',
              ['Employee', 'Code', 'Dept', 'Compliance%', 'Submitted', 'Days Present', 'Missing'],
              filtered.map(function (r) { return [r.name, r.emp_code, r.department_name, r.compliance_pct, r.days_submitted, r.days_present, (r.days_present || 0) - (r.days_submitted || 0)] }))
          }} />
        </div>
        <ResponsiveContainer width="100%" height={Math.max(filtered.length * 28, 200)}>
          <BarChart data={darChartData} layout="vertical" margin={{ left: 110, right: 30, top: 5, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" horizontal={false} />
            <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11 }} tickFormatter={function (v) { return v + '%' }} />
            <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={110} />
            <Tooltip formatter={function (v) { return [v + '%', 'Compliance'] }} />
            <Bar dataKey="pct" name="Compliance %" barSize={14} radius={[0, 4, 4, 0]}>
              {darChartData.map(function (d, i) { return <Cell key={i} fill={d.fill} /> })}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <DataTable
        headers={['Employee', 'Dept', 'Compliance', 'Submitted', 'Days Present', 'Missing']}
        rows={showAll ? tableRows : tableRows.slice(0, TABLE_PREVIEW)}
      />
      {tableRows.length > TABLE_PREVIEW && (
        <ShowAllToggle count={tableRows.length} expanded={showAll} onToggle={function () { setShowAll(!showAll) }} />
      )}
    </>
  )
}

/* ========================== SHARED COMPONENTS ========================== */

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

function ExportBtn({ onClick }) {
  return (
    <button onClick={onClick}
      className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-bold text-gray-600 bg-gray-50 border border-gray-200 rounded-lg hover:bg-gray-100 transition-colors">
      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
      </svg>
      CSV
    </button>
  )
}

function ShowAllToggle({ count, expanded, onToggle }) {
  return (
    <button onClick={onToggle}
      className="w-full mt-2 py-2 text-xs font-semibold text-slate-600 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors">
      {expanded ? 'Show top ' + TABLE_PREVIEW + ' only' : 'Show all ' + count + ' employees \u2193'}
    </button>
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
