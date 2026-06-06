import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/useAuth'
import { exportAnalysisDocx } from '../../lib/exportAnalysisDocx'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Cell, Legend, PieChart, Pie
} from 'recharts'

var MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
var TABLE_PREVIEW = 999

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

/* ── compute previous period from current date range ── */
function computePrevRange(fromDate, toDate) {
  var cf = new Date(fromDate + 'T00:00:00')
  var ct = new Date(toDate + 'T00:00:00')
  var dur = ct - cf
  var pt = new Date(cf.getTime() - 86400000)
  var pf = new Date(pt.getTime() - dur)
  return { from: pf.toISOString().slice(0, 10), to: pt.toISOString().slice(0, 10) }
}

/* ── delta helper for stat cards ── */
function calcDelta(current, prev) {
  if (prev == null || prev === 0 || current == null) return null
  return Math.round(((current - prev) / Math.abs(prev)) * 100)
}

export default function AdminAnalysis() {
  var { employee } = useAuth()
  var now = new Date()
  var firstOfMonth = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-01'
  var todayStr = now.toISOString().slice(0, 10)
  var [fromDate, setFromDate] = useState(firstOfMonth)
  var [toDate, setToDate] = useState(todayStr)
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

  // Previous period data for delta comparison
  var [prevTimingData, setPrevTimingData] = useState([])
  var [prevMonthlyData, setPrevMonthlyData] = useState([])
  var [prevDarData, setPrevDarData] = useState([])

  // Derive year/month from fromDate for CSV filenames
  var fromParts = fromDate.split('-')
  var year = Number(fromParts[0])
  var month = Number(fromParts[1])

  var prev = computePrevRange(fromDate, toDate)
  var deptIdParam = deptFilter ? Number(deptFilter) : null

  // Compute deptName for DOCX exports
  var deptName = deptFilter
    ? (depts.find(function (d) { return d.id === Number(deptFilter) }) || {}).name || deptNames[Number(deptFilter)] || ''
    : ''
  var docxOpts = { fromDate: fromDate, toDate: toDate, deptName: deptName }

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
    var [cur, prv] = await Promise.all([
      supabase.rpc('avg_punch_times', { p_from_date: fromDate, p_to_date: toDate, p_department_id: deptIdParam }),
      supabase.rpc('avg_punch_times', { p_from_date: prev.from, p_to_date: prev.to, p_department_id: deptIdParam }),
    ])
    setTimingData(cur.data || [])
    setPrevTimingData(prv.data || [])
    setTimingLoading(false)
  }, [fromDate, toDate, prev.from, prev.to, deptIdParam])

  var loadMonthly = useCallback(async function () {
    setMonthlyLoading(true)
    var [cur, prv] = await Promise.all([
      supabase.rpc('monthly_summary_range', { p_from_date: fromDate, p_to_date: toDate, p_department_id: deptIdParam }),
      supabase.rpc('monthly_summary_range', { p_from_date: prev.from, p_to_date: prev.to, p_department_id: deptIdParam }),
    ])
    var filtered = cur.data || []
    var prevFiltered = prv.data || []
    if (employee.role !== 'admin' && !deptFilter) {
      filtered = filtered.filter(function (r) { return managerDeptIds.includes(r.department_id) })
      prevFiltered = prevFiltered.filter(function (r) { return managerDeptIds.includes(r.department_id) })
    }
    setMonthlyData(filtered)
    setPrevMonthlyData(prevFiltered)
    setMonthlyLoading(false)
  }, [fromDate, toDate, prev.from, prev.to, deptIdParam, managerDeptIds, employee.role, deptFilter])

  var loadDAR = useCallback(async function () {
    setDarLoading(true)
    var [cur, prv] = await Promise.all([
      supabase.rpc('dar_compliance', { p_from_date: fromDate, p_to_date: toDate, p_department_id: deptIdParam }),
      supabase.rpc('dar_compliance', { p_from_date: prev.from, p_to_date: prev.to, p_department_id: deptIdParam }),
    ])
    setDarData(cur.data || [])
    setPrevDarData(prv.data || [])
    setDarLoading(false)
  }, [fromDate, toDate, prev.from, prev.to, deptIdParam])

  useEffect(function () {
    if (view === 'timing') loadTiming()
    if (view === 'attendance' || view === 'hours') loadMonthly()
    if (view === 'dar') loadDAR()
    if (view === 'concerns') { loadTiming(); loadMonthly(); loadDAR() }
  }, [view, loadTiming, loadMonthly, loadDAR])

  function setMonthPreset(offset) {
    var d = new Date(now.getFullYear(), now.getMonth() + offset, 1)
    var y = d.getFullYear()
    var m = d.getMonth() + 1
    var ms = y + '-' + String(m).padStart(2, '0') + '-01'
    var lastDay = new Date(y, m, 0).getDate()
    var me = y + '-' + String(m).padStart(2, '0') + '-' + String(lastDay).padStart(2, '0')
    if (me > todayStr) me = todayStr
    setFromDate(ms)
    setToDate(me)
  }

  function filterBySearch(list) {
    if (!search) return list
    var q = search.toLowerCase()
    return list.filter(function (r) {
      return r.name.toLowerCase().includes(q) || (r.emp_code && r.emp_code.toLowerCase().includes(q))
    })
  }

  var TABS = [
    { key: 'concerns', label: 'Concerns', icon: '\u{26A0}' },
    { key: 'timing', label: 'Punch Timing', icon: '\u{1F551}' },
    { key: 'attendance', label: 'Attendance', icon: '\u{1F4CB}' },
    { key: 'hours', label: 'Hours', icon: '\u{23F1}' },
    { key: 'dar', label: 'DAR Compliance', icon: '\u{1F4DD}' },
  ]

  return (
    <div>
      {/* HEADER */}
      <div className="mb-5">
        <h2 className="text-lg font-bold text-gray-900 mb-3">Analysis</h2>
        <div className="flex items-center gap-3 flex-wrap">
          {employee.role === 'admin' && depts.length > 0 && (
            <select value={deptFilter} onChange={function (e) { setDeptFilter(e.target.value) }}
              className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-slate-700">
              <option value="">All Departments</option>
              {depts.map(function (d) { return <option key={d.id} value={d.id}>{d.name}</option> })}
            </select>
          )}
          {employee.role === 'manager' && managerDeptIds.length > 1 && (
            <select value={deptFilter} onChange={function (e) { setDeptFilter(e.target.value) }}
              className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-slate-700">
              <option value="">All My Departments</option>
              {managerDeptIds.map(function (id) { return <option key={id} value={id}>{deptNames[id] || 'Dept ' + id}</option> })}
            </select>
          )}
          <div className="flex items-center gap-2">
            <input type="date" value={fromDate} max={toDate}
              onChange={function (e) { setFromDate(e.target.value) }}
              className="px-2.5 py-1.5 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-slate-700" />
            <span className="text-xs text-gray-400">to</span>
            <input type="date" value={toDate} min={fromDate} max={todayStr}
              onChange={function (e) { setToDate(e.target.value) }}
              className="px-2.5 py-1.5 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-slate-700" />
          </div>
          <div className="flex items-center gap-1">
            {[0, -1, -2].map(function (offset) {
              var d = new Date(now.getFullYear(), now.getMonth() + offset, 1)
              var label = MONTHS[d.getMonth()] + ' ' + d.getFullYear()
              var ms = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-01'
              var active = fromDate === ms
              return (
                <button key={offset} onClick={function () { setMonthPreset(offset) }}
                  className={'px-2.5 py-1 text-[10px] font-bold rounded-md transition-colors ' +
                    (active ? 'bg-slate-800 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200')}>
                  {label}
                </button>
              )
            })}
          </div>
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

      {/* CONCERNS VIEW — first tab */}
      {view === 'concerns' && <ConcernsView timingData={timingData} monthlyData={monthlyData} darData={darData}
        prevTimingData={prevTimingData} prevMonthlyData={prevMonthlyData} prevDarData={prevDarData}
        loading={timingLoading || monthlyLoading || darLoading} fromDate={fromDate} toDate={toDate} docxOpts={docxOpts} />}

      {/* TIMING VIEW */}
      {view === 'timing' && <TimingView data={filterBySearch(timingData)} prevData={prevTimingData} loading={timingLoading} month={month} year={year} fromDate={fromDate} toDate={toDate} docxOpts={docxOpts} />}

      {/* ATTENDANCE VIEW */}
      {view === 'attendance' && <AttendanceView data={filterBySearch(monthlyData)} prevData={prevMonthlyData} loading={monthlyLoading} month={month} year={year} fromDate={fromDate} toDate={toDate} docxOpts={docxOpts} />}

      {/* HOURS VIEW */}
      {view === 'hours' && <HoursView data={filterBySearch(monthlyData)} prevData={prevMonthlyData} loading={monthlyLoading} month={month} year={year} fromDate={fromDate} toDate={toDate} docxOpts={docxOpts} />}

      {/* DAR VIEW */}
      {view === 'dar' && <DARView data={filterBySearch(darData)} prevData={prevDarData} loading={darLoading} month={month} year={year} fromDate={fromDate} toDate={toDate} docxOpts={docxOpts} />}
    </div>
  )
}

