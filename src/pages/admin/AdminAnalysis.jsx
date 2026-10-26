// AdminAnalysis.jsx
// Admin / manager "Analysis" page. Pick a department + date range (or a month
// chip), then switch between four sub-views: Punch Timing, Attendance, Hours
// and DAR Compliance. Each view shows a concerns panel, stat cards, a sortable
// table, recharts charts, and CSV / DOCX exports. "Custom Report" opens the
// ExportFieldPicker for a field-by-field monthly DOCX.
// Phones (< md): stacked toolbar, chip + sub-tab bars scroll sideways, compact
// cards, tables scroll inside their card with a sticky Employee column, and the
// horizontal bar charts drop their wide left gutter (useIsPhone).

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/useAuth'
import { exportAnalysisDocx } from '../../lib/exportAnalysisDocx'
import ExportFieldPicker from '../../components/ExportFieldPicker'
import DeptPicker from '../../components/DeptPicker'
import { exportMonthlyDocx } from '../../lib/exportMonthlyDocx'
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

// Presentational helpers: 24x24 line icons (no emoji in the admin UI)
function Icon({ className, children }) {
  return (<svg className={className || 'w-4 h-4'} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>)
}
var ICONS = {
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  clipboard: <><rect x="6" y="4" width="12" height="17" rx="2" /><path d="M9 4h6v3H9z" /><path d="M9 12h6M9 16h4" /></>,
  timer: <><circle cx="12" cy="13" r="8" /><path d="M12 9v4l2 2" /><path d="M10 2h4" /></>,
  doc: <><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5" /><path d="M9 13h6M9 17h6" /></>,
  search: <><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></>,
  alert: <><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" /><path d="M12 9v4" /><path d="M12 17h.01" /></>,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 10h18" /></>,
  download: <><path d="M4 16v1a3 3 0 0 0 3 3h10a3 3 0 0 0 3-3v-1" /><path d="M8 12l4 4 4-4" /><path d="M12 16V4" /></>,
}
var CARD = 'bg-white rounded-2xl ring-1 ring-gray-200/70 shadow-sm'
// Chart card padding: tighter on phones, unchanged from md up
var CHART_CARD = 'bg-white rounded-2xl ring-1 ring-gray-200/70 shadow-sm p-3 md:p-5'

// Presentation-only: true below the md breakpoint, so the recharts horizontal
// bar charts can use a narrower label gutter on phones (desktop values unchanged)
var PHONE_MQ = '(max-width: 767px)'
function useIsPhone() {
  var [isPhone, setIsPhone] = useState(function () { return typeof window !== 'undefined' && window.matchMedia(PHONE_MQ).matches })
  useEffect(function () {
    var mq = window.matchMedia(PHONE_MQ)
    function onChange() { setIsPhone(mq.matches) }
    mq.addEventListener('change', onChange)
    return function () { mq.removeEventListener('change', onChange) }
  }, [])
  return isPhone
}
// Horizontal (layout="vertical") bar chart geometry: phone vs desktop
function hbar(isPhone, right) {
  return {
    margin: isPhone ? { left: 0, right: 12, top: 5, bottom: 5 } : { left: 110, right: right, top: 5, bottom: 5 },
    yWidth: isPhone ? 92 : 110,
    tick: isPhone ? { fontSize: 10 } : { fontSize: 11 }
  }
}
var DOTS = { 'text-emerald-600': 'bg-emerald-500', 'text-red-500': 'bg-red-500', 'text-red-600': 'bg-red-500', 'text-blue-600': 'bg-blue-500', 'text-amber-600': 'bg-amber-500', 'text-orange-600': 'bg-orange-500' }
function initialsOf(name) { return String(name || '?').trim().split(/\s+/).slice(0, 2).map(function (w) { return w[0] }).join('').toUpperCase() }

