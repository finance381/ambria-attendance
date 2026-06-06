import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/useAuth'
import { exportAnalysisDocx } from '../../lib/exportAnalysisDocx'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Cell, Legend, PieChart, Pie
} from 'recharts'

var MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

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

var COLORS = { emerald: '#10b981', red: '#ef4444', amber: '#f59e0b', blue: '#3b82f6', purple: '#8b5cf6', orange: '#f97316', slate: '#475569', teal: '#14b8a6' }
function pctToColor(pct) { return pct >= 90 ? COLORS.emerald : pct >= 75 ? COLORS.amber : COLORS.red }
function hrsToColor(hrs) { return hrs >= 8 ? COLORS.emerald : hrs >= 6 ? COLORS.amber : COLORS.red }

function downloadCSV(filename, headers, rows) {
  var csv = headers.join(',') + '\n'
  rows.forEach(function (row) { csv += row.map(function (cell) { var val = typeof cell === 'object' && cell !== null ? (cell.text || '') : String(cell); return '"' + val.replace(/"/g, '""') + '"' }).join(',') + '\n' })
  var blob = new Blob([csv], { type: 'text/csv' }); var url = URL.createObjectURL(blob)
  var a = document.createElement('a'); a.href = url; a.download = filename; a.click(); URL.revokeObjectURL(url)
}
function computePrevRange(fromDate, toDate) {
  var cf = new Date(fromDate + 'T00:00:00'), ct = new Date(toDate + 'T00:00:00'), dur = ct - cf
  var pt = new Date(cf.getTime() - 86400000), pf = new Date(pt.getTime() - dur)
  return { from: pf.toISOString().slice(0, 10), to: pt.toISOString().slice(0, 10) }
}
function calcDelta(current, prev) { if (prev == null || prev === 0 || current == null) return null; return Math.round(((current - prev) / Math.abs(prev)) * 100) }

export default function AdminAnalysis() {
  var { employee } = useAuth()
  var now = new Date()
  var firstOfMonth = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-01'
  var todayStr = now.toISOString().slice(0, 10)
  var [fromDate, setFromDate] = useState(firstOfMonth)
  var [toDate, setToDate] = useState(todayStr)
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
  var [prevTimingData, setPrevTimingData] = useState([])
  var [prevMonthlyData, setPrevMonthlyData] = useState([])
  var [prevDarData, setPrevDarData] = useState([])

  var fromParts = fromDate.split('-')
  var year = Number(fromParts[0]), month = Number(fromParts[1])
  var prev = computePrevRange(fromDate, toDate)
  var deptIdParam = deptFilter ? Number(deptFilter) : null
  var deptName = deptFilter ? (depts.find(function (d) { return d.id === Number(deptFilter) }) || {}).name || deptNames[Number(deptFilter)] || '' : ''
  var docxOpts = { fromDate: fromDate, toDate: toDate, deptName: deptName }

  useEffect(function () {
    if (employee.role === 'manager') {
      supabase.from('manager_departments').select('department_id, departments(name)').eq('employee_id', employee.id).then(function (res) {
        var ids = (res.data || []).map(function (d) { return d.department_id }); if (ids.length === 0) ids = [employee.department_id]; setManagerDeptIds(ids)
        var names = {}; (res.data || []).forEach(function (d) { if (d.departments) names[d.department_id] = d.departments.name }); setDeptNames(names)
      })
    }
    if (employee.role === 'admin') { supabase.from('departments').select('id, name').order('name').then(function (res) { setDepts(res.data || []) }) }
  }, [employee.id, employee.role, employee.department_id])

  var loadTiming = useCallback(async function () {
    setTimingLoading(true)
    var [cur, prv] = await Promise.all([
      supabase.rpc('avg_punch_times', { p_from_date: fromDate, p_to_date: toDate, p_department_id: deptIdParam }),
      supabase.rpc('avg_punch_times', { p_from_date: prev.from, p_to_date: prev.to, p_department_id: deptIdParam }),
    ]); setTimingData(cur.data || []); setPrevTimingData(prv.data || []); setTimingLoading(false)
  }, [fromDate, toDate, prev.from, prev.to, deptIdParam])

  var loadMonthly = useCallback(async function () {
    setMonthlyLoading(true)
    var [cur, prv] = await Promise.all([
      supabase.rpc('monthly_summary_range', { p_from_date: fromDate, p_to_date: toDate, p_department_id: deptIdParam }),
      supabase.rpc('monthly_summary_range', { p_from_date: prev.from, p_to_date: prev.to, p_department_id: deptIdParam }),
    ])
    var filtered = cur.data || [], prevFiltered = prv.data || []
    if (employee.role !== 'admin' && !deptFilter) {
      filtered = filtered.filter(function (r) { return managerDeptIds.includes(r.department_id) })
      prevFiltered = prevFiltered.filter(function (r) { return managerDeptIds.includes(r.department_id) })
    }
    setMonthlyData(filtered); setPrevMonthlyData(prevFiltered); setMonthlyLoading(false)
  }, [fromDate, toDate, prev.from, prev.to, deptIdParam, managerDeptIds, employee.role, deptFilter])

  var loadDAR = useCallback(async function () {
    setDarLoading(true)
    var [cur, prv] = await Promise.all([
      supabase.rpc('dar_compliance', { p_from_date: fromDate, p_to_date: toDate, p_department_id: deptIdParam }),
      supabase.rpc('dar_compliance', { p_from_date: prev.from, p_to_date: prev.to, p_department_id: deptIdParam }),
    ]); setDarData(cur.data || []); setPrevDarData(prv.data || []); setDarLoading(false)
  }, [fromDate, toDate, prev.from, prev.to, deptIdParam])

  useEffect(function () {
    if (view === 'timing') loadTiming()
    if (view === 'attendance' || view === 'hours') loadMonthly()
    if (view === 'dar') loadDAR()
  }, [view, loadTiming, loadMonthly, loadDAR])

  function setMonthPreset(offset) {
    var d = new Date(now.getFullYear(), now.getMonth() + offset, 1); var y = d.getFullYear(), m = d.getMonth() + 1
    var ms = y + '-' + String(m).padStart(2, '0') + '-01'; var lastDay = new Date(y, m, 0).getDate()
    var me = y + '-' + String(m).padStart(2, '0') + '-' + String(lastDay).padStart(2, '0')
    if (me > todayStr) me = todayStr; setFromDate(ms); setToDate(me)
  }
  function filterBySearch(list) {
    if (!search) return list; var q = search.toLowerCase()
    return list.filter(function (r) { return r.name.toLowerCase().includes(q) || (r.emp_code && r.emp_code.toLowerCase().includes(q)) })
  }

  var TABS = [
    { key: 'timing', label: 'Punch Timing', icon: '\u{1F551}' },
    { key: 'attendance', label: 'Attendance', icon: '\u{1F4CB}' },
    { key: 'hours', label: 'Hours', icon: '\u{23F1}' },
    { key: 'dar', label: 'DAR Compliance', icon: '\u{1F4DD}' },
  ]

  return (
    <div>
      <div className="mb-5">
        <h2 className="text-lg font-bold text-gray-900 mb-3">Analysis</h2>
        <div className="flex items-center gap-3 flex-wrap">
          {employee.role === 'admin' && depts.length > 0 && (
            <select value={deptFilter} onChange={function (e) { setDeptFilter(e.target.value) }} className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-slate-700">
              <option value="">All Departments</option>
              {depts.map(function (d) { return <option key={d.id} value={d.id}>{d.name}</option> })}
            </select>
          )}
          {employee.role === 'manager' && managerDeptIds.length > 1 && (
            <select value={deptFilter} onChange={function (e) { setDeptFilter(e.target.value) }} className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-slate-700">
              <option value="">All My Departments</option>
              {managerDeptIds.map(function (id) { return <option key={id} value={id}>{deptNames[id] || 'Dept ' + id}</option> })}
            </select>
          )}
          <div className="flex items-center gap-2">
            <input type="date" value={fromDate} max={toDate} onChange={function (e) { setFromDate(e.target.value) }} className="px-2.5 py-1.5 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-slate-700" />
            <span className="text-xs text-gray-400">to</span>
            <input type="date" value={toDate} min={fromDate} max={todayStr} onChange={function (e) { setToDate(e.target.value) }} className="px-2.5 py-1.5 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-slate-700" />
          </div>
          <div className="flex items-center gap-1">
            {[0, -1, -2].map(function (offset) {
              var d = new Date(now.getFullYear(), now.getMonth() + offset, 1); var label = MONTHS[d.getMonth()] + ' ' + d.getFullYear()
              var ms = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-01'; var active = fromDate === ms
              return (<button key={offset} onClick={function () { setMonthPreset(offset) }} className={'px-2.5 py-1 text-[10px] font-bold rounded-md transition-colors ' + (active ? 'bg-slate-800 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200')}>{label}</button>)
            })}
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between mb-5">
        <div className="flex gap-1 bg-white border border-gray-200 rounded-xl p-1">
          {TABS.map(function (t) { return (<button key={t.key} onClick={function () { setView(t.key); setSearch('') }} className={'px-4 py-2 text-xs font-semibold rounded-lg transition-colors ' + (view === t.key ? 'bg-slate-800 text-white' : 'text-gray-600 hover:bg-gray-100')}>{t.icon + ' ' + t.label}</button>) })}
        </div>
        <input type="text" value={search} onChange={function (e) { setSearch(e.target.value) }} placeholder="Search name or code\u2026" className="px-3 py-2 border border-gray-300 rounded-lg text-sm w-56 focus:outline-none focus:ring-2 focus:ring-slate-700" />
      </div>

      {view === 'timing' && <TimingView data={filterBySearch(timingData)} prevData={prevTimingData} loading={timingLoading} month={month} year={year} fromDate={fromDate} toDate={toDate} docxOpts={docxOpts} />}
      {view === 'attendance' && <AttendanceView data={filterBySearch(monthlyData)} prevData={prevMonthlyData} loading={monthlyLoading} month={month} year={year} fromDate={fromDate} toDate={toDate} docxOpts={docxOpts} />}
      {view === 'hours' && <HoursView data={filterBySearch(monthlyData)} prevData={prevMonthlyData} loading={monthlyLoading} month={month} year={year} fromDate={fromDate} toDate={toDate} docxOpts={docxOpts} />}
      {view === 'dar' && <DARView data={filterBySearch(darData)} prevData={prevDarData} loading={darLoading} month={month} year={year} fromDate={fromDate} toDate={toDate} docxOpts={docxOpts} />}
    </div>
  )
}

/* ========================== TIMING VIEW ========================== */
function TimingView({ data, prevData, loading, month, year, fromDate, toDate, docxOpts }) {
  var [sortCol, setSortCol] = useState(null); var [sortDir, setSortDir] = useState('asc')
  if (loading) return <Loader />
  var filtered = data
  var from = new Date(fromDate + 'T00:00:00'), to = new Date(toDate + 'T00:00:00')
  var maxDay = Math.round((to - from) / 86400000) + 1
  var avgIn = filtered.length > 0 ? Math.round(filtered.reduce(function (s, r) { return s + (r.avg_in_secs || 0) }, 0) / filtered.length) : 0
  var avgOut = filtered.length > 0 ? Math.round(filtered.reduce(function (s, r) { return s + (r.avg_out_secs || 0) }, 0) / filtered.length) : 0
  var avgHrs = filtered.length > 0 ? Math.round(filtered.reduce(function (s, r) { return s + (r.avg_hours || 0) }, 0) / filtered.length * 10) / 10 : 0
  var prevAvgHrs = (prevData || []).length > 0 ? Math.round((prevData || []).reduce(function (s, r) { return s + (r.avg_hours || 0) }, 0) / prevData.length * 10) / 10 : null

  var concerns = filtered.filter(function (r) { var t = r.expected_hours || 9; return r.avg_hours > 0 && r.avg_hours < t * 0.6 }).sort(function (a, b) { return a.avg_hours - b.avg_hours }).slice(0, 3).map(function (r) { return { name: r.name, code: r.emp_code, detail: r.avg_hours + 'h avg (target ' + (r.expected_hours || 9) + 'h)', color: 'red' } })
  var warnings = filtered.filter(function (r) { var t = r.expected_hours || 9; return r.avg_hours >= t * 0.6 && r.avg_hours < t }).sort(function (a, b) { return a.avg_hours - b.avg_hours }).slice(0, 2).map(function (r) { return { name: r.name, code: r.emp_code, detail: r.avg_hours + 'h avg (target ' + (r.expected_hours || 9) + 'h)', color: 'amber' } })

  var KEYS = ['name', 'department_name', 'days_worked', 'avg_in_secs', 'avg_out_secs', 'avg_hours', 'min_hours', 'max_hours', '_flag']
  var sorted = sortCol !== null ? filtered.slice().sort(function (a, b) { var key = KEYS[sortCol]; var va = a[key], vb = b[key]; if (typeof va === 'string') { va = (va || '').toLowerCase(); vb = (vb || '').toLowerCase() }; return (sortDir === 'desc' ? -1 : 1) * (va < vb ? -1 : va > vb ? 1 : 0) }) : filtered
  var tableRows = sorted.map(function (r) {
    var hc = r.avg_hours >= 8 ? 'text-emerald-600 font-semibold' : r.avg_hours >= 6 ? 'text-amber-600 font-semibold' : 'text-red-600 font-semibold'
    var flag = '', fc = ''
    if (r.avg_hours > 0 && r.avg_hours < (r.expected_hours || 9)) { flag = 'Low hours'; fc = 'text-red-600 bg-red-50' }
    else if (r.days_worked <= Math.round(maxDay * 0.4) && maxDay >= 7) { flag = 'Low attendance'; fc = 'text-amber-600 bg-amber-50' }
    else if (r.avg_hours >= 10) { flag = 'Extended shifts'; fc = 'text-blue-600 bg-blue-50' }
    r._flag = flag
    return [{ text: r.name, sub: r.emp_code }, r.department_name || '\u2014', r.days_worked, fmtSecs(r.avg_in_secs), fmtSecs(r.avg_out_secs), { text: r.avg_hours + 'h', className: hc }, r.min_hours + 'h', r.max_hours + 'h', flag ? { text: flag, className: 'text-[10px] font-bold px-1.5 py-0.5 rounded-full whitespace-nowrap ' + fc } : '\u2014']
  })
  var chartData = filtered.map(function (r) { var inH = r.avg_in_secs ? Math.round(r.avg_in_secs / 360) / 10 : 0; var outH = r.avg_out_secs ? Math.round(r.avg_out_secs / 360) / 10 : 0; return { name: r.name.length > 14 ? r.name.slice(0, 14) + '\u2026' : r.name, fullName: r.name, rangeStart: inH, rangeLen: Math.max(outH - inH, 0.2), inH: inH, outH: outH, hours: r.avg_hours || 0 } }).sort(function (a, b) { return a.inH - b.inH })

  return (<>
    <ConcernBanner items={concerns.concat(warnings)} label="Low working hours" />
    <div className="flex items-center justify-between mb-2">
      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">{fromDate} {'\u2192'} {toDate} ({maxDay} days)</p>
      <ExportGroup onCSV={function () { downloadCSV('timing_' + MONTHS[month - 1] + year + '.csv', ['Employee', 'Code', 'Dept', 'Days', 'Avg In', 'Avg Out', 'Avg Hrs', 'Min Hrs', 'Max Hrs'], filtered.map(function (r) { return [r.name, r.emp_code, r.department_name, r.days_worked, fmtSecs(r.avg_in_secs), fmtSecs(r.avg_out_secs), r.avg_hours, r.min_hours, r.max_hours] })) }} onDocx={function () { exportAnalysisDocx('timing', filtered, docxOpts) }} />
    </div>
    <div className="grid grid-cols-4 gap-4 mb-5">
      <StatCard label="Employees" value={filtered.length} prev={prevData ? prevData.length : null} />
      <StatCard label="Avg Punch In" value={fmtSecs(avgIn)} color="text-emerald-600" />
      <StatCard label="Avg Punch Out" value={fmtSecs(avgOut)} color="text-red-500" />
      <StatCard label="Avg Hours/Day" value={avgHrs + 'h'} color="text-blue-600" delta={calcDelta(avgHrs, prevAvgHrs)} />
    </div>
    <DataTable headers={['Employee', 'Dept', 'Days', 'Avg In', 'Avg Out', 'Avg Hrs', 'Min', 'Max', 'Flag']} rows={tableRows} sortCol={sortCol} sortDir={sortDir} onSort={function (i) { if (sortCol === i) { setSortDir(sortDir === 'asc' ? 'desc' : 'asc') } else { setSortCol(i); setSortDir('asc') } }} />
    <div className="bg-white border border-gray-200 rounded-xl p-5 mt-5">
      <h3 className="text-sm font-bold text-gray-700 mb-4">Shift window per employee</h3>
      <ResponsiveContainer width="100%" height={Math.max(chartData.length * 30, 200)}>
        <BarChart data={chartData} layout="vertical" margin={{ left: 110, right: 30, top: 5, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" horizontal={false} />
          <XAxis type="number" domain={[6, 26]} tickFormatter={fmtHour} tick={{ fontSize: 11 }} ticks={[8, 10, 12, 14, 16, 18, 20, 22, 24]} />
          <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={110} />
          <Tooltip content={function (props) { if (!props.active || !props.payload || !props.payload[0]) return null; var d = props.payload[0].payload; return (<div className="bg-white border border-gray-200 rounded-lg shadow-lg px-3 py-2 text-xs"><p className="font-bold text-gray-800 mb-1">{d.fullName}</p><p className="text-emerald-600">In: {fmtHour(d.inH)}</p><p className="text-red-500">Out: {fmtHour(d.outH)}</p><p className="text-blue-600">Avg: {d.hours}h</p></div>) }} />
          <Bar dataKey="rangeStart" stackId="shift" fill="transparent" barSize={14} radius={0} />
          <Bar dataKey="rangeLen" stackId="shift" barSize={14} radius={[4, 4, 4, 4]}>{chartData.map(function (d, i) { return <Cell key={i} fill={d.hours >= 8 ? COLORS.emerald : d.hours >= 6 ? COLORS.amber : COLORS.red} /> })}</Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
    <DeptAggregation data={filtered} label="Avg hours by department" getValue={function (list) { var t = list.reduce(function (s, r) { return s + (r.avg_hours || 0) }, 0); return list.length > 0 ? Math.round(t / list.length * 10) / 10 : 0 }} colorFn={hrsToColor} suffix="h" domain={[0, 14]} />
  </>)
}

/* ========================== ATTENDANCE VIEW ========================== */
function AttendanceView({ data, prevData, loading, month, year, fromDate, toDate, docxOpts }) {
  var [sortCol, setSortCol] = useState(null); var [sortDir, setSortDir] = useState('asc'); var [chartMode, setChartMode] = useState('bottom'); var CHART_LIMIT = 15
  if (loading) return <Loader />
  var filtered = data.filter(function (r) { return !r.is_casual })
  filtered.sort(function (a, b) { var pA = a.effective_days > 0 ? a.days_present / a.effective_days : 0; var pB = b.effective_days > 0 ? b.days_present / b.effective_days : 0; return pA - pB })
  var totalPresent = filtered.reduce(function (s, r) { return s + (r.days_present || 0) }, 0)
  var totalHalf = filtered.reduce(function (s, r) { return s + (r.days_half || 0) }, 0)
  var totalAbsent = filtered.reduce(function (s, r) { return s + (r.days_absent || 0) }, 0)
  var totalInc = filtered.reduce(function (s, r) { return s + (r.days_incomplete || 0) }, 0)
  var totalEff = filtered.reduce(function (s, r) { return s + (r.effective_days || 0) }, 0)
  var overallPct = totalEff > 0 ? Math.round(((totalPresent + totalHalf * 0.5) / totalEff) * 100) : 0
  var prevF = (prevData || []).filter(function (r) { return !r.is_casual })
  var prevTP = prevF.reduce(function (s, r) { return s + (r.days_present || 0) }, 0)
  var prevTH = prevF.reduce(function (s, r) { return s + (r.days_half || 0) }, 0)
  var prevTE = prevF.reduce(function (s, r) { return s + (r.effective_days || 0) }, 0)
  var prevPct = prevTE > 0 ? Math.round(((prevTP + prevTH * 0.5) / prevTE) * 100) : null

  var attConcerns = filtered.filter(function (r) { var pct = r.attendance_pct != null ? r.attendance_pct : (r.effective_days > 0 ? Math.round(((r.days_present + (r.days_half || 0) * 0.5) / r.effective_days) * 100) : 100); return pct < 50 }).slice(0, 3).map(function (r) { var pct = r.attendance_pct != null ? r.attendance_pct : Math.round(((r.days_present + (r.days_half || 0) * 0.5) / r.effective_days) * 100); return { name: r.name, code: r.emp_code, detail: pct + '% (' + (r.days_absent || 0) + ' absent)', color: 'red' } })
  var incConcerns = filtered.filter(function (r) { return (r.days_incomplete || 0) >= 3 }).sort(function (a, b) { return (b.days_incomplete || 0) - (a.days_incomplete || 0) }).slice(0, 2).map(function (r) { return { name: r.name, code: r.emp_code, detail: r.days_incomplete + ' incomplete days', color: 'amber' } })

  var pieData = [{ name: 'Present', value: totalPresent, color: COLORS.emerald }, { name: 'Half Day', value: totalHalf, color: COLORS.orange }, { name: 'Absent', value: totalAbsent, color: COLORS.red }, { name: 'Incomplete', value: totalInc, color: COLORS.amber }].filter(function (d) { return d.value > 0 })
  var deptMap = {}; filtered.forEach(function (r) { var dn = r.department_name || 'Unknown'; if (!deptMap[dn]) deptMap[dn] = { present: 0, half: 0, effective: 0 }; deptMap[dn].present += (r.days_present || 0); deptMap[dn].half += (r.days_half || 0); deptMap[dn].effective += (r.effective_days || 0) })
  var deptAgg = Object.keys(deptMap).map(function (dn) { var d = deptMap[dn]; var pct = d.effective > 0 ? Math.round(((d.present + d.half * 0.5) / d.effective) * 100) : 0; return { name: dn, pct: pct, fill: pctToColor(pct) } }).sort(function (a, b) { return a.pct - b.pct })
  var attWithPct = filtered.map(function (r) { var pct = r.effective_days > 0 ? Math.round((r.days_present / r.effective_days) * 100) : 0; return { name: r.name.length > 15 ? r.name.slice(0, 15) + '\u2026' : r.name, pct: pct, fill: pctToColor(pct) } })
  var chartSlice = chartMode === 'bottom' ? attWithPct.slice(0, CHART_LIMIT) : attWithPct.slice(-CHART_LIMIT).reverse()

  var KEYS = ['name', 'department_name', '_pct', 'days_present', 'days_half', 'days_absent', 'days_incomplete', 'total_hours']
  var withPct = filtered.map(function (r) { return { ...r, _pct: r.attendance_pct != null ? r.attendance_pct : (r.effective_days > 0 ? Math.round(((r.days_present + r.days_half * 0.5) / r.effective_days) * 100) : 0) } })
  var sortedAtt = sortCol !== null ? withPct.slice().sort(function (a, b) { var key = KEYS[sortCol]; var va = a[key], vb = b[key]; if (typeof va === 'string') { va = (va || '').toLowerCase(); vb = (vb || '').toLowerCase() }; return (sortDir === 'desc' ? -1 : 1) * (va < vb ? -1 : va > vb ? 1 : 0) }) : withPct
  var tableRows = sortedAtt.map(function (r) { var pc = r._pct >= 90 ? 'text-emerald-600 font-semibold' : r._pct >= 75 ? 'text-amber-600 font-semibold' : 'text-red-600 font-semibold'; return [{ text: r.name, sub: r.emp_code }, r.department_name || '\u2014', { text: r._pct + '%', className: pc }, r.days_present || 0, r.days_half || 0, r.days_absent || 0, r.days_incomplete || 0, r.total_hours + 'h'] })

  return (<>
    <ConcernBanner items={attConcerns.concat(incConcerns)} label="Attendance concerns" />
    <div className="flex items-center justify-end mb-2"><ExportGroup onCSV={function () { downloadCSV('attendance_' + MONTHS[month - 1] + year + '.csv', ['Employee', 'Code', 'Dept', 'Att%', 'Present', 'Half', 'Absent', 'Incomplete', 'Hours'], filtered.map(function (r) { var pct = r.effective_days > 0 ? Math.round((r.days_present / r.effective_days) * 100) : 0; return [r.name, r.emp_code, r.department_name, pct, r.days_present, r.days_half, r.days_absent, r.days_incomplete, r.total_hours] })) }} onDocx={function () { exportAnalysisDocx('attendance', filtered, docxOpts) }} /></div>
    <div className="grid grid-cols-5 gap-4 mb-5">
      <StatCard label="Staff" value={filtered.length} prev={prevF.length || null} />
      <StatCard label="Overall Attendance" value={overallPct + '%'} color={overallPct >= 90 ? 'text-emerald-600' : overallPct >= 75 ? 'text-amber-600' : 'text-red-600'} delta={calcDelta(overallPct, prevPct)} />
      <StatCard label="Present Days" value={totalPresent} color="text-emerald-600" delta={calcDelta(totalPresent, prevTP || null)} />
      <StatCard label="Absent Days" value={totalAbsent} color="text-red-600" />
      <StatCard label="Half Days" value={totalHalf} color="text-orange-600" />
    </div>
    <DataTable headers={['Employee', 'Dept', 'Att %', 'Present', 'Half', 'Absent', 'Incomplete', 'Hours']} rows={tableRows} sortCol={sortCol} sortDir={sortDir} onSort={function (i) { if (sortCol === i) { setSortDir(sortDir === 'asc' ? 'desc' : 'asc') } else { setSortCol(i); setSortDir('asc') } }} />
    <div className="grid grid-cols-3 gap-5 mt-5 mb-5">
      <div className="bg-white border border-gray-200 rounded-xl p-5"><h3 className="text-sm font-bold text-gray-700 mb-3">Status breakdown</h3>
        <ResponsiveContainer width="100%" height={200}><PieChart><Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={75} innerRadius={42} paddingAngle={2}>{pieData.map(function (d, i) { return <Cell key={i} fill={d.color} /> })}</Pie><Tooltip /><Legend iconType="circle" wrapperStyle={{ fontSize: 11 }} /></PieChart></ResponsiveContainer>
      </div>
      <div className="col-span-2 bg-white border border-gray-200 rounded-xl p-5">
        <div className="flex items-center justify-between mb-3"><h3 className="text-sm font-bold text-gray-700">{chartMode === 'bottom' ? 'Bottom' : 'Top'} {Math.min(CHART_LIMIT, filtered.length)} by attendance %</h3>
          <div className="flex items-center gap-1">
            <button onClick={function () { setChartMode('bottom') }} className={'px-2.5 py-1 text-[10px] font-bold rounded-md ' + (chartMode === 'bottom' ? 'bg-slate-800 text-white' : 'bg-gray-100 text-gray-600')}>Bottom</button>
            <button onClick={function () { setChartMode('top') }} className={'px-2.5 py-1 text-[10px] font-bold rounded-md ' + (chartMode === 'top' ? 'bg-slate-800 text-white' : 'bg-gray-100 text-gray-600')}>Top</button>
          </div>
        </div>
        <ResponsiveContainer width="100%" height={200}><BarChart data={chartSlice}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="name" tick={{ fontSize: 9 }} angle={-35} textAnchor="end" height={55} /><YAxis domain={[0, 100]} tick={{ fontSize: 11 }} tickFormatter={function (v) { return v + '%' }} /><Tooltip formatter={function (v) { return v + '%' }} /><Bar dataKey="pct" name="Attendance %">{chartSlice.map(function (d, i) { return <Cell key={i} fill={d.fill} /> })}</Bar></BarChart></ResponsiveContainer>
      </div>
    </div>
    {deptAgg.length > 1 && (<div className="bg-white border border-gray-200 rounded-xl p-5 mb-5"><h3 className="text-sm font-bold text-gray-700 mb-3">Attendance % by department</h3>
      <ResponsiveContainer width="100%" height={Math.max(deptAgg.length * 40, 120)}><BarChart data={deptAgg} layout="vertical" margin={{ left: 110, right: 40, top: 5, bottom: 5 }}><CartesianGrid strokeDasharray="3 3" horizontal={false} /><XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11 }} tickFormatter={function (v) { return v + '%' }} /><YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={110} /><Tooltip formatter={function (v) { return v + '%' }} /><Bar dataKey="pct" barSize={18} radius={[0, 4, 4, 0]}>{deptAgg.map(function (d, i) { return <Cell key={i} fill={d.fill} /> })}</Bar></BarChart></ResponsiveContainer>
    </div>)}
  </>)
}

/* ========================== HOURS VIEW ========================== */
function HoursView({ data, prevData, loading, month, year, fromDate, toDate, docxOpts }) {
  var [sortCol, setSortCol] = useState(null); var [sortDir, setSortDir] = useState('asc')
  if (loading) return <Loader />
  var filtered = data.filter(function (r) { return !r.is_casual && r.effective_days > 0 })
  var withAvg = filtered.map(function (r) { var w = (r.days_present || 0) + (r.days_half || 0); return { ...r, avgDaily: w > 0 ? Math.round((r.total_hours / w) * 10) / 10 : 0 } })
  withAvg.sort(function (a, b) { return a.avgDaily - b.avgDaily })
  var overallAvg = withAvg.length > 0 ? Math.round(withAvg.reduce(function (s, r) { return s + r.avgDaily }, 0) / withAvg.length * 10) / 10 : 0
  var below8 = withAvg.filter(function (r) { return r.avgDaily < 8 }).length
  var above10 = withAvg.filter(function (r) { return r.avgDaily >= 10 }).length
  var prevF = (prevData || []).filter(function (r) { return !r.is_casual && r.effective_days > 0 })
  var prevAvg = prevF.length > 0 ? Math.round(prevF.reduce(function (s, r) { var w = (r.days_present || 0) + (r.days_half || 0); return s + (w > 0 ? r.total_hours / w : 0) }, 0) / prevF.length * 10) / 10 : null

  var hrsConcerns = withAvg.filter(function (r) { var t = r.expected_hours || 9; return r.avgDaily > 0 && r.avgDaily < t * 0.6 }).slice(0, 3).map(function (r) { return { name: r.name, code: r.emp_code, detail: r.avgDaily + 'h avg (target ' + (r.expected_hours || 9) + 'h)', color: 'red' } })
  var hrsWarnings = withAvg.filter(function (r) { var t = r.expected_hours || 9; return r.avgDaily >= t * 0.6 && r.avgDaily < t }).slice(0, 2).map(function (r) { return { name: r.name, code: r.emp_code, detail: r.avgDaily + 'h avg (target ' + (r.expected_hours || 9) + 'h)', color: 'amber' } })

  var hrsChart = withAvg.map(function (r) { return { name: r.name.length > 15 ? r.name.slice(0, 15) + '\u2026' : r.name, avgDaily: r.avgDaily, fill: hrsToColor(r.avgDaily) } })
  var KEYS = ['name', 'department_name', 'avgDaily', 'total_hours', 'days_present', 'avgDaily']
  var sortedHrs = sortCol !== null ? withAvg.slice().sort(function (a, b) { var key = KEYS[sortCol]; var va = a[key], vb = b[key]; if (typeof va === 'string') { va = (va || '').toLowerCase(); vb = (vb || '').toLowerCase() }; return (sortDir === 'desc' ? -1 : 1) * (va < vb ? -1 : va > vb ? 1 : 0) }) : withAvg
  var tableRows = sortedHrs.map(function (r) {
    var hc = r.avgDaily >= 8 ? 'text-emerald-600 font-semibold' : r.avgDaily >= 6 ? 'text-amber-600 font-semibold' : 'text-red-600 font-semibold'
    var flag = r.avgDaily < 6 ? 'Low hours' : r.avgDaily < 8 ? 'Below target' : r.avgDaily >= 10 ? 'Extended shifts' : 'On track'
    var fc = r.avgDaily < 6 ? 'text-red-600 bg-red-50' : r.avgDaily < 8 ? 'text-amber-600 bg-amber-50' : r.avgDaily >= 10 ? 'text-blue-600 bg-blue-50' : 'text-emerald-600 bg-emerald-50'
    return [{ text: r.name, sub: r.emp_code }, r.department_name || '\u2014', { text: r.avgDaily + 'h', className: hc }, r.total_hours + 'h', r.days_present, { text: flag, className: 'text-[10px] font-bold px-2 py-0.5 rounded-full ' + fc }]
  })

  return (<>
    <ConcernBanner items={hrsConcerns.concat(hrsWarnings)} label="Low working hours" />
    <div className="flex items-center justify-end mb-2"><ExportGroup onCSV={function () { downloadCSV('hours_' + MONTHS[month - 1] + year + '.csv', ['Employee', 'Code', 'Dept', 'Avg Daily', 'Total Hours', 'Days Present'], withAvg.map(function (r) { return [r.name, r.emp_code, r.department_name, r.avgDaily, r.total_hours, r.days_present] })) }} onDocx={function () { exportAnalysisDocx('hours', filtered, docxOpts) }} /></div>
    <div className="grid grid-cols-4 gap-4 mb-5">
      <StatCard label="Staff" value={withAvg.length} />
      <StatCard label="Avg Daily Hours" value={overallAvg + 'h'} color="text-blue-600" delta={calcDelta(overallAvg, prevAvg)} />
      <StatCard label="Below 8h Avg" value={below8} color="text-red-600" />
      <StatCard label="Above 10h Avg" value={above10} color="text-emerald-600" />
    </div>
    <DataTable headers={['Employee', 'Dept', 'Avg Daily', 'Total Hours', 'Days Present', 'Status']} rows={tableRows} sortCol={sortCol} sortDir={sortDir} onSort={function (i) { if (sortCol === i) { setSortDir(sortDir === 'asc' ? 'desc' : 'asc') } else { setSortCol(i); setSortDir('asc') } }} />
    <div className="bg-white border border-gray-200 rounded-xl p-5 mt-5">
      <h3 className="text-sm font-bold text-gray-700 mb-4">Average daily hours by employee (lowest first)</h3>
      <ResponsiveContainer width="100%" height={Math.max(withAvg.length * 28, 200)}>
        <BarChart data={hrsChart} layout="vertical" margin={{ left: 110, right: 30, top: 5, bottom: 5 }}><CartesianGrid strokeDasharray="3 3" horizontal={false} /><XAxis type="number" domain={[0, 14]} tick={{ fontSize: 11 }} tickFormatter={function (v) { return v + 'h' }} /><YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={110} /><Tooltip formatter={function (v) { return [v + 'h', 'Avg Daily'] }} /><Bar dataKey="avgDaily" barSize={14} radius={[0, 4, 4, 0]}>{hrsChart.map(function (d, i) { return <Cell key={i} fill={d.fill} /> })}</Bar></BarChart>
      </ResponsiveContainer>
    </div>
    <DeptAggregation data={filtered} label="Avg daily hours by department" getValue={function (list) { var t = 0, d = 0; list.forEach(function (r) { var w = (r.days_present || 0) + (r.days_half || 0); t += r.total_hours; d += w }); return d > 0 ? Math.round(t / d * 10) / 10 : 0 }} colorFn={hrsToColor} suffix="h" domain={[0, 14]} />
  </>)
}

/* ========================== DAR VIEW ========================== */
function DARView({ data, prevData, loading, month, year, fromDate, toDate, docxOpts }) {
  var [sortCol, setSortCol] = useState(null); var [sortDir, setSortDir] = useState('asc')
  if (loading) return <Loader />
  var bufDate = new Date(Date.now() - 86400000).toISOString().slice(0, 10)
  var lag = toDate > bufDate ? 1 : 0
  var isRecent = lag > 0
  var filtered = data.map(function (r) {
    if (lag === 0) return r
    var ap = Math.max(0, (r.days_present || 0) - lag)
    var as = Math.min(r.days_submitted || 0, ap)
    var pc = ap > 0 ? Math.round(as / ap * 100) : 100
    return { ...r, days_present: ap, days_submitted: as, compliance_pct: pc }
  })
  filtered.sort(function (a, b) { return a.compliance_pct - b.compliance_pct })
  var totalP = filtered.reduce(function (s, r) { return s + (r.days_present || 0) }, 0)
  var totalS = filtered.reduce(function (s, r) { return s + (r.days_submitted || 0) }, 0)
  var overallPct = totalP > 0 ? Math.min(100, Math.round((totalS / totalP) * 100)) : 0
  var full = filtered.filter(function (r) { return r.compliance_pct >= 90 }).length
  var low = filtered.filter(function (r) { return r.compliance_pct < 50 }).length
  var prevP = (prevData || []).reduce(function (s, r) { return s + (r.days_present || 0) }, 0)
  var prevS = (prevData || []).reduce(function (s, r) { return s + (r.days_submitted || 0) }, 0)
  var prevPct = prevP > 0 ? Math.round((prevS / prevP) * 100) : null

  var darConcerns = filtered.filter(function (r) { return r.compliance_pct < 30 }).slice(0, 3).map(function (r) { return { name: r.name, code: r.emp_code, detail: r.compliance_pct + '% (' + (r.days_submitted || 0) + '/' + (r.days_present || 0) + ')', color: 'red' } })
  var darWarnings = filtered.filter(function (r) { return r.compliance_pct >= 30 && r.compliance_pct < 70 }).slice(0, 2).map(function (r) { return { name: r.name, code: r.emp_code, detail: r.compliance_pct + '% compliance', color: 'amber' } })

  var darChart = filtered.map(function (r) { return { name: r.name.length > 15 ? r.name.slice(0, 15) + '\u2026' : r.name, pct: r.compliance_pct, fill: pctToColor(r.compliance_pct) } })
  var KEYS = ['name', 'department_name', 'compliance_pct', 'days_submitted', 'days_present', '_missing']
  var wm = filtered.map(function (r) { return { ...r, _missing: Math.max(0, (r.days_present || 0) - (r.days_submitted || 0)) } })
  var sortedDar = sortCol !== null ? wm.slice().sort(function (a, b) { var key = KEYS[sortCol]; var va = a[key], vb = b[key]; if (typeof va === 'string') { va = (va || '').toLowerCase(); vb = (vb || '').toLowerCase() }; return (sortDir === 'desc' ? -1 : 1) * (va < vb ? -1 : va > vb ? 1 : 0) }) : wm
  var tableRows = sortedDar.map(function (r) { var pc = r.compliance_pct >= 90 ? 'text-emerald-600 font-semibold' : r.compliance_pct >= 50 ? 'text-amber-600 font-semibold' : 'text-red-600 font-semibold'; return [{ text: r.name, sub: r.emp_code }, r.department_name || '\u2014', { text: r.compliance_pct + '%', className: pc }, r.days_submitted || 0, r.days_present || 0, r._missing > 0 ? { text: String(r._missing), className: 'text-red-600 font-semibold' } : '0'] })

  return (<>
    <ConcernBanner items={darConcerns.concat(darWarnings)} label="Low DAR compliance" />
    {isRecent && <p className="text-[10px] text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-3">{'\u{1F551}'} DARs from the last 1-2 days may not be reflected yet (nightly consolidation runs at 9:30 PM)</p>}
    <div className="flex items-center justify-end mb-2"><ExportGroup onCSV={function () { downloadCSV('dar_' + MONTHS[month - 1] + year + '.csv', ['Employee', 'Code', 'Dept', 'Compliance%', 'Submitted', 'Present', 'Missing'], filtered.map(function (r) { return [r.name, r.emp_code, r.department_name, r.compliance_pct, r.days_submitted, r.days_present, Math.max(0, (r.days_present || 0) - (r.days_submitted || 0))] })) }} onDocx={function () { exportAnalysisDocx('dar', filtered, docxOpts) }} /></div>
    <div className="grid grid-cols-5 gap-4 mb-5">
      <StatCard label="DAR Required" value={filtered.length} />
      <StatCard label="Overall Compliance" value={overallPct + '%'} color={overallPct >= 90 ? 'text-emerald-600' : overallPct >= 75 ? 'text-amber-600' : 'text-red-600'} delta={calcDelta(overallPct, prevPct)} />
      <StatCard label="Total Submitted" value={totalS} color="text-emerald-600" />
      <StatCard label="90%+ Compliance" value={full} color="text-blue-600" />
      <StatCard label="Below 50%" value={low} color="text-red-600" />
    </div>
    <DataTable headers={['Employee', 'Dept', 'Compliance', 'Submitted', 'Days Present', 'Missing']} rows={tableRows} sortCol={sortCol} sortDir={sortDir} onSort={function (i) { if (sortCol === i) { setSortDir(sortDir === 'asc' ? 'desc' : 'asc') } else { setSortCol(i); setSortDir('asc') } }} />
    <div className="bg-white border border-gray-200 rounded-xl p-5 mt-5">
      <h3 className="text-sm font-bold text-gray-700 mb-4">DAR submission rate by employee (lowest first)</h3>
      <ResponsiveContainer width="100%" height={Math.max(filtered.length * 28, 200)}>
        <BarChart data={darChart} layout="vertical" margin={{ left: 110, right: 30, top: 5, bottom: 5 }}><CartesianGrid strokeDasharray="3 3" horizontal={false} /><XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11 }} tickFormatter={function (v) { return v + '%' }} /><YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={110} /><Tooltip formatter={function (v) { return [v + '%', 'Compliance'] }} /><Bar dataKey="pct" barSize={14} radius={[0, 4, 4, 0]}>{darChart.map(function (d, i) { return <Cell key={i} fill={d.fill} /> })}</Bar></BarChart>
      </ResponsiveContainer>
    </div>
    <DeptAggregation data={filtered} label="DAR compliance by department" getValue={function (list) { var s = list.reduce(function (s, r) { return s + (r.days_submitted || 0) }, 0); var p = list.reduce(function (s, r) { return s + (r.days_present || 0) }, 0); return p > 0 ? Math.round(s / p * 100) : 0 }} colorFn={pctToColor} suffix="%" domain={[0, 100]} />
  </>)
}

/* ========================== SHARED COMPONENTS ========================== */
function ConcernBanner({ items, label }) {
  if (!items || items.length === 0) return null
  return (
    <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-5">
      <div className="flex items-center gap-2 mb-2">
        <span className="flex items-center justify-center w-6 h-6 rounded-full bg-amber-200 text-xs">{'\u26A0'}</span>
        <p className="text-xs font-bold text-amber-800 uppercase">{label} {'\u2014'} {items.length} employee{items.length > 1 ? 's' : ''}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {items.map(function (c, i) {
          var bg = c.color === 'red' ? 'bg-red-100 border-red-200 text-red-800' : 'bg-amber-100 border-amber-300 text-amber-800'
          return (<div key={i} className={'flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-medium ' + bg}>
            <span className="font-bold">{c.name}</span><span className="opacity-70">{c.code}</span><span className="opacity-60">{'\u2022'} {c.detail}</span>
          </div>)
        })}
      </div>
    </div>
  )
}
function DeptAggregation({ data, label, getValue, colorFn, suffix, domain }) {
  var dm = {}; data.forEach(function (r) { var dn = r.department_name || 'Unknown'; if (!dm[dn]) dm[dn] = []; dm[dn].push(r) })
  var dd = Object.keys(dm).map(function (dn) { var v = getValue(dm[dn]); return { name: dn, value: v, fill: colorFn(v) } }).sort(function (a, b) { return a.value - b.value })
  if (dd.length <= 1) return null
  return (<div className="bg-white border border-gray-200 rounded-xl p-5 mt-5"><h3 className="text-sm font-bold text-gray-700 mb-3">{label}</h3>
    <ResponsiveContainer width="100%" height={Math.max(dd.length * 40, 120)}><BarChart data={dd} layout="vertical" margin={{ left: 110, right: 40, top: 5, bottom: 5 }}><CartesianGrid strokeDasharray="3 3" horizontal={false} /><XAxis type="number" domain={domain} tick={{ fontSize: 11 }} tickFormatter={function (v) { return v + suffix }} /><YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={110} /><Tooltip formatter={function (v) { return v + suffix }} /><Bar dataKey="value" barSize={18} radius={[0, 4, 4, 0]}>{dd.map(function (d, i) { return <Cell key={i} fill={d.fill} /> })}</Bar></BarChart></ResponsiveContainer>
  </div>)
}
function StatCard({ label, value, color, delta, prev }) {
  var sd = delta != null && delta !== 0, sp = !sd && prev != null
  return (<div className="bg-white border border-gray-200 rounded-xl px-4 py-3">
    <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-0.5">{label}</p>
    <div className="flex items-end gap-2"><p className={'text-2xl font-bold ' + (color || 'text-gray-900')}>{value}</p>
      {sd && <span className={'text-[10px] font-bold mb-1 ' + (delta > 0 ? 'text-emerald-600' : 'text-red-600')}>{delta > 0 ? '\u2191' : '\u2193'}{Math.abs(delta)}%</span>}
      {sp && prev !== value && <span className="text-[10px] text-gray-400 mb-1">was {prev}</span>}
    </div>
  </div>)
}
function Loader() { return <div className="text-center py-16"><div className="w-6 h-6 border-2 border-slate-700 border-t-transparent rounded-full animate-spin mx-auto" /></div> }
function ExportGroup({ onCSV, onDocx }) {
  return (<div className="flex items-center gap-1">
    <button onClick={onCSV} className="flex items-center gap-1 px-2.5 py-1.5 text-[10px] font-bold text-gray-600 bg-gray-50 border border-gray-200 rounded-lg hover:bg-gray-100 transition-colors"><svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>CSV</button>
    <button onClick={onDocx} className="flex items-center gap-1 px-2.5 py-1.5 text-[10px] font-bold text-blue-700 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 transition-colors"><svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>DOCX</button>
  </div>)
}
function DataTable({ headers, rows, sortCol, sortDir, onSort }) {
  return (<div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm"><table className="w-full text-xs"><thead><tr className="bg-gray-50 border-b border-gray-200">
    {headers.map(function (h, i) { var a = sortCol === i; return (<th key={i} onClick={onSort ? function () { onSort(i) } : undefined} className={'text-left px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider select-none ' + (onSort ? 'cursor-pointer hover:text-gray-800 ' : '') + (a ? 'text-slate-800' : 'text-gray-500')}>{h}{a && <span className="ml-1 text-[9px]">{sortDir === 'asc' ? '\u25B2' : '\u25BC'}</span>}</th>) })}
  </tr></thead><tbody>
    {rows.length === 0 ? (<tr><td colSpan={headers.length} className="text-center py-6 text-xs text-gray-400">No data</td></tr>) :
      rows.map(function (row, ri) { return (<tr key={ri} className="border-b border-gray-100 hover:bg-gray-50">{row.map(function (cell, ci) {
        if (typeof cell === 'object' && cell !== null && cell.text !== undefined) { return (<td key={ci} className="px-3 py-1.5"><span className={cell.className || ''}>{cell.text}</span>{cell.sub && <span className="block text-[10px] text-gray-400">{cell.sub}</span>}</td>) }
        return <td key={ci} className="px-3 py-1.5 text-gray-700">{cell}</td>
      })}</tr>) })}
  </tbody></table></div>)
}