/* ========================== TIMING VIEW ========================== */
function TimingView({ data, prevData, loading, month, year, fromDate, toDate, docxOpts }) {
  var [sortCol, setSortCol] = useState(null)
  var [sortDir, setSortDir] = useState('asc')
  if (loading) return <Loader />

  var filtered = data
  var chartData = filtered.map(function (r) {
    var inH = r.avg_in_secs ? Math.round(r.avg_in_secs / 360) / 10 : 0
    var outH = r.avg_out_secs ? Math.round(r.avg_out_secs / 360) / 10 : 0
    return {
      name: r.name.length > 14 ? r.name.slice(0, 14) + '\u2026' : r.name,
      fullName: r.name, rangeStart: inH,
      rangeLen: Math.max(outH - inH, 0.2), inH: inH, outH: outH, hours: r.avg_hours || 0
    }
  })
  chartData.sort(function (a, b) { return a.inH - b.inH })

  var avgIn = filtered.length > 0 ? Math.round(filtered.reduce(function (s, r) { return s + (r.avg_in_secs || 0) }, 0) / filtered.length) : 0
  var avgOut = filtered.length > 0 ? Math.round(filtered.reduce(function (s, r) { return s + (r.avg_out_secs || 0) }, 0) / filtered.length) : 0
  var avgHrs = filtered.length > 0 ? Math.round(filtered.reduce(function (s, r) { return s + (r.avg_hours || 0) }, 0) / filtered.length * 10) / 10 : 0

  // Previous period stats
  var prevAvgHrs = (prevData || []).length > 0 ? Math.round((prevData || []).reduce(function (s, r) { return s + (r.avg_hours || 0) }, 0) / prevData.length * 10) / 10 : null

  // Compute expected working days in range
  var from = new Date(fromDate + 'T00:00:00')
  var to = new Date(toDate + 'T00:00:00')
  var maxDay = Math.round((to - from) / 86400000) + 1

  var TIMING_SORT_KEYS = ['name', 'department_name', 'days_worked', 'avg_in_secs', 'avg_out_secs', 'avg_hours', 'min_hours', 'max_hours', '_flag']
  var sortedFiltered = sortCol !== null ? filtered.slice().sort(function (a, b) {
    var key = TIMING_SORT_KEYS[sortCol]
    var va = a[key], vb = b[key]
    if (typeof va === 'string') { va = (va || '').toLowerCase(); vb = (vb || '').toLowerCase() }
    var cmp = va < vb ? -1 : va > vb ? 1 : 0
    return sortDir === 'desc' ? -cmp : cmp
  }) : filtered

  var tableRows = sortedFiltered.map(function (r) {
    var hrsClass = r.avg_hours >= 8 ? 'text-emerald-600 font-semibold' : r.avg_hours >= 6 ? 'text-amber-600 font-semibold' : 'text-red-600 font-semibold'
    var flag = ''
    var flagColor = ''
    if (r.avg_hours > 0 && r.avg_hours < 8) { flag = 'Low hours'; flagColor = 'text-red-600 bg-red-50' }
    else if (r.days_worked <= Math.round(maxDay * 0.4) && maxDay >= 7) { flag = 'Low attendance'; flagColor = 'text-amber-600 bg-amber-50' }
    else if (r.avg_hours >= 10) { flag = 'Extended shifts'; flagColor = 'text-blue-600 bg-blue-50' }
    r._flag = flag
    return [
      { text: r.name, sub: r.emp_code },
      r.department_name || '\u2014',
      r.days_worked,
      fmtSecs(r.avg_in_secs),
      fmtSecs(r.avg_out_secs),
      { text: r.avg_hours + 'h', className: hrsClass },
      r.min_hours + 'h',
      r.max_hours + 'h',
      flag ? { text: flag, className: 'text-[10px] font-bold px-1.5 py-0.5 rounded-full whitespace-nowrap ' + flagColor } : '\u2014'
    ]
  })

  return (
    <>
      <div className="flex items-center justify-between mb-2">
        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">{fromDate} \u2192 {toDate} ({maxDay} days)</p>
        <ExportGroup onCSV={function () {
          downloadCSV('timing_' + MONTHS[month - 1] + year + '.csv',
            ['Employee', 'Code', 'Dept', 'Days', 'Avg In', 'Avg Out', 'Avg Hrs', 'Min Hrs', 'Max Hrs'],
            filtered.map(function (r) { return [r.name, r.emp_code, r.department_name, r.days_worked, fmtSecs(r.avg_in_secs), fmtSecs(r.avg_out_secs), r.avg_hours, r.min_hours, r.max_hours] }))
        }} onDocx={function () { exportAnalysisDocx('timing', filtered, docxOpts) }} />
      </div>
      <div className="grid grid-cols-4 gap-4 mb-5">
        <StatCard label="Employees" value={filtered.length} prev={prevData ? prevData.length : null} />
        <StatCard label="Avg Punch In" value={fmtSecs(avgIn)} color="text-emerald-600" />
        <StatCard label="Avg Punch Out" value={fmtSecs(avgOut)} color="text-red-500" />
        <StatCard label="Avg Hours/Day" value={avgHrs + 'h'} color="text-blue-600" delta={calcDelta(avgHrs, prevAvgHrs)} />
      </div>

      <DataTable
        headers={['Employee', 'Dept', 'Days', 'Avg In', 'Avg Out', 'Avg Hrs', 'Min', 'Max', 'Flag']}
        rows={tableRows}
        sortCol={sortCol} sortDir={sortDir}
        onSort={function (i) { if (sortCol === i) { setSortDir(sortDir === 'asc' ? 'desc' : 'asc') } else { setSortCol(i); setSortDir('asc') } }}
      />

      <div className="bg-white border border-gray-200 rounded-xl p-5 mt-5">
        <h3 className="text-sm font-bold text-gray-700 mb-4">Shift window per employee (avg punch-in to punch-out)</h3>
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

      {/* DEPT AGGREGATION — Timing */}
      <DeptAggregation data={filtered} metric="hours" label="Avg hours by department"
        getValue={function (list) {
          var total = list.reduce(function (s, r) { return s + (r.avg_hours || 0) }, 0)
          return list.length > 0 ? Math.round(total / list.length * 10) / 10 : 0
        }}
        colorFn={hrsToColor} suffix="h" domain={[0, 14]} />
    </>
  )
}