// Punch Timing's "Avg Hrs" uses the same formula as the Hours tab: total
// worked hours / (Present + Half Day days), from monthly_summary_range, so
// Half Day days count in both. (avg_punch_times leaves short Half Day days
// out of its own average, so the two tabs showed different numbers for the
// same person.) Rows with no match keep the function's own value.
function withHoursTabAvg(timingRows, summaryRows) {
  var byKey = {}
  summaryRows.forEach(function (r) {
    if (r.employee_id) byKey['id:' + r.employee_id] = r
    if (r.emp_code) byKey['code:' + r.emp_code] = r
  })
  return timingRows.map(function (t) {
    var m = (t.employee_id && byKey['id:' + t.employee_id]) || (t.emp_code && byKey['code:' + t.emp_code])
    if (!m) return t
    var days = (m.days_present || 0) + (m.days_half || 0)
    return { ...t, avg_hours: days > 0 ? Math.round((m.total_hours / days) * 10) / 10 : 0 }
  })
}

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
  var [showFieldPicker, setShowFieldPicker] = useState(false)
  var [fieldExportLoading, setFieldExportLoading] = useState(false)

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
    var [cur, prv, curSum, prvSum] = await Promise.all([
      supabase.rpc('avg_punch_times', { p_from_date: fromDate, p_to_date: toDate, p_department_id: deptIdParam }),
      supabase.rpc('avg_punch_times', { p_from_date: prev.from, p_to_date: prev.to, p_department_id: deptIdParam }),
      supabase.rpc('monthly_summary_range', { p_from_date: fromDate, p_to_date: toDate, p_department_id: deptIdParam }),
      supabase.rpc('monthly_summary_range', { p_from_date: prev.from, p_to_date: prev.to, p_department_id: deptIdParam }),
    ])
    setTimingData(withHoursTabAvg(cur.data || [], curSum.data || []))
    setPrevTimingData(withHoursTabAvg(prv.data || [], prvSum.data || []))
    setTimingLoading(false)
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
    { key: 'timing', label: 'Punch Timing', icon: ICONS.clock },
    { key: 'attendance', label: 'Attendance', icon: ICONS.clipboard },
    { key: 'hours', label: 'Hours', icon: ICONS.timer },
    { key: 'dar', label: 'DAR Compliance', icon: ICONS.doc },
  ]
  var fieldCls = 'h-10 px-3 border border-gray-200 rounded-xl bg-white text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500'

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3 mb-4">
        <div>
          <h2 className="text-xl md:text-2xl font-bold text-gray-900 tracking-tight">Analysis</h2>
          <p className="text-xs md:text-sm text-gray-500 mt-0.5">Punch timing, attendance, working hours and DAR compliance across your team</p>
        </div>
        <button onClick={function () { setShowFieldPicker(true) }}
          className="h-9 px-3 inline-flex items-center gap-1.5 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 shadow-sm whitespace-nowrap">
          <Icon className="w-4 h-4">{ICONS.doc}</Icon>
          Custom Report
        </button>
      </div>

      {/* Toolbar: department, date range, month chips */}
      <div className="bg-white rounded-2xl ring-1 ring-gray-200/70 shadow-sm p-3 mb-4 flex flex-col items-stretch md:flex-row md:flex-wrap md:items-center gap-3">
        {employee.role === 'admin' && depts.length > 0 && (
          <DeptPicker departments={depts} value={deptFilter} onChange={setDeptFilter}
            allLabel="All Departments" className="h-10 rounded-xl w-full md:w-auto" />
        )}
        {employee.role === 'manager' && managerDeptIds.length > 1 && (
          <DeptPicker departments={managerDeptIds.map(function (id) { return { id: id, name: deptNames[id] || 'Dept ' + id } })}
            value={deptFilter} onChange={setDeptFilter}
            allLabel="All My Departments" className="h-10 rounded-xl w-full md:w-auto" />
        )}
        <div className="flex items-center gap-2 w-full md:w-auto">
          <input type="date" value={fromDate} max={toDate} onChange={function (e) { setFromDate(e.target.value) }} className={fieldCls + ' flex-1 min-w-0 md:flex-initial md:min-w-auto'} />
          <span className="text-xs text-gray-400 shrink-0">to</span>
          <input type="date" value={toDate} min={fromDate} max={todayStr} onChange={function (e) { setToDate(e.target.value) }} className={fieldCls + ' flex-1 min-w-0 md:flex-initial md:min-w-auto'} />
        </div>
        <div className="flex gap-1 bg-gray-100 rounded-xl p-1 max-w-full overflow-x-auto [scrollbar-width:none] md:overflow-visible">
          {[0, -1, -2].map(function (offset) {
            var d = new Date(now.getFullYear(), now.getMonth() + offset, 1); var label = MONTHS[d.getMonth()] + ' ' + d.getFullYear()
            var ms = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-01'; var active = fromDate === ms
            return (<button key={offset} onClick={function () { setMonthPreset(offset) }} className={'flex-1 md:flex-initial shrink-0 md:shrink px-3 h-8 rounded-lg text-sm font-semibold transition-colors whitespace-nowrap ' + (active ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-800')}>{label}</button>)
          })}
        </div>
      </div>

      {/* Sub-tabs + search */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex gap-1 bg-white rounded-xl ring-1 ring-gray-200/70 shadow-sm p-1 w-full md:w-auto overflow-x-auto [scrollbar-width:none] md:overflow-visible">
          {TABS.map(function (t) {
            var isActive = view === t.key
            return (<button key={t.key} onClick={function () { setView(t.key); setSearch('') }}
              className={'shrink-0 md:shrink whitespace-nowrap px-3 md:px-4 py-2 text-sm font-semibold rounded-lg transition-colors flex items-center gap-2 ' + (isActive ? 'bg-blue-600 text-white shadow-sm shadow-blue-600/30' : 'text-gray-600 hover:bg-gray-100')}>
              <Icon className="w-4 h-4">{t.icon}</Icon>
              {t.label}
            </button>)
          })}
        </div>
        <div className="relative w-full md:w-72 max-w-full">
          <Icon className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none">{ICONS.search}</Icon>
          <input type="text" value={search} onChange={function (e) { setSearch(e.target.value) }} placeholder="Search name or code…"
            className="w-full h-10 pl-9 pr-3 border border-gray-200 rounded-xl bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
      </div>

      {view === 'timing' && <TimingView data={filterBySearch(timingData)} prevData={prevTimingData} loading={timingLoading} month={month} year={year} fromDate={fromDate} toDate={toDate} docxOpts={docxOpts} />}
      {view === 'attendance' && <AttendanceView data={filterBySearch(monthlyData)} prevData={prevMonthlyData} loading={monthlyLoading} month={month} year={year} fromDate={fromDate} toDate={toDate} docxOpts={docxOpts} />}
      {view === 'hours' && <HoursView data={filterBySearch(monthlyData)} prevData={prevMonthlyData} loading={monthlyLoading} month={month} year={year} fromDate={fromDate} toDate={toDate} docxOpts={docxOpts} />}
      {view === 'dar' && <DARView data={filterBySearch(darData)} prevData={prevDarData} loading={darLoading} month={month} year={year} fromDate={fromDate} toDate={toDate} docxOpts={docxOpts} />}

      <ExportFieldPicker
        open={showFieldPicker}
        onClose={function () { setShowFieldPicker(false) }}
        onExport={async function (selectedKeys, pickerFrom, pickerTo) {
          setFieldExportLoading(true)
          await exportMonthlyDocx(selectedKeys, {
            fromDate: pickerFrom,
            toDate: pickerTo,
            deptId: deptFilter ? Number(deptFilter) : null,
            deptName: deptName,
          })
          setFieldExportLoading(false)
          setShowFieldPicker(false)
        }}
        loading={fieldExportLoading}
        defaultFrom={fromDate}
        defaultTo={toDate}
      />
    </div>
  )
}

/* ========================== TIMING VIEW ========================== */
function TimingView({ data, prevData, loading, month, year, fromDate, toDate, docxOpts }) {
  var isPhone = useIsPhone()
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
    if (r.avg_hours > 0 && r.avg_hours < (r.expected_hours || 9)) { flag = 'Low hours'; fc = 'text-red-700 bg-red-50 ring-1 ring-red-200' }
    else if (r.days_worked <= Math.round(maxDay * 0.4) && maxDay >= 7) { flag = 'Low attendance'; fc = 'text-amber-700 bg-amber-50 ring-1 ring-amber-200' }
    else if (r.avg_hours >= 10) { flag = 'Extended shifts'; fc = 'text-blue-700 bg-blue-50 ring-1 ring-blue-200' }
    r._flag = flag
    return [{ text: r.name, sub: r.emp_code }, r.department_name || '\u2014', r.days_worked, fmtSecs(r.avg_in_secs), fmtSecs(r.avg_out_secs), { text: r.avg_hours + 'h', className: hc }, r.min_hours + 'h', r.max_hours + 'h', flag ? { text: flag, className: 'inline-flex text-[11px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ' + fc } : '\u2014']
  })
  var chartData = filtered.map(function (r) { var inH = r.avg_in_secs ? Math.round(r.avg_in_secs / 360) / 10 : 0; var outH = r.avg_out_secs ? Math.round(r.avg_out_secs / 360) / 10 : 0; return { name: r.name.length > 14 ? r.name.slice(0, 14) + '\u2026' : r.name, fullName: r.name, rangeStart: inH, rangeLen: Math.max(outH - inH, 0.2), inH: inH, outH: outH, hours: r.avg_hours || 0 } }).sort(function (a, b) { return a.inH - b.inH })

  return (<>
    <ConcernBanner items={concerns.concat(warnings)} label="Low working hours" />
    <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
      <p className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-500 tabular-nums"><Icon className="w-3.5 h-3.5 text-gray-400">{ICONS.calendar}</Icon>{fromDate} {'\u2192'} {toDate} ({maxDay} days)</p>
      <ExportGroup onCSV={function () { downloadCSV('timing_' + MONTHS[month - 1] + year + '.csv', ['Employee', 'Code', 'Dept', 'Days', 'Avg In', 'Avg Out', 'Avg Hrs', 'Min Hrs', 'Max Hrs'], filtered.map(function (r) { return [r.name, r.emp_code, r.department_name, r.days_worked, fmtSecs(r.avg_in_secs), fmtSecs(r.avg_out_secs), r.avg_hours, r.min_hours, r.max_hours] })) }} onDocx={function () { exportAnalysisDocx('timing', filtered, docxOpts) }} />
    </div>
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 md:gap-3 mb-4">
      <StatCard label="Employees" value={filtered.length} prev={prevData ? prevData.length : null} />
      <StatCard label="Avg Punch In" value={fmtSecs(avgIn)} color="text-emerald-600" />
      <StatCard label="Avg Punch Out" value={fmtSecs(avgOut)} color="text-red-500" />
      <StatCard label="Avg Hours/Day" value={avgHrs + 'h'} color="text-blue-600" delta={calcDelta(avgHrs, prevAvgHrs)} />
    </div>
    <DataTable headers={['Employee', 'Dept', 'Days', 'Avg In', 'Avg Out', 'Avg Hrs', 'Min', 'Max', 'Flag']} rows={tableRows} sortCol={sortCol} sortDir={sortDir} onSort={function (i) { if (sortCol === i) { setSortDir(sortDir === 'asc' ? 'desc' : 'asc') } else { setSortCol(i); setSortDir('asc') } }} />
    <div className={CHART_CARD + ' mt-4'}>
      <h3 className="text-sm font-semibold text-gray-900 mb-4">Shift window per employee</h3>
      <ResponsiveContainer width="100%" height={Math.max(chartData.length * 30, 200)}>
        <BarChart data={chartData} layout="vertical" margin={hbar(isPhone, 30).margin}>
          <CartesianGrid strokeDasharray="3 3" horizontal={false} />
          <XAxis type="number" domain={[6, 26]} tickFormatter={fmtHour} tick={hbar(isPhone).tick} ticks={isPhone ? [8, 12, 16, 20, 24] : [8, 10, 12, 14, 16, 18, 20, 22, 24]} />
          <YAxis type="category" dataKey="name" tick={hbar(isPhone).tick} width={hbar(isPhone).yWidth} />
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
  var isPhone = useIsPhone()
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
    <div className="flex items-center justify-end mb-3"><ExportGroup onCSV={function () { downloadCSV('attendance_' + MONTHS[month - 1] + year + '.csv', ['Employee', 'Code', 'Dept', 'Att%', 'Present', 'Half', 'Absent', 'Incomplete', 'Hours'], filtered.map(function (r) { var pct = r.effective_days > 0 ? Math.round((r.days_present / r.effective_days) * 100) : 0; return [r.name, r.emp_code, r.department_name, pct, r.days_present, r.days_half, r.days_absent, r.days_incomplete, r.total_hours] })) }} onDocx={function () { exportAnalysisDocx('attendance', filtered, docxOpts) }} /></div>
    <div className="grid grid-cols-2 lg:grid-cols-5 gap-2 md:gap-3 mb-4">
      <StatCard label="Staff" value={filtered.length} prev={prevF.length || null} />
      <StatCard label="Overall Attendance" value={overallPct + '%'} color={overallPct >= 90 ? 'text-emerald-600' : overallPct >= 75 ? 'text-amber-600' : 'text-red-600'} delta={calcDelta(overallPct, prevPct)} />
      <StatCard label="Present Days" value={totalPresent} color="text-emerald-600" delta={calcDelta(totalPresent, prevTP || null)} />
      <StatCard label="Absent Days" value={totalAbsent} color="text-red-600" />
      <StatCard label="Half Days" value={totalHalf} color="text-orange-600" />
    </div>
    <DataTable headers={['Employee', 'Dept', 'Att %', 'Present', 'Half', 'Absent', 'Incomplete', 'Hours']} rows={tableRows} sortCol={sortCol} sortDir={sortDir} onSort={function (i) { if (sortCol === i) { setSortDir(sortDir === 'asc' ? 'desc' : 'asc') } else { setSortCol(i); setSortDir('asc') } }} />
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mt-4 mb-4">
      <div className={CHART_CARD}><h3 className="text-sm font-semibold text-gray-900 mb-3">Status breakdown</h3>
        <ResponsiveContainer width="100%" height={200}><PieChart><Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={75} innerRadius={42} paddingAngle={2}>{pieData.map(function (d, i) { return <Cell key={i} fill={d.color} /> })}</Pie><Tooltip /><Legend iconType="circle" wrapperStyle={{ fontSize: 11 }} /></PieChart></ResponsiveContainer>
      </div>
      <div className={'lg:col-span-2 ' + CHART_CARD}>
        <div className="flex items-center justify-between gap-2 mb-3"><h3 className="text-sm font-semibold text-gray-900">{chartMode === 'bottom' ? 'Bottom' : 'Top'} {Math.min(CHART_LIMIT, filtered.length)} by attendance %</h3>
          <div className="flex items-center gap-0.5 bg-gray-100 rounded-lg p-0.5">
            <button onClick={function () { setChartMode('bottom') }} className={'px-2.5 h-7 rounded-md text-xs font-semibold transition-colors ' + (chartMode === 'bottom' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-800')}>Bottom</button>
            <button onClick={function () { setChartMode('top') }} className={'px-2.5 h-7 rounded-md text-xs font-semibold transition-colors ' + (chartMode === 'top' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-800')}>Top</button>
          </div>
        </div>
        <ResponsiveContainer width="100%" height={200}><BarChart data={chartSlice}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="name" tick={{ fontSize: 9 }} angle={-35} textAnchor="end" height={55} /><YAxis domain={[0, 100]} tick={{ fontSize: 11 }} tickFormatter={function (v) { return v + '%' }} /><Tooltip formatter={function (v) { return v + '%' }} /><Bar dataKey="pct" name="Attendance %">{chartSlice.map(function (d, i) { return <Cell key={i} fill={d.fill} /> })}</Bar></BarChart></ResponsiveContainer>
      </div>
    </div>
    {deptAgg.length > 1 && (<div className={CHART_CARD + ' mb-4'}><h3 className="text-sm font-semibold text-gray-900 mb-3">Attendance % by department</h3>
      <ResponsiveContainer width="100%" height={Math.max(deptAgg.length * 40, 120)}><BarChart data={deptAgg} layout="vertical" margin={hbar(isPhone, 40).margin}><CartesianGrid strokeDasharray="3 3" horizontal={false} /><XAxis type="number" domain={[0, 100]} tick={hbar(isPhone).tick} tickFormatter={function (v) { return v + '%' }} /><YAxis type="category" dataKey="name" tick={hbar(isPhone).tick} width={hbar(isPhone).yWidth} /><Tooltip formatter={function (v) { return v + '%' }} /><Bar dataKey="pct" barSize={18} radius={[0, 4, 4, 0]}>{deptAgg.map(function (d, i) { return <Cell key={i} fill={d.fill} /> })}</Bar></BarChart></ResponsiveContainer>
    </div>)}
  </>)
}

/* ========================== HOURS VIEW ========================== */
function HoursView({ data, prevData, loading, month, year, fromDate, toDate, docxOpts }) {
  var isPhone = useIsPhone()
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
    var fc = r.avgDaily < 6 ? 'text-red-700 bg-red-50 ring-1 ring-red-200' : r.avgDaily < 8 ? 'text-amber-700 bg-amber-50 ring-1 ring-amber-200' : r.avgDaily >= 10 ? 'text-blue-700 bg-blue-50 ring-1 ring-blue-200' : 'text-emerald-700 bg-emerald-50 ring-1 ring-emerald-200'
    return [{ text: r.name, sub: r.emp_code }, r.department_name || '\u2014', { text: r.avgDaily + 'h', className: hc }, r.total_hours + 'h', r.days_present, { text: flag, className: 'inline-flex text-[11px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ' + fc }]
  })

  return (<>
    <ConcernBanner items={hrsConcerns.concat(hrsWarnings)} label="Low working hours" />
    <div className="flex items-center justify-end mb-3"><ExportGroup onCSV={function () { downloadCSV('hours_' + MONTHS[month - 1] + year + '.csv', ['Employee', 'Code', 'Dept', 'Avg Daily', 'Total Hours', 'Days Present'], withAvg.map(function (r) { return [r.name, r.emp_code, r.department_name, r.avgDaily, r.total_hours, r.days_present] })) }} onDocx={function () { exportAnalysisDocx('hours', filtered, docxOpts) }} /></div>
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 md:gap-3 mb-4">
      <StatCard label="Staff" value={withAvg.length} />
      <StatCard label="Avg Daily Hours" value={overallAvg + 'h'} color="text-blue-600" delta={calcDelta(overallAvg, prevAvg)} />
      <StatCard label="Below 8h Avg" value={below8} color="text-red-600" />
      <StatCard label="Above 10h Avg" value={above10} color="text-emerald-600" />
    </div>
    <DataTable headers={['Employee', 'Dept', 'Avg Daily', 'Total Hours', 'Days Present', 'Status']} rows={tableRows} sortCol={sortCol} sortDir={sortDir} onSort={function (i) { if (sortCol === i) { setSortDir(sortDir === 'asc' ? 'desc' : 'asc') } else { setSortCol(i); setSortDir('asc') } }} />
    <div className={CHART_CARD + ' mt-4'}>
      <h3 className="text-sm font-semibold text-gray-900 mb-4">Average daily hours by employee (lowest first)</h3>
      <ResponsiveContainer width="100%" height={Math.max(withAvg.length * 28, 200)}>
        <BarChart data={hrsChart} layout="vertical" margin={hbar(isPhone, 30).margin}><CartesianGrid strokeDasharray="3 3" horizontal={false} /><XAxis type="number" domain={[0, 14]} tick={hbar(isPhone).tick} tickFormatter={function (v) { return v + 'h' }} /><YAxis type="category" dataKey="name" tick={hbar(isPhone).tick} width={hbar(isPhone).yWidth} /><Tooltip formatter={function (v) { return [v + 'h', 'Avg Daily'] }} /><Bar dataKey="avgDaily" barSize={14} radius={[0, 4, 4, 0]}>{hrsChart.map(function (d, i) { return <Cell key={i} fill={d.fill} /> })}</Bar></BarChart>
      </ResponsiveContainer>
    </div>
    <DeptAggregation data={filtered} label="Avg daily hours by department" getValue={function (list) { var t = 0, d = 0; list.forEach(function (r) { var w = (r.days_present || 0) + (r.days_half || 0); t += r.total_hours; d += w }); return d > 0 ? Math.round(t / d * 10) / 10 : 0 }} colorFn={hrsToColor} suffix="h" domain={[0, 14]} />
  </>)
}

/* ========================== DAR VIEW ========================== */
function DARView({ data, prevData, loading, month, year, fromDate, toDate, docxOpts }) {
  var isPhone = useIsPhone()
  var [sortCol, setSortCol] = useState(null); var [sortDir, setSortDir] = useState('asc')
  if (loading) return <Loader />
  var lag = 0
  var isRecent = toDate >= new Date().toISOString().slice(0, 10)
  var filtered = data.map(function (r) { return r })
  filtered.sort(function (a, b) { return a.compliance_pct - b.compliance_pct })
  var totalP = filtered.reduce(function (s, r) { return s + (r.days_present || 0) }, 0)
  var totalOnTime = filtered.reduce(function (s, r) { return s + (r.days_submitted_on_time || 0) }, 0)
  var totalLate = filtered.reduce(function (s, r) { return s + (r.days_late || 0) }, 0)
  var overallPct = totalP > 0 ? Math.min(100, Math.round((totalOnTime / totalP) * 100)) : 0
  var full = filtered.filter(function (r) { return r.compliance_pct >= 90 }).length
  var low = filtered.filter(function (r) { return r.compliance_pct < 50 }).length
  var prevP = (prevData || []).reduce(function (s, r) { return s + (r.days_present || 0) }, 0)
  var prevOnTime = (prevData || []).reduce(function (s, r) { return s + (r.days_submitted_on_time || 0) }, 0)
  var prevPct = prevP > 0 ? Math.round((prevOnTime / prevP) * 100) : null

  var darConcerns = filtered.filter(function (r) { return r.compliance_pct < 30 }).slice(0, 3).map(function (r) { return { name: r.name, code: r.emp_code, detail: r.compliance_pct + '% (' + (r.days_submitted_on_time || 0) + '/' + (r.days_present || 0) + ')', color: 'red' } })
  var darWarnings = filtered.filter(function (r) { return r.compliance_pct >= 30 && r.compliance_pct < 70 }).slice(0, 2).map(function (r) { return { name: r.name, code: r.emp_code, detail: r.compliance_pct + '% compliance', color: 'amber' } })

  var darChart = filtered.map(function (r) { return { name: r.name.length > 15 ? r.name.slice(0, 15) + '\u2026' : r.name, pct: r.compliance_pct, fill: pctToColor(r.compliance_pct) } })
  var KEYS = ['name', 'department_name', 'compliance_pct', 'days_submitted_on_time', 'days_late', 'days_present', '_missing']
  var wm = filtered.map(function (r) { return { ...r, _missing: Math.max(0, (r.days_present || 0) - (r.days_submitted || 0)) } })
  var sortedDar = sortCol !== null ? wm.slice().sort(function (a, b) { var key = KEYS[sortCol]; var va = a[key], vb = b[key]; if (typeof va === 'string') { va = (va || '').toLowerCase(); vb = (vb || '').toLowerCase() }; return (sortDir === 'desc' ? -1 : 1) * (va < vb ? -1 : va > vb ? 1 : 0) }) : wm
  var tableRows = sortedDar.map(function (r) {
    var pc = r.compliance_pct >= 90 ? 'text-emerald-600 font-semibold' : r.compliance_pct >= 50 ? 'text-amber-600 font-semibold' : 'text-red-600 font-semibold'
    var lateCell = (r.days_late || 0) > 0 ? { text: String(r.days_late), className: 'text-amber-600 font-semibold' } : '0'
    return [{ text: r.name, sub: r.emp_code }, r.department_name || '\u2014', { text: r.compliance_pct + '%', className: pc }, r.days_submitted_on_time || 0, lateCell, r.days_present || 0, r._missing > 0 ? { text: String(r._missing), className: 'text-red-600 font-semibold' } : '0']
  })

  return (<>
    <ConcernBanner items={darConcerns.concat(darWarnings)} label="Low DAR compliance" />
    {isRecent && <p className="flex items-center gap-2 text-xs text-amber-800 bg-amber-50/70 ring-1 ring-amber-200 rounded-xl px-3 py-2 mb-3"><Icon className="w-4 h-4 text-amber-600 shrink-0">{ICONS.clock}</Icon>DARs from today may not be reflected yet (nightly consolidation runs at 11:20 PM)</p>}
    {filtered.length > 0 && filtered[0].dar_cutoff && <p className="flex items-center gap-2 text-xs text-gray-600 bg-white ring-1 ring-gray-200/70 rounded-xl px-3 py-2 mb-3"><Icon className="w-4 h-4 text-gray-400 shrink-0">{ICONS.calendar}</Icon><span>DAR data through <strong className="text-gray-900">{filtered[0].dar_cutoff}</strong></span></p>}
    <div className="flex items-center justify-end mb-3"><ExportGroup onCSV={function () { downloadCSV('dar_' + MONTHS[month - 1] + year + '.csv', ['Employee', 'Code', 'Dept', 'Compliance%', 'On-Time', 'Late', 'Present', 'Missing'], filtered.map(function (r) { return [r.name, r.emp_code, r.department_name, r.compliance_pct, r.days_submitted_on_time || 0, r.days_late || 0, r.days_present, Math.max(0, (r.days_present || 0) - (r.days_submitted || 0))] })) }} onDocx={function () { exportAnalysisDocx('dar', filtered, docxOpts) }} /></div>
    <div className="grid grid-cols-2 lg:grid-cols-6 gap-2 md:gap-3 mb-4">
      <StatCard label="DAR Required" value={filtered.length} />
      <StatCard label="Overall Compliance" value={overallPct + '%'} color={overallPct >= 90 ? 'text-emerald-600' : overallPct >= 75 ? 'text-amber-600' : 'text-red-600'} delta={calcDelta(overallPct, prevPct)} />
      <StatCard label="On-Time Submitted" value={totalOnTime} color="text-emerald-600" />
      <StatCard label="Late" value={totalLate} color="text-amber-600" />
      <StatCard label="90%+ Compliance" value={full} color="text-blue-600" />
      <StatCard label="Below 50%" value={low} color="text-red-600" />
    </div>
    <DataTable headers={['Employee', 'Dept', 'Compliance', 'On-Time', 'Late', 'Days Present', 'Missing']} rows={tableRows} sortCol={sortCol} sortDir={sortDir} onSort={function (i) { if (sortCol === i) { setSortDir(sortDir === 'asc' ? 'desc' : 'asc') } else { setSortCol(i); setSortDir('asc') } }} />
    <div className={CHART_CARD + ' mt-4'}>
      <h3 className="text-sm font-semibold text-gray-900 mb-4">DAR submission rate by employee (lowest first)</h3>
      <ResponsiveContainer width="100%" height={Math.max(filtered.length * 28, 200)}>
        <BarChart data={darChart} layout="vertical" margin={hbar(isPhone, 30).margin}><CartesianGrid strokeDasharray="3 3" horizontal={false} /><XAxis type="number" domain={[0, 100]} tick={hbar(isPhone).tick} tickFormatter={function (v) { return v + '%' }} /><YAxis type="category" dataKey="name" tick={hbar(isPhone).tick} width={hbar(isPhone).yWidth} /><Tooltip formatter={function (v) { return [v + '%', 'Compliance'] }} /><Bar dataKey="pct" barSize={14} radius={[0, 4, 4, 0]}>{darChart.map(function (d, i) { return <Cell key={i} fill={d.fill} /> })}</Bar></BarChart>
      </ResponsiveContainer>
    </div>
    <DeptAggregation data={filtered} label="DAR compliance by department" getValue={function (list) { var s = list.reduce(function (s, r) { return s + (r.days_submitted_on_time || 0) }, 0); var p = list.reduce(function (s, r) { return s + (r.days_present || 0) }, 0); return p > 0 ? Math.round(s / p * 100) : 0 }} colorFn={pctToColor} suffix="%" domain={[0, 100]} />
  </>)
}

/* ========================== SHARED COMPONENTS ========================== */
function ConcernBanner({ items, label }) {
  if (!items || items.length === 0) return null
  return (
    // One compact strip: icon + label + count, then the people as pills on the same line
    <div className="flex flex-wrap items-center gap-2 rounded-xl bg-amber-50/70 ring-1 ring-amber-200 px-3 py-2 mb-3">
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-900 shrink-0 mr-1">
        <Icon className="w-4 h-4 text-amber-600">{ICONS.alert}</Icon>
        {label}
        <span className="px-1.5 rounded-md bg-amber-100 text-amber-800 tabular-nums">{items.length}</span>
      </span>
      {items.map(function (c, i) {
        var dot = c.color === 'red' ? 'bg-red-500' : 'bg-amber-500'
        var tone = c.color === 'red' ? 'text-red-700' : 'text-amber-700'
        return (<span key={i} title={c.code} className="inline-flex items-center gap-1.5 pl-2 pr-2.5 py-0.5 bg-white ring-1 ring-amber-200 rounded-full text-xs max-w-full md:max-w-none">
          <span className={'w-1.5 h-1.5 rounded-full shrink-0 ' + dot} />
          <span className="font-semibold text-gray-900 truncate md:overflow-visible md:whitespace-normal">{c.name}</span>
          <span className={'tabular-nums whitespace-nowrap md:whitespace-normal ' + tone}>{c.detail}</span>
        </span>)
      })}
    </div>
  )
}
function DeptAggregation({ data, label, getValue, colorFn, suffix, domain }) {
  var isPhone = useIsPhone()
  var dm = {}; data.forEach(function (r) { var dn = r.department_name || 'Unknown'; if (!dm[dn]) dm[dn] = []; dm[dn].push(r) })
  var dd = Object.keys(dm).map(function (dn) { var v = getValue(dm[dn]); return { name: dn, value: v, fill: colorFn(v) } }).sort(function (a, b) { return a.value - b.value })
  if (dd.length <= 1) return null
  return (<div className={CHART_CARD + ' mt-4'}><h3 className="text-sm font-semibold text-gray-900 mb-3">{label}</h3>
    <ResponsiveContainer width="100%" height={Math.max(dd.length * 40, 120)}><BarChart data={dd} layout="vertical" margin={hbar(isPhone, 40).margin}><CartesianGrid strokeDasharray="3 3" horizontal={false} /><XAxis type="number" domain={domain} tick={hbar(isPhone).tick} tickFormatter={function (v) { return v + suffix }} /><YAxis type="category" dataKey="name" tick={hbar(isPhone).tick} width={hbar(isPhone).yWidth} /><Tooltip formatter={function (v) { return v + suffix }} /><Bar dataKey="value" barSize={18} radius={[0, 4, 4, 0]}>{dd.map(function (d, i) { return <Cell key={i} fill={d.fill} /> })}</Bar></BarChart></ResponsiveContainer>
  </div>)
}
function StatCard({ label, value, color, delta, prev }) {
  var sd = delta != null && delta !== 0, sp = !sd && prev != null
  var dot = DOTS[color] || 'bg-slate-400'
  return (<div className={CARD + ' px-3 py-2.5 md:px-4 md:py-3 min-w-0 md:min-w-auto'}>
    <p className="flex items-center gap-2 text-[12px] md:text-[13px] font-medium text-gray-500">
      <span className={'w-2 h-2 shrink-0 rounded-full ' + dot} />
      {label}
    </p>
    <div className="flex flex-wrap items-baseline gap-x-2 mt-0.5 md:mt-1"><p className={'text-[22px] md:text-[26px] font-bold leading-tight tabular-nums ' + (color || 'text-gray-900')}>{value}</p>
      {sd && <span className={'inline-flex px-1.5 py-0.5 rounded-full text-[11px] font-semibold tabular-nums ' + (delta > 0 ? 'text-emerald-700 bg-emerald-50' : 'text-red-700 bg-red-50')}>{delta > 0 ? '↑' : '↓'}{Math.abs(delta)}%</span>}
      {sp && prev !== value && <span className="text-xs text-gray-400 tabular-nums">was {prev}</span>}
    </div>
  </div>)
}
function Loader() { return <div className="text-center py-16"><div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto" /></div> }
function ExportGroup({ onCSV, onDocx }) {
  return (<div className="flex items-center gap-2">
    <button onClick={onCSV} className="h-9 px-3 inline-flex items-center gap-1.5 rounded-lg bg-white ring-1 ring-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50"><Icon className="w-4 h-4">{ICONS.download}</Icon>CSV</button>
    <button onClick={onDocx} className="h-9 px-3 inline-flex items-center gap-1.5 rounded-lg bg-white ring-1 ring-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50"><Icon className="w-4 h-4 text-blue-600">{ICONS.doc}</Icon>DOCX</button>
  </div>)
}
// Phone-only sticky Employee column (released at md)
var STICKY_COL = 'sticky left-0 z-10 shadow-[4px_0_6px_-4px_rgba(15,23,42,0.18)] md:static md:z-auto md:shadow-none'
function DataTable({ headers, rows, sortCol, sortDir, onSort }) {
  return (<div className={CARD + ' overflow-hidden'}><div className="overflow-x-auto"><table className="w-full min-w-max md:min-w-0 text-sm"><thead><tr className="bg-gray-50/80 border-b border-gray-200">
    {headers.map(function (h, i) { var a = sortCol === i; return (<th key={i} onClick={onSort ? function () { onSort(i) } : undefined} className={'text-left px-3 py-2.5 md:px-4 md:py-3 text-[11px] font-semibold uppercase tracking-wider select-none whitespace-nowrap ' + (onSort ? 'cursor-pointer hover:text-gray-900 ' : '') + (a ? 'text-gray-900' : 'text-gray-500') + (i === 0 ? ' ' + STICKY_COL + ' bg-gray-50 md:bg-transparent' : '')}>{h}{a && <span className="ml-1">{sortDir === 'asc' ? '↑' : '↓'}</span>}</th>) })}
  </tr></thead><tbody className="divide-y divide-gray-100">
    {rows.length === 0 ? (<tr><td colSpan={headers.length} className="text-center py-12 text-sm text-gray-500">No data</td></tr>) :
      rows.map(function (row, ri) { return (<tr key={ri} className="hover:bg-blue-50/30 transition-colors">{row.map(function (cell, ci) {
        if (typeof cell === 'object' && cell !== null && cell.text !== undefined) {
          if (cell.sub !== undefined) {
            // Employee column: initials avatar + name + code below
            return (<td key={ci} className={'px-3 py-2.5 md:px-4 md:py-3 ' + STICKY_COL + ' bg-white md:bg-transparent'}><div className="flex items-center gap-3 w-32 md:w-auto md:min-w-48">
              <span className="hidden md:inline-flex w-8 h-8 rounded-full bg-slate-100 text-slate-500 text-[11px] font-bold items-center justify-center shrink-0">{initialsOf(cell.text)}</span>
              <div className="min-w-0"><p className={'font-semibold text-gray-900 md:truncate ' + (cell.className || '')}>{cell.text}</p>{cell.sub && <p className="text-xs text-gray-400 tabular-nums">{cell.sub}</p>}</div>
            </div></td>)
          }
          return (<td key={ci} className="px-3 py-2.5 md:px-4 md:py-3 tabular-nums whitespace-nowrap"><span className={cell.className || ''}>{cell.text}</span></td>)
        }
        return <td key={ci} className={'px-3 py-2.5 md:px-4 md:py-3 text-[13px] whitespace-nowrap ' + (ci === 1 ? 'text-gray-600' : 'text-gray-700 tabular-nums')}>{cell}</td>
      })}</tr>) })}
  </tbody></table></div>
    {rows.length > 0 && <div className="px-4 py-2.5 border-t border-gray-100 text-xs text-gray-500">Showing {rows.length} employee{rows.length !== 1 ? 's' : ''}</div>}
  </div>)
}