/* ========================== ATTENDANCE VIEW ========================== */
function AttendanceView({ data, prevData, loading, month, year, fromDate, toDate, docxOpts }) {
  var [sortCol, setSortCol] = useState(null)
  var [sortDir, setSortDir] = useState('asc')
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
  var overallPct = totalEffective > 0 ? Math.round(((totalPresent + totalHalf * 0.5) / totalEffective) * 100) : 0

  // Previous period
  var prevFiltered = (prevData || []).filter(function (r) { return !r.is_casual })
  var prevTotalPresent = prevFiltered.reduce(function (s, r) { return s + (r.days_present || 0) }, 0)
  var prevTotalHalf = prevFiltered.reduce(function (s, r) { return s + (r.days_half || 0) }, 0)
  var prevTotalEff = prevFiltered.reduce(function (s, r) { return s + (r.effective_days || 0) }, 0)
  var prevOverallPct = prevTotalEff > 0 ? Math.round(((prevTotalPresent + prevTotalHalf * 0.5) / prevTotalEff) * 100) : null

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
    if (!deptMap[dn]) deptMap[dn] = { present: 0, half: 0, effective: 0, count: 0 }
    deptMap[dn].present += (r.days_present || 0)
    deptMap[dn].half += (r.days_half || 0)
    deptMap[dn].effective += (r.effective_days || 0)
    deptMap[dn].count++
  })
  var deptAggData = Object.keys(deptMap).map(function (dn) {
    var d = deptMap[dn]
    var pct = d.effective > 0 ? Math.round(((d.present + d.half * 0.5) / d.effective) * 100) : 0
    return { name: dn, pct: pct, count: d.count, fill: pctToColor(pct) }
  }).sort(function (a, b) { return a.pct - b.pct })

  // Employee chart: capped
  var attWithPct = filtered.map(function (r) {
    var pct = r.effective_days > 0 ? Math.round((r.days_present / r.effective_days) * 100) : 0
    return { name: r.name.length > 15 ? r.name.slice(0, 15) + '\u2026' : r.name, pct: pct, fill: pctToColor(pct) }
  })
  var chartSlice = chartMode === 'bottom' ? attWithPct.slice(0, CHART_LIMIT) : attWithPct.slice(-CHART_LIMIT).reverse()

  var ATT_SORT_KEYS = ['name', 'department_name', '_pct', 'days_present', 'days_half', 'days_absent', 'days_incomplete', 'total_hours']
  var withPct = filtered.map(function (r) {
    return { ...r, _pct: r.attendance_pct != null ? r.attendance_pct : (r.effective_days > 0 ? Math.round(((r.days_present + r.days_half * 0.5) / r.effective_days) * 100) : 0) }
  })
  var sortedAtt = sortCol !== null ? withPct.slice().sort(function (a, b) {
    var key = ATT_SORT_KEYS[sortCol]
    var va = a[key], vb = b[key]
    if (typeof va === 'string') { va = (va || '').toLowerCase(); vb = (vb || '').toLowerCase() }
    var cmp = va < vb ? -1 : va > vb ? 1 : 0
    return sortDir === 'desc' ? -cmp : cmp
  }) : withPct

  var tableRows = sortedAtt.map(function (r) {
    var pctClass = r._pct >= 90 ? 'text-emerald-600 font-semibold' : r._pct >= 75 ? 'text-amber-600 font-semibold' : 'text-red-600 font-semibold'
    return [
      { text: r.name, sub: r.emp_code },
      r.department_name || '\u2014',
      { text: r._pct + '%', className: pctClass },
      r.days_present || 0,
      r.days_half || 0,
      r.days_absent || 0,
      r.days_incomplete || 0,
      r.total_hours + 'h'
    ]
  })

  return (
    <>
      <div className="flex items-center justify-end mb-2">
        <ExportGroup onCSV={function () {
          downloadCSV('attendance_' + MONTHS[month - 1] + year + '.csv',
            ['Employee', 'Code', 'Dept', 'Att%', 'Present', 'Half', 'Absent', 'Incomplete', 'Hours'],
            filtered.map(function (r) {
              var pct = r.effective_days > 0 ? Math.round((r.days_present / r.effective_days) * 100) : 0
              return [r.name, r.emp_code, r.department_name, pct, r.days_present, r.days_half, r.days_absent, r.days_incomplete, r.total_hours]
            }))
        }} onDocx={function () { exportAnalysisDocx('attendance', filtered, docxOpts) }} />
      </div>
      <div className="grid grid-cols-5 gap-4 mb-5">
        <StatCard label="Staff" value={filtered.length} prev={prevFiltered.length || null} />
        <StatCard label="Overall Attendance" value={overallPct + '%'} color={overallPct >= 90 ? 'text-emerald-600' : overallPct >= 75 ? 'text-amber-600' : 'text-red-600'}
          delta={calcDelta(overallPct, prevOverallPct)} />
        <StatCard label="Present Days" value={totalPresent} color="text-emerald-600" delta={calcDelta(totalPresent, prevTotalPresent || null)} />
        <StatCard label="Absent Days" value={totalAbsent} color="text-red-600" />
        <StatCard label="Half Days" value={totalHalf} color="text-orange-600" />
      </div>

      <div className="grid grid-cols-3 gap-5 mb-5">
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
        rows={tableRows}
        sortCol={sortCol} sortDir={sortDir}
        onSort={function (i) { if (sortCol === i) { setSortDir(sortDir === 'asc' ? 'desc' : 'asc') } else { setSortCol(i); setSortDir('asc') } }}
      />
    </>
  )
}

/* ========================== HOURS VIEW ========================== */
function HoursView({ data, prevData, loading, month, year, fromDate, toDate, docxOpts }) {
  var [sortCol, setSortCol] = useState(null)
  var [sortDir, setSortDir] = useState('asc')
  if (loading) return <Loader />

  var filtered = data.filter(function (r) { return !r.is_casual && r.effective_days > 0 })
  var withAvg = filtered.map(function (r) {
    var workDays = (r.days_present || 0) + (r.days_half || 0)
    return { ...r, avgDaily: workDays > 0 ? Math.round((r.total_hours / workDays) * 10) / 10 : 0 }
  })
  withAvg.sort(function (a, b) { return a.avgDaily - b.avgDaily })

  var overallAvg = withAvg.length > 0
    ? Math.round(withAvg.reduce(function (s, r) { return s + r.avgDaily }, 0) / withAvg.length * 10) / 10 : 0
  var below8 = withAvg.filter(function (r) { return r.avgDaily < 8 }).length
  var above10 = withAvg.filter(function (r) { return r.avgDaily >= 10 }).length

  // Previous period
  var prevFiltered = (prevData || []).filter(function (r) { return !r.is_casual && r.effective_days > 0 })
  var prevAvg = prevFiltered.length > 0
    ? Math.round(prevFiltered.reduce(function (s, r) {
        var wd = (r.days_present || 0) + (r.days_half || 0)
        return s + (wd > 0 ? r.total_hours / wd : 0)
      }, 0) / prevFiltered.length * 10) / 10 : null

  var hrsChartData = withAvg.map(function (r) {
    return { name: r.name.length > 15 ? r.name.slice(0, 15) + '\u2026' : r.name, avgDaily: r.avgDaily, fill: hrsToColor(r.avgDaily) }
  })

  var HRS_SORT_KEYS = ['name', 'department_name', 'avgDaily', 'total_hours', 'days_present', 'avgDaily']
  var sortedHrs = sortCol !== null ? withAvg.slice().sort(function (a, b) {
    var key = HRS_SORT_KEYS[sortCol]
    var va = a[key], vb = b[key]
    if (typeof va === 'string') { va = (va || '').toLowerCase(); vb = (vb || '').toLowerCase() }
    var cmp = va < vb ? -1 : va > vb ? 1 : 0
    return sortDir === 'desc' ? -cmp : cmp
  }) : withAvg

  var tableRows = sortedHrs.map(function (r) {
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
      <div className="flex items-center justify-end mb-2">
        <ExportGroup onCSV={function () {
          downloadCSV('hours_' + MONTHS[month - 1] + year + '.csv',
            ['Employee', 'Code', 'Dept', 'Avg Daily', 'Total Hours', 'Days Present'],
            withAvg.map(function (r) { return [r.name, r.emp_code, r.department_name, r.avgDaily, r.total_hours, r.days_present] }))
        }} onDocx={function () { exportAnalysisDocx('hours', filtered, docxOpts) }} />
      </div>
      <div className="grid grid-cols-4 gap-4 mb-5">
        <StatCard label="Staff" value={withAvg.length} />
        <StatCard label="Avg Daily Hours" value={overallAvg + 'h'} color="text-blue-600" delta={calcDelta(overallAvg, prevAvg)} />
        <StatCard label="Below 8h Avg" value={below8} color="text-red-600" />
        <StatCard label="Above 10h Avg" value={above10} color="text-emerald-600" />
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-5 mb-5">
        <h3 className="text-sm font-bold text-gray-700 mb-4">Average daily hours by employee (lowest first)</h3>
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
        rows={tableRows}
        sortCol={sortCol} sortDir={sortDir}
        onSort={function (i) { if (sortCol === i) { setSortDir(sortDir === 'asc' ? 'desc' : 'asc') } else { setSortCol(i); setSortDir('asc') } }}
      />

      <DeptAggregation data={filtered} metric="hours" label="Avg daily hours by department"
        getValue={function (list) {
          var t = 0, d = 0
          list.forEach(function (r) { var w = (r.days_present || 0) + (r.days_half || 0); t += r.total_hours; d += w })
          return d > 0 ? Math.round(t / d * 10) / 10 : 0
        }}
        colorFn={hrsToColor} suffix="h" domain={[0, 14]} />
    </>
  )
}

/* ========================== DAR VIEW ========================== */
function DARView({ data, prevData, loading, month, year, fromDate, toDate, docxOpts }) {
  var [sortCol, setSortCol] = useState(null)
  var [sortDir, setSortDir] = useState('asc')
  if (loading) return <Loader />

  var bufferDate = new Date(Date.now() - 2 * 86400000).toISOString().slice(0, 10)
  var darLagDays = toDate > bufferDate ? Math.min(2, Math.round((new Date(toDate + 'T00:00:00') - new Date(bufferDate + 'T00:00:00')) / 86400000)) : 0

  var filtered = data.map(function (r) {
    var adjPresent = Math.max(0, (r.days_present || 0) - darLagDays)
    var adjPct = adjPresent > 0 ? Math.round((r.days_submitted || 0) / adjPresent * 100) : (r.days_present > 0 ? r.compliance_pct : 100)
    return { ...r, days_present: adjPresent, compliance_pct: Math.min(adjPct, 100) }
  })
  filtered.sort(function (a, b) { return a.compliance_pct - b.compliance_pct })

  var totalPresent = filtered.reduce(function (s, r) { return s + (r.days_present || 0) }, 0)
  var totalSubmitted = filtered.reduce(function (s, r) { return s + (r.days_submitted || 0) }, 0)
  var overallPct = totalPresent > 0 ? Math.round((totalSubmitted / totalPresent) * 100) : 0
  var fullCompliance = filtered.filter(function (r) { return r.compliance_pct >= 90 }).length
  var lowCompliance = filtered.filter(function (r) { return r.compliance_pct < 50 }).length

  // Previous period
  var prevPresent = (prevData || []).reduce(function (s, r) { return s + (r.days_present || 0) }, 0)
  var prevSubmitted = (prevData || []).reduce(function (s, r) { return s + (r.days_submitted || 0) }, 0)
  var prevPct = prevPresent > 0 ? Math.round((prevSubmitted / prevPresent) * 100) : null

  var darChartData = filtered.map(function (r) {
    return { name: r.name.length > 15 ? r.name.slice(0, 15) + '\u2026' : r.name, pct: r.compliance_pct, fill: pctToColor(r.compliance_pct) }
  })

  var DAR_SORT_KEYS = ['name', 'department_name', 'compliance_pct', 'days_submitted', 'days_present', '_missing']
  var withMissing = filtered.map(function (r) {
    return { ...r, _missing: (r.days_present || 0) - (r.days_submitted || 0) }
  })
  var sortedDar = sortCol !== null ? withMissing.slice().sort(function (a, b) {
    var key = DAR_SORT_KEYS[sortCol]
    var va = a[key], vb = b[key]
    if (typeof va === 'string') { va = (va || '').toLowerCase(); vb = (vb || '').toLowerCase() }
    var cmp = va < vb ? -1 : va > vb ? 1 : 0
    return sortDir === 'desc' ? -cmp : cmp
  }) : withMissing

  var tableRows = sortedDar.map(function (r) {
    var pctClass = r.compliance_pct >= 90 ? 'text-emerald-600 font-semibold' : r.compliance_pct >= 50 ? 'text-amber-600 font-semibold' : 'text-red-600 font-semibold'
    return [
      { text: r.name, sub: r.emp_code },
      r.department_name || '\u2014',
      { text: r.compliance_pct + '%', className: pctClass },
      r.days_submitted || 0,
      r.days_present || 0,
      r._missing > 0 ? { text: String(r._missing), className: 'text-red-600 font-semibold' } : '0'
    ]
  })

  return (
    <>
      <div className="flex items-center justify-end mb-2">
        <ExportGroup onCSV={function () {
          downloadCSV('dar_compliance_' + MONTHS[month - 1] + year + '.csv',
            ['Employee', 'Code', 'Dept', 'Compliance%', 'Submitted', 'Days Present', 'Missing'],
            filtered.map(function (r) { return [r.name, r.emp_code, r.department_name, r.compliance_pct, r.days_submitted, r.days_present, (r.days_present || 0) - (r.days_submitted || 0)] }))
        }} onDocx={function () { exportAnalysisDocx('dar', filtered, docxOpts) }} />
      </div>
      <div className="grid grid-cols-5 gap-4 mb-5">
        <StatCard label="DAR Required" value={filtered.length} />
        <StatCard label="Overall Compliance" value={overallPct + '%'} color={overallPct >= 90 ? 'text-emerald-600' : overallPct >= 75 ? 'text-amber-600' : 'text-red-600'}
          delta={calcDelta(overallPct, prevPct)} />
        <StatCard label="Total Submitted" value={totalSubmitted} color="text-emerald-600" />
        <StatCard label="90%+ Compliance" value={fullCompliance} color="text-blue-600" />
        <StatCard label="Below 50%" value={lowCompliance} color="text-red-600" />
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-5 mb-5">
        <h3 className="text-sm font-bold text-gray-700 mb-4">DAR submission rate by employee (lowest first)</h3>
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
        rows={tableRows}
        sortCol={sortCol} sortDir={sortDir}
        onSort={function (i) { if (sortCol === i) { setSortDir(sortDir === 'asc' ? 'desc' : 'asc') } else { setSortCol(i); setSortDir('asc') } }}
      />

      <DeptAggregation data={filtered} metric="dar" label="DAR compliance by department"
        getValue={function (list) {
          var sub = list.reduce(function (s, r) { return s + (r.days_submitted || 0) }, 0)
          var prs = list.reduce(function (s, r) { return s + (r.days_present || 0) }, 0)
          return prs > 0 ? Math.round(sub / prs * 100) : 0
        }}
        colorFn={pctToColor} suffix="%" domain={[0, 100]} />
    </>
  )
}

/* ========================== CONCERNS VIEW ========================== */
var DEFAULT_THRESHOLDS = {
  lowHrs: 8,
  criticalHrs: 6,
  lowAtt: 75,
  criticalAtt: 50,
  incompleteMin: 3,
  lowDar: 70,
  criticalDar: 30,
}

function ConcernsView({ timingData, monthlyData, darData, prevTimingData, prevMonthlyData, prevDarData, loading, fromDate, toDate, docxOpts }) {
  var [thresholds, setThresholds] = useState(DEFAULT_THRESHOLDS)
  var [showSettings, setShowSettings] = useState(false)
  var [drillDown, setDrillDown] = useState(null)
  if (loading) return <Loader />

  var from = new Date(fromDate + 'T00:00:00')
  var to = new Date(toDate + 'T00:00:00')
  var rangeDays = Math.round((to - from) / 86400000) + 1
  var th = thresholds

  // Build per-employee concern scores
  var empMap = {}
  function getEmp(code, name, dept) {
    if (!empMap[code]) empMap[code] = { emp_code: code, name: name || code, dept: dept || '\u2014', concerns: [], score: 0, raw: {} }
    return empMap[code]
  }

  ;(timingData || []).forEach(function (r) {
    var e = getEmp(r.emp_code, r.name, r.department_name)
    e.raw.timing = r
    if (r.avg_hours > 0 && r.avg_hours < th.criticalHrs) {
      e.concerns.push({ type: 'timing', label: 'Very low avg hours', detail: r.avg_hours + 'h/day', severity: 25 })
      e.score += 25
    } else if (r.avg_hours > 0 && r.avg_hours < th.lowHrs) {
      e.concerns.push({ type: 'timing', label: 'Below target hours', detail: r.avg_hours + 'h/day', severity: 10 })
      e.score += 10
    }
  })

  ;(monthlyData || []).filter(function (r) { return !r.is_casual }).forEach(function (r) {
    var e = getEmp(r.emp_code, r.name, r.department_name)
    e.raw.monthly = r
    var pct = r.attendance_pct != null ? r.attendance_pct : (r.effective_days > 0 ? Math.round(((r.days_present + (r.days_half || 0) * 0.5) / r.effective_days) * 100) : 0)
    if (pct < th.criticalAtt) {
      e.concerns.push({ type: 'attendance', label: 'Critical attendance', detail: pct + '% (' + (r.days_absent || 0) + ' absent)', severity: 35 })
      e.score += 35
    } else if (pct < th.lowAtt) {
      e.concerns.push({ type: 'attendance', label: 'Low attendance', detail: pct + '% (' + (r.days_absent || 0) + ' absent)', severity: 20 })
      e.score += 20
    }
    if ((r.days_incomplete || 0) >= th.incompleteMin) {
      e.concerns.push({ type: 'attendance', label: 'Frequent incomplete days', detail: r.days_incomplete + ' incomplete', severity: 15 })
      e.score += 15
    }
    var workDays = (r.days_present || 0) + (r.days_half || 0)
    var avgDaily = workDays > 0 ? Math.round((r.total_hours / workDays) * 10) / 10 : 0
    if (workDays > 0 && avgDaily < th.criticalHrs) {
      e.concerns.push({ type: 'hours', label: 'Very low daily hours', detail: avgDaily + 'h avg (' + r.total_hours + 'h total)', severity: 25 })
      e.score += 25
    } else if (workDays > 0 && avgDaily < th.lowHrs) {
      e.concerns.push({ type: 'hours', label: 'Below ' + th.lowHrs + 'h daily target', detail: avgDaily + 'h avg', severity: 10 })
      e.score += 10
    }
  })

  // DAR buffer: last 2 days won't have DARs yet (nightly consolidation lag)
  var todayDate = new Date().toISOString().slice(0, 10)
  var bufferDate = new Date(Date.now() - 2 * 86400000).toISOString().slice(0, 10)
  var darLagDays = toDate > bufferDate ? Math.min(2, Math.round((new Date(toDate + 'T00:00:00') - new Date(bufferDate + 'T00:00:00')) / 86400000)) : 0

  ;(darData || []).forEach(function (r) {
    var e = getEmp(r.emp_code, r.name, r.department_name)
    var adjPresent = Math.max(0, (r.days_present || 0) - darLagDays)
    var adjPct = adjPresent > 0 ? Math.round((r.days_submitted || 0) / adjPresent * 100) : 100
    e.raw.dar = { ...r, adj_compliance_pct: adjPct, adj_days_present: adjPresent }
    if (adjPct < th.criticalDar) {
      e.concerns.push({ type: 'dar', label: 'Critical DAR compliance', detail: adjPct + '% (' + (r.days_submitted || 0) + '/' + adjPresent + ')', severity: 25 })
      e.score += 25
    } else if (adjPct < th.lowDar) {
      e.concerns.push({ type: 'dar', label: 'Low DAR compliance', detail: adjPct + '% (' + (r.days_submitted || 0) + '/' + adjPresent + ')', severity: 12 })
      e.score += 12
    }
  })

  Object.values(empMap).forEach(function (e) { e.score = Math.round(e.score) })
  var ranked = Object.values(empMap).filter(function (e) { return e.score > 0 })
  ranked.sort(function (a, b) { return b.score - a.score })
  var scored = ranked.slice(0, 10)

  // Previous period count for delta
  var prevCount = 0
  var prevEmpMap = {}
  ;(prevTimingData || []).forEach(function (r) { prevEmpMap[r.emp_code] = true })
  ;(prevMonthlyData || []).filter(function (r) { return !r.is_casual }).forEach(function (r) {
    var pct = r.attendance_pct != null ? r.attendance_pct : (r.effective_days > 0 ? Math.round(((r.days_present + (r.days_half || 0) * 0.5) / r.effective_days) * 100) : 0)
    if (pct < th.lowAtt) prevEmpMap[r.emp_code] = true
  })
  ;(prevDarData || []).forEach(function (r) { if (r.compliance_pct < th.lowDar) prevEmpMap[r.emp_code] = true })
  prevCount = Object.keys(prevEmpMap).length

  var CONCERN_COLORS = {
    timing: { bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-200', icon: '\u{1F551}' },
    attendance: { bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200', icon: '\u{1F4CB}' },
    hours: { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200', icon: '\u{23F1}' },
    dar: { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200', icon: '\u{1F4DD}' },
  }

  function updateThreshold(key, val) {
    setThresholds(function (prev) { var n = { ...prev }; n[key] = Number(val); return n })
  }

  return (
    <>
      <div className="flex items-center justify-between mb-3">
        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">{fromDate} \u2192 {toDate} ({rangeDays} days) \u2014 Top {Math.min(10, scored.length)} employees needing attention</p>
        <div className="flex items-center gap-2">
          <button onClick={function () { setShowSettings(!showSettings) }}
            className={'px-2.5 py-1.5 text-[10px] font-bold rounded-lg transition-colors ' + (showSettings ? 'bg-slate-800 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200')}>
            {'\u2699'} Thresholds
          </button>
          <ExportGroup onCSV={function () {
            downloadCSV('concerns_' + fromDate + '.csv',
              ['Rank', 'Name', 'Code', 'Dept', 'Score', 'Concerns'],
              scored.map(function (c, i) { return [i + 1, c.name, c.emp_code, c.dept, c.score, c.concerns.map(function (x) { return x.label }).join('; ')] }))
          }} onDocx={function () { exportAnalysisDocx('concerns', scored, docxOpts) }} />
        </div>
      </div>

      {/* ADJUSTABLE THRESHOLDS */}
      {showSettings && (
        <div className="bg-white border border-gray-200 rounded-xl p-4 mb-4">
          <div className="grid grid-cols-4 gap-4 text-xs">
            <ThresholdInput label={'Low hours (<' + th.lowHrs + 'h)'} value={th.lowHrs} />
            <ThresholdInput label={'Critical hours (<' + th.criticalHrs + 'h)'} value={th.criticalHrs} min={2} max={8} onChange={function (v) { updateThreshold('criticalHrs', v) }} />
            <ThresholdInput label={'Low att% (<' + th.lowAtt + '%)'} value={th.lowAtt} min={50} max={95} onChange={function (v) { updateThreshold('lowAtt', v) }} />
            <ThresholdInput label={'Critical att% (<' + th.criticalAtt + '%)'} value={th.criticalAtt} min={20} max={70} onChange={function (v) { updateThreshold('criticalAtt', v) }} />
            <ThresholdInput label="Incomplete days min" value={th.incompleteMin} min={1} max={10} onChange={function (v) { updateThreshold('incompleteMin', v) }} />
            <ThresholdInput label={'Low DAR (<' + th.lowDar + '%)'} value={th.lowDar} min={30} max={90} onChange={function (v) { updateThreshold('lowDar', v) }} />
            <ThresholdInput label={'Critical DAR (<' + th.criticalDar + '%)'} value={th.criticalDar} min={10} max={50} onChange={function (v) { updateThreshold('criticalDar', v) }} />
          </div>
          <button onClick={function () { setThresholds(DEFAULT_THRESHOLDS) }}
            className="mt-3 px-3 py-1 text-[10px] font-bold text-gray-500 bg-gray-50 rounded-lg hover:bg-gray-100">Reset defaults</button>
        </div>
      )}

      {scored.length === 0 ? (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-6 py-10 text-center">
          <p className="text-emerald-700 font-semibold">{'\u2705'} No major concerns found for this period</p>
        </div>
      ) : (
        <div className="space-y-3">
          {scored.map(function (emp, idx) {
            var barWidth = Math.min(Math.round((emp.score / (ranked[0].score || 1)) * 100), 100)
            var barColor = emp.score >= 50 ? 'bg-red-500' : emp.score >= 25 ? 'bg-amber-500' : 'bg-blue-500'
            return (
              <div key={emp.emp_code} className="bg-white border border-gray-200 rounded-xl p-4 cursor-pointer hover:border-gray-300 transition-colors"
                onClick={function () { setDrillDown(emp) }}>
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-3">
                    <span className="flex items-center justify-center w-7 h-7 rounded-full bg-gray-100 text-xs font-bold text-gray-500">{'#' + (idx + 1)}</span>
                    <div>
                      <p className="text-sm font-bold text-gray-900">{emp.name}</p>
                      <p className="text-[10px] text-gray-400">{emp.emp_code} {'\u2022'} {emp.dept}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className={'text-lg font-bold ' + (emp.score >= 50 ? 'text-red-600' : emp.score >= 25 ? 'text-amber-600' : 'text-blue-600')}>{emp.score}</p>
                    <p className="text-[9px] text-gray-400 uppercase">concern score</p>
                  </div>
                </div>
                <div className="w-full h-1.5 bg-gray-100 rounded-full mb-3">
                  <div className={'h-full rounded-full transition-all ' + barColor} style={{ width: barWidth + '%' }} />
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {emp.concerns.sort(function (a, b) { return b.severity - a.severity }).map(function (c, ci) {
                    var colors = CONCERN_COLORS[c.type] || CONCERN_COLORS.attendance
                    return (
                      <div key={ci} className={'flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[10px] font-semibold ' + colors.bg + ' ' + colors.text + ' ' + colors.border}>
                        <span>{colors.icon}</span>
                        <span>{c.label}</span>
                        <span className="opacity-60">{c.detail}</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* DRILL-DOWN MODAL */}
      {drillDown && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={function () { setDrillDown(null) }}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[80vh] overflow-y-auto p-6" onClick={function (e) { e.stopPropagation() }}>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-base font-bold text-gray-900">{drillDown.name}</h3>
                <p className="text-xs text-gray-400">{drillDown.emp_code} {'\u2022'} {drillDown.dept}</p>
              </div>
              <button onClick={function () { setDrillDown(null) }} className="text-gray-400 hover:text-gray-600 text-xl font-bold">{'\u00D7'}</button>
            </div>
            <div className="mb-4">
              <p className="text-xs font-bold text-gray-500 uppercase mb-1">Concern Score</p>
              <p className={'text-3xl font-bold ' + (drillDown.score >= 50 ? 'text-red-600' : drillDown.score >= 25 ? 'text-amber-600' : 'text-blue-600')}>{drillDown.score}</p>
            </div>

            {/* Timing details */}
            {drillDown.raw.timing && (
              <div className="mb-4 bg-purple-50 rounded-lg p-3">
                <p className="text-xs font-bold text-purple-700 mb-2">{'\u{1F551}'} Punch Timing</p>
                <div className="grid grid-cols-2 gap-2 text-xs text-purple-900">
                  <span>Avg In: <b>{fmtSecs(drillDown.raw.timing.avg_in_secs)}</b></span>
                  <span>Avg Out: <b>{fmtSecs(drillDown.raw.timing.avg_out_secs)}</b></span>
                  <span>Avg Hours: <b>{drillDown.raw.timing.avg_hours}h</b></span>
                  <span>Days Worked: <b>{drillDown.raw.timing.days_worked}</b></span>
                  <span>Min Hours: <b>{drillDown.raw.timing.min_hours}h</b></span>
                  <span>Max Hours: <b>{drillDown.raw.timing.max_hours}h</b></span>
                </div>
              </div>
            )}

            {/* Attendance details */}
            {drillDown.raw.monthly && (
              <div className="mb-4 bg-red-50 rounded-lg p-3">
                <p className="text-xs font-bold text-red-700 mb-2">{'\u{1F4CB}'} Attendance</p>
                <div className="grid grid-cols-2 gap-2 text-xs text-red-900">
                  <span>Present: <b>{drillDown.raw.monthly.days_present}</b></span>
                  <span>Absent: <b>{drillDown.raw.monthly.days_absent}</b></span>
                  <span>Half Days: <b>{drillDown.raw.monthly.days_half || 0}</b></span>
                  <span>Incomplete: <b>{drillDown.raw.monthly.days_incomplete || 0}</b></span>
                  <span>Total Hours: <b>{drillDown.raw.monthly.total_hours}h</b></span>
                  <span>Effective Days: <b>{drillDown.raw.monthly.effective_days}</b></span>
                </div>
              </div>
            )}

            {/* DAR details */}
            {drillDown.raw.dar && (
              <div className="mb-4 bg-blue-50 rounded-lg p-3">
                <p className="text-xs font-bold text-blue-700 mb-2">{'\u{1F4DD}'} DAR Compliance</p>
                <div className="grid grid-cols-2 gap-2 text-xs text-blue-900">
                  <span>Compliance: <b>{drillDown.raw.dar.compliance_pct}%</b></span>
                  <span>Submitted: <b>{drillDown.raw.dar.days_submitted}</b></span>
                  <span>Days Present: <b>{drillDown.raw.dar.days_present}</b></span>
                  <span>Missing: <b>{Math.max(0, (drillDown.raw.dar.days_present || 0) - (drillDown.raw.dar.days_submitted || 0))}</b></span>
                </div>
              </div>
            )}

            {/* Concern breakdown */}
            <div>
              <p className="text-xs font-bold text-gray-500 uppercase mb-2">Score Breakdown</p>
              <div className="space-y-1.5">
                {drillDown.concerns.sort(function (a, b) { return b.severity - a.severity }).map(function (c, i) {
                  var colors = CONCERN_COLORS[c.type] || CONCERN_COLORS.attendance
                  return (
                    <div key={i} className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <span>{colors.icon}</span>
                        <span className={colors.text + ' font-semibold'}>{c.label}</span>
                        <span className="text-gray-400">{c.detail}</span>
                      </div>
                      <span className="font-bold text-gray-700">+{Math.round(c.severity)}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="mt-5 bg-gray-50 border border-gray-200 rounded-xl p-4">
        <h3 className="text-xs font-bold text-gray-600 mb-2">Scoring criteria</h3>
        <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-[10px] text-gray-500">
          <span>{'\u{1F4CB}'} Attendance below {th.criticalAtt}%: 35 pts</span>
          <span>{'\u{23F1}'} Avg hours below {th.criticalHrs}h: 25 pts</span>
          <span>{'\u{1F4CB}'} Attendance below {th.lowAtt}%: 20 pts</span>
          <span>{'\u{23F1}'} Avg hours below {th.lowHrs}h: 10 pts</span>
          <span>{'\u{1F4DD}'} DAR compliance below {th.criticalDar}%: 25 pts</span>
          <span>{'\u{1F4CB}'} {th.incompleteMin}+ incomplete days: 15 pts</span>
          <span>{'\u{1F4DD}'} DAR compliance below {th.lowDar}%: 12 pts</span>
        </div>
      </div>
    </>
  )
}

/* ========================== DEPT AGGREGATION (reusable) ========================== */
function DeptAggregation({ data, label, getValue, colorFn, suffix, domain }) {
  var deptMap = {}
  data.forEach(function (r) {
    var dn = r.department_name || 'Unknown'
    if (!deptMap[dn]) deptMap[dn] = []
    deptMap[dn].push(r)
  })
  var deptData = Object.keys(deptMap).map(function (dn) {
    var val = getValue(deptMap[dn])
    return { name: dn, value: val, count: deptMap[dn].length, fill: colorFn(val) }
  }).sort(function (a, b) { return a.value - b.value })

  if (deptData.length <= 1) return null

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 mt-5">
      <h3 className="text-sm font-bold text-gray-700 mb-3">{label}</h3>
      <ResponsiveContainer width="100%" height={Math.max(deptData.length * 40, 120)}>
        <BarChart data={deptData} layout="vertical" margin={{ left: 110, right: 40, top: 5, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" horizontal={false} />
          <XAxis type="number" domain={domain} tick={{ fontSize: 11 }} tickFormatter={function (v) { return v + suffix }} />
          <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={110} />
          <Tooltip formatter={function (v) { return v + suffix }} />
          <Bar dataKey="value" barSize={18} radius={[0, 4, 4, 0]}>
            {deptData.map(function (d, i) { return <Cell key={i} fill={d.fill} /> })}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

/* ========================== SHARED COMPONENTS ========================== */

function StatCard({ label, value, color, delta, prev }) {
  var showDelta = delta != null && delta !== 0
  var showPrev = !showDelta && prev != null
  return (
    <div className="bg-white border border-gray-200 rounded-xl px-4 py-3">
      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-0.5">{label}</p>
      <div className="flex items-end gap-2">
        <p className={'text-2xl font-bold ' + (color || 'text-gray-900')}>{value}</p>
        {showDelta && (
          <span className={'text-[10px] font-bold mb-1 ' + (delta > 0 ? 'text-emerald-600' : 'text-red-600')}>
            {delta > 0 ? '\u2191' : '\u2193'}{Math.abs(delta)}%
          </span>
        )}
        {showPrev && prev !== value && (
          <span className="text-[10px] text-gray-400 mb-1">was {prev}</span>
        )}
      </div>
    </div>
  )
}

function ThresholdInput({ label, value, min, max, onChange }) {
  return (
    <div>
      <label className="text-[10px] font-semibold text-gray-500 block mb-1">{label}</label>
      <input type="range" min={min} max={max} value={value}
        onChange={function (e) { onChange(e.target.value) }}
        className="w-full h-1.5 bg-gray-200 rounded-full appearance-none cursor-pointer accent-slate-700" />
      <span className="text-[10px] font-bold text-slate-700">{value}</span>
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

function ExportGroup({ onCSV, onDocx }) {
  return (
    <div className="flex items-center gap-1">
      <button onClick={onCSV}
        className="flex items-center gap-1 px-2.5 py-1.5 text-[10px] font-bold text-gray-600 bg-gray-50 border border-gray-200 rounded-lg hover:bg-gray-100 transition-colors">
        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
        </svg>
        CSV
      </button>
      <button onClick={onDocx}
        className="flex items-center gap-1 px-2.5 py-1.5 text-[10px] font-bold text-blue-700 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 transition-colors">
        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        DOCX
      </button>
    </div>
  )
}

function DataTable({ headers, rows, sortCol, sortDir, onSort }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
      <table className="w-full text-xs">
        <thead>
          <tr className="bg-gray-50 border-b border-gray-200">
            {headers.map(function (h, i) {
              var active = sortCol === i
              return (
                <th key={i} onClick={onSort ? function () { onSort(i) } : undefined}
                  className={'text-left px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider select-none ' +
                    (onSort ? 'cursor-pointer hover:text-gray-800 ' : '') +
                    (active ? 'text-slate-800' : 'text-gray-500')}>
                  {h}
                  {active && <span className="ml-1 text-[9px]">{sortDir === 'asc' ? '\u25B2' : '\u25BC'}</span>}
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><td colSpan={headers.length} className="text-center py-6 text-xs text-gray-400">No data</td></tr>
          ) : rows.map(function (row, ri) {
            return (
              <tr key={ri} className="border-b border-gray-100 hover:bg-gray-50">
                {row.map(function (cell, ci) {
                  if (typeof cell === 'object' && cell !== null && cell.text !== undefined) {
                    return (
                      <td key={ci} className="px-3 py-1.5">
                        <span className={cell.className || ''}>{cell.text}</span>
                        {cell.sub && <span className="block text-[10px] text-gray-400">{cell.sub}</span>}
                      </td>
                    )
                  }
                  return <td key={ci} className="px-3 py-1.5 text-gray-700">{cell}</td>
                })}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
