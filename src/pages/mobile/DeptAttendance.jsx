import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { fmtTime } from '../../lib/formatters'
import { useAuth } from '../../lib/useAuth'
import { useLanguage } from '../../lib/i18n'

var STATUS_COLORS = {
  Present: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  Absent: 'bg-red-50 text-red-600 border-red-200',
  Incomplete: 'bg-amber-50 text-amber-700 border-amber-200',
  'Half Day': 'bg-orange-50 text-orange-600 border-orange-200'
}

export default function DeptAttendance() {
  var { employee } = useAuth()
  var { t } = useLanguage()
  var today = new Date().toISOString().slice(0, 10)

  var [date, setDate] = useState(today)
  var [records, setRecords] = useState([])
  var [deptName, setDeptName] = useState('')
  var [loading, setLoading] = useState(true)
  var [search, setSearch] = useState('')
  var [statusFilter, setStatusFilter] = useState('')
  var [detail, setDetail] = useState(null)
  var [detailPunches, setDetailPunches] = useState([])
  var [detailLoading, setDetailLoading] = useState(false)
  var [view, setView] = useState('daily') // 'daily' | 'dars'
  var [darRecords, setDarRecords] = useState([])
  var [darLoading, setDarLoading] = useState(false)
  var [darSearch, setDarSearch] = useState('')
  var [expandedDar, setExpandedDar] = useState(null)
  var [depts, setDepts] = useState([])
  var [deptFilter, setDeptFilter] = useState('')
  var [mYear, setMYear] = useState(new Date().getFullYear())
  var [mMonth, setMMonth] = useState(new Date().getMonth() + 1)
  var [mRecords, setMRecords] = useState([])
  var [mLoading, setMLoading] = useState(false)
  var [mSearch, setMSearch] = useState('')
  var [mDetail, setMDetail] = useState(null)
  var [mDetailDays, setMDetailDays] = useState([])
  var [mDetailLoading, setMDetailLoading] = useState(false)

  var loadData = useCallback(async function () {
    setLoading(true)
    var [attRes, deptRes] = await Promise.all([
      supabase.rpc('admin_daily_attendance', { p_date: date }),
      supabase.from('departments').select('name').eq('id', employee.department_id).single()
    ])

    var all = attRes.data || []
    var deptOnly = employee.role === 'admin' ? all : all.filter(function (r) { return r.department_id === employee.department_id })
    setRecords(deptOnly)
    setDeptName(deptRes.data ? deptRes.data.name : '')
    setLoading(false)
  }, [date, employee.department_id])

  useEffect(function () { loadData() }, [loadData])

  useEffect(function () {
    if (employee.role === 'admin') {
      supabase.from('departments').select('id, name').order('name')
        .then(function (res) { setDepts(res.data || []) })
    }
  }, [employee.role])

  var loadDARs = useCallback(async function () {
    setDarLoading(true)
    var [darsRes, empsRes] = await Promise.all([
      supabase
        .from('daily_reports')
        .select('id, emp_code, report_date, punch_in, punch_out, tasks, submitted_at')
        .eq('report_date', date),
      (function () {
        var q = supabase.from('employees').select('emp_code, name')
          .eq('active', true).eq('is_casual', false)
        if (employee.role !== 'admin') return q.eq('department_id', employee.department_id)
        if (deptFilter) return q.eq('department_id', Number(deptFilter))
        return q
      })()
    ])

    var empMap = {}
    ;(empsRes.data || []).forEach(function (e) { empMap[e.emp_code] = e.name })
    var deptCodes = new Set(Object.keys(empMap))

    var deptDars = (darsRes.data || []).filter(function (d) { return deptCodes.has(d.emp_code) })
    deptDars.forEach(function (d) { d._name = empMap[d.emp_code] || d.emp_code })

    var submittedCodes = new Set(deptDars.map(function (d) { return d.emp_code }))
    Object.keys(empMap).forEach(function (code) {
      if (!submittedCodes.has(code)) {
        deptDars.push({ id: 'miss-' + code, emp_code: code, _name: empMap[code], _missing: true })
      }
    })

    deptDars.sort(function (a, b) {
      if (a._missing && !b._missing) return 1
      if (!a._missing && b._missing) return -1
      return a._name.localeCompare(b._name)
    })

    setDarRecords(deptDars)
    setDarLoading(false)
  }, [date, employee.department_id, employee.role, deptFilter])

  useEffect(function () {
    if (view === 'dars') loadDARs()
  }, [view, loadDARs])

  var loadMonthly = useCallback(async function () {
    setMLoading(true)
    var { data } = await supabase.rpc('monthly_summary', {
      p_year: mYear,
      p_month: mMonth,
      p_department_id: employee.role === 'admin' ? (deptFilter ? Number(deptFilter) : null) : employee.department_id
    })
    setMRecords(data || [])
    setMLoading(false)
  }, [mYear, mMonth, employee.department_id, deptFilter])

  useEffect(function () {
    if (view === 'monthly') loadMonthly()
  }, [view, loadMonthly])

  async function openMonthlyDetail(r) {
    setMDetail(r)
    setMDetailLoading(true)

    var [halfRes, absentRes] = await Promise.all([
      supabase.rpc('get_config', { p_key: 'half_day_threshold_hours' }),
      supabase.rpc('get_config', { p_key: 'absent_threshold_hours' })
    ])
    var halfThreshold = 4
    var absentThreshold = 0.5
    try { halfThreshold = parseFloat(String(halfRes.data).replace(/"/g, '')) || 4 } catch (e) {}
    try { absentThreshold = parseFloat(String(absentRes.data).replace(/"/g, '')) || 0.5 } catch (e) {}

    var startDate = mYear + '-' + String(mMonth).padStart(2, '0') + '-01'
    var endDay = new Date(mYear, mMonth, 0).getDate()
    var endDate = mYear + '-' + String(mMonth).padStart(2, '0') + '-' + String(endDay).padStart(2, '0')

    var { data: punches } = await supabase
      .from('punches')
      .select('attendance_date, punch_type, punched_at, location_name, nearest_venue_id, venues(name)')
      .eq('employee_id', r.employee_id)
      .gte('attendance_date', startDate)
      .lte('attendance_date', endDate)
      .order('punched_at')

    var dayMap = {}
    ;(punches || []).forEach(function (p) {
      if (!dayMap[p.attendance_date]) dayMap[p.attendance_date] = []
      dayMap[p.attendance_date].push(p)
    })

    var todayStr = new Date().toISOString().slice(0, 10)
    var days = []
    for (var d = 1; d <= endDay; d++) {
      var dateStr = mYear + '-' + String(mMonth).padStart(2, '0') + '-' + String(d).padStart(2, '0')
      if (dateStr > todayStr) break
      var dayPunches = dayMap[dateStr] || []
      var firstIn = null, lastOut = null, hours = 0

      dayPunches.forEach(function (p) {
        if (p.punch_type === 'in' && !firstIn) firstIn = p
        if (p.punch_type === 'out') lastOut = p
      })

      if (firstIn && lastOut) {
        hours = Math.round(((new Date(lastOut.punched_at) - new Date(firstIn.punched_at)) / 3600000) * 10) / 10
      }

      var status = 'Absent'
      if (dayPunches.length > 0) {
        if (!firstIn || !lastOut) status = 'Incomplete'
        else if (hours >= halfThreshold) status = 'Present'
        else if (hours >= absentThreshold) status = 'Half Day'
        else status = 'Absent'
      }

      days.push({
        date: dateStr,
        day: d,
        weekday: ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][new Date(dateStr + 'T00:00:00').getDay()],
        status: status,
        firstIn: firstIn,
        lastOut: lastOut,
        hours: hours
      })
    }

    setMDetailDays(days.reverse())
    setMDetailLoading(false)
  }

  async function openDetail(r) {
    setDetail(r)
    setDetailLoading(true)

    var { data } = await supabase
      .from('punches')
      .select('id, punch_type, punched_at, selfie_path, latitude, longitude, gps_accuracy_meters, nearest_venue_id, is_proxy, location_name, venues(name)')
      .eq('employee_id', r.employee_id)
      .eq('attendance_date', date)
      .order('punched_at')

    setDetailPunches(data || [])
    setDetailLoading(false)
  }

  var filtered = records.filter(function (r) {
    if (employee.role === 'admin' && deptFilter && r.department_id !== Number(deptFilter)) return false
    if (statusFilter && r.status !== statusFilter) return false
    if (search) {
      var q = search.toLowerCase()
      if (!r.name.toLowerCase().includes(q) && !r.emp_code.toLowerCase().includes(q)) return false
    }
    return true
  })

  var stats = { total: filtered.length, Present: 0, Absent: 0, Incomplete: 0, 'Half Day': 0 }
  filtered.forEach(function (r) {
    if (stats[r.status] !== undefined) stats[r.status]++
  })

  var isToday = date === today
  var isYesterday = date === new Date(Date.now() - 86400000).toISOString().slice(0, 10)
  var dateLabel = isToday ? 'Today' : isYesterday ? 'Yesterday' : date

  return (
    <div>
      <h2 className="text-lg font-bold text-gray-900 mb-0.5">My Department</h2>
      <p className="text-xs text-gray-400 mb-3">{employee.role === 'admin' ? 'All Departments' : deptName}</p>

      {/* Daily / Monthly toggle */}
      <div className="flex bg-gray-100 rounded-lg p-0.5 mb-3">
        <button onClick={function () { setView('daily') }}
          className={'flex-1 py-1.5 text-xs font-semibold rounded-md transition-colors ' +
            (view === 'daily' ? 'bg-white text-slate-800 shadow-sm' : 'text-gray-500')}>
          Daily
        </button>
        <button onClick={function () { setView('monthly') }}
          className={'flex-1 py-1.5 text-xs font-semibold rounded-md transition-colors ' +
            (view === 'monthly' ? 'bg-white text-slate-800 shadow-sm' : 'text-gray-500')}>
          Monthly
        </button>
        <button onClick={function () { setView('dars') }}
          className={'flex-1 py-1.5 text-xs font-semibold rounded-md transition-colors ' +
            (view === 'dars' ? 'bg-white text-slate-800 shadow-sm' : 'text-gray-500')}>
          DARs
        </button>
      </div>

      {employee.role === 'admin' && depts.length > 0 && (
        <select value={deptFilter} onChange={function (e) { setDeptFilter(e.target.value) }}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm mb-3 bg-white focus:outline-none focus:ring-2 focus:ring-slate-700">
          <option value="">All Departments</option>
          {depts.map(function (d) {
            return <option key={d.id} value={d.id}>{d.name}</option>
          })}
        </select>
      )}

      {view === 'monthly' && <MonthlyView
        mYear={mYear} setMYear={setMYear} mMonth={mMonth} setMMonth={setMMonth}
        mRecords={mRecords} mLoading={mLoading} mSearch={mSearch} setMSearch={setMSearch} t={t}
        onTapEmployee={openMonthlyDetail}
      />}
      {view === 'dars' && <>
        {/* Date nav */}
        <div className="flex items-center gap-2 mb-3">
          <button onClick={function () {
            var d = new Date(date); d.setDate(d.getDate() - 1); setDate(d.toISOString().slice(0, 10))
          }} className="px-2.5 py-1.5 text-sm bg-gray-100 rounded-lg hover:bg-gray-200 active:bg-gray-300">←</button>
          <input type="date" value={date} onChange={function (e) { setDate(e.target.value) }}
            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm text-center focus:outline-none focus:ring-2 focus:ring-slate-700" />
          <button onClick={function () {
            var d = new Date(date); d.setDate(d.getDate() + 1)
            if (d <= new Date()) setDate(d.toISOString().slice(0, 10))
          }} disabled={isToday}
            className="px-2.5 py-1.5 text-sm bg-gray-100 rounded-lg hover:bg-gray-200 active:bg-gray-300 disabled:opacity-30">→</button>
        </div>

        {/* DAR stats */}
        <div className="flex gap-3 mb-3">
          <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 flex-1 text-center">
            <p className="text-[9px] font-semibold text-emerald-600 uppercase">Submitted</p>
            <p className="text-lg font-bold text-emerald-700">{darRecords.filter(function (d) { return !d._missing }).length}</p>
          </div>
          <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 flex-1 text-center">
            <p className="text-[9px] font-semibold text-red-500 uppercase">Missing</p>
            <p className="text-lg font-bold text-red-600">{darRecords.filter(function (d) { return d._missing }).length}</p>
          </div>
        </div>

        {/* Search */}
        <input type="text" value={darSearch} onChange={function (e) { setDarSearch(e.target.value) }}
          placeholder="Search name or code…"
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-slate-700" />

        {darLoading ? (
          <p className="text-sm text-gray-400 text-center py-12">{t('loading')}</p>
        ) : (
          <div className="space-y-2">
            {darRecords.filter(function (d) {
              if (!darSearch) return true
              var q = darSearch.toLowerCase()
              return d._name.toLowerCase().includes(q) || d.emp_code.toLowerCase().includes(q)
            }).map(function (d) {
              if (d._missing) {
                return (
                  <div key={d.id} className="border border-red-200 bg-red-50 rounded-xl px-4 py-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-semibold text-red-700">{d._name}</p>
                        <p className="text-[11px] text-red-400">{d.emp_code}</p>
                      </div>
                      <span className="text-[10px] font-bold text-red-500 uppercase">Not Submitted</span>
                    </div>
                  </div>
                )
              }

              var isExpanded = expandedDar === d.id
              var bullets = d.tasks ? d.tasks.split('\n').filter(function (l) { return l.trim() }).map(function (l) {
                var line = l.trim()
                if (line.startsWith('•') || line.startsWith('-') || line.startsWith('*')) return '• ' + line.slice(1).trim()
                return '• ' + line
              }) : []

              return (
                <button key={d.id} onClick={function () { setExpandedDar(isExpanded ? null : d.id) }}
                  className="w-full text-left border border-emerald-200 bg-emerald-50 rounded-xl px-4 py-3 transition-colors active:scale-[0.99]">
                  <div className="flex items-center justify-between mb-1">
                    <div>
                      <p className="text-sm font-semibold text-emerald-800">{d._name}</p>
                      <p className="text-[11px] text-emerald-500">{d.emp_code}</p>
                    </div>
                    <div className="text-right">
                      <span className="text-[10px] font-bold text-emerald-600 uppercase">Submitted</span>
                      <p className="text-[10px] text-emerald-400">{fmtTime(d.submitted_at)}</p>
                    </div>
                  </div>
                  {!isExpanded && bullets.length > 0 && (
                    <p className="text-xs text-emerald-600 truncate mt-1">{bullets[0]} {bullets.length > 1 ? '(+' + (bullets.length - 1) + ')' : ''}</p>
                  )}
                  {isExpanded && (
                    <div className="mt-2 pt-2 border-t border-emerald-200 space-y-1">
                      {bullets.map(function (b, i) {
                        return <p key={i} className="text-xs text-emerald-700">{b}</p>
                      })}
                    </div>
                  )}
                </button>
              )
            })}
          </div>
        )}
      </>}
      {view === 'daily' && <>
      {/* Date nav */}
      <div className="flex items-center gap-2 mb-3">
        <button onClick={function () {
          var d = new Date(date); d.setDate(d.getDate() - 1); setDate(d.toISOString().slice(0, 10))
        }} className="px-2.5 py-1.5 text-sm bg-gray-100 rounded-lg hover:bg-gray-200 active:bg-gray-300">←</button>
        <input type="date" value={date} onChange={function (e) { setDate(e.target.value) }}
          className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm text-center focus:outline-none focus:ring-2 focus:ring-slate-700" />
        <button onClick={function () {
          var d = new Date(date); d.setDate(d.getDate() + 1)
          if (d <= new Date()) setDate(d.toISOString().slice(0, 10))
        }} disabled={isToday}
          className="px-2.5 py-1.5 text-sm bg-gray-100 rounded-lg hover:bg-gray-200 active:bg-gray-300 disabled:opacity-30">→</button>
      </div>

      {/* Stats — tappable to filter */}
      <div className="grid grid-cols-5 gap-1.5 mb-3">
        {[
          { label: 'Total', value: stats.total, color: 'text-slate-700', filter: '' },
          { label: 'Present', value: stats.Present, color: 'text-emerald-600', filter: 'Present' },
          { label: 'Absent', value: stats.Absent, color: 'text-red-600', filter: 'Absent' },
          { label: 'Inc', value: stats.Incomplete, color: 'text-amber-600', filter: 'Incomplete' },
          { label: 'Half', value: stats['Half Day'], color: 'text-orange-600', filter: 'Half Day' }
        ].map(function (s) {
          var isActive = statusFilter === s.filter
          return (
            <button key={s.label} onClick={function () { setStatusFilter(isActive && s.filter ? '' : s.filter) }}
              className={'bg-white border rounded-lg px-1 py-2 text-center transition-colors ' +
                (isActive && s.filter ? 'border-slate-700 ring-1 ring-slate-700' : 'border-gray-200')}>
              <p className="text-[8px] font-semibold text-gray-400 uppercase">{s.label}</p>
              <p className={'text-lg font-bold ' + s.color}>{s.value}</p>
            </button>
          )
        })}
      </div>

      {/* Search */}
      <input type="text" value={search} onChange={function (e) { setSearch(e.target.value) }}
        placeholder="Search name or code…"
        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-slate-700" />

      {/* List */}
      {loading ? (
        <p className="text-sm text-gray-400 text-center py-12">{t('loading')}</p>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-8">No records</p>
      ) : (
        <div className="space-y-2">
          {filtered.map(function (r) {
            var colors = STATUS_COLORS[r.status] || 'bg-gray-50 text-gray-500 border-gray-200'
            return (
              <button key={r.employee_id} onClick={function () { openDetail(r) }}
                className={'w-full text-left border rounded-xl px-4 py-3 transition-colors active:scale-[0.99] ' + colors}>
                <div className="flex items-center justify-between mb-1">
                  <div>
                    <p className="text-sm font-semibold">{r.name}</p>
                    <p className="text-[11px] opacity-70">{r.emp_code}</p>
                  </div>
                  <span className="text-[10px] font-bold uppercase">{r.status}</span>
                </div>
                {r.status !== 'Absent' && (
                  <div className="mt-1 text-[11px] opacity-80">
                    <div className="flex gap-4">
                      <span>In: <strong>{fmtTime(r.first_in)}</strong></span>
                      <span>Out: <strong>{fmtTime(r.last_out)}</strong></span>
                      {r.in_count > 1 && <span>{r.in_count} sessions</span>}
                    </div>
                    {r.punches && r.punches.length > 0 && (
                      <div className="flex gap-4 mt-0.5 text-[10px]">
                        {(function () {
                          var inP = r.punches.find(function (p) { return p.punch_type === 'in' })
                          var outP = r.punches.slice().reverse().find(function (p) { return p.punch_type === 'out' })
                          var inLoc = inP && (inP.venue || inP.location_name)
                          var outLoc = outP && (outP.venue || outP.location_name)
                          return <>
                            {inLoc && <span className={inP.venue ? 'text-emerald-600' : 'text-gray-500'}>📍 {inLoc.length > 20 ? inLoc.slice(0, 20) + '…' : inLoc}</span>}
                            {outLoc && <span className={outP.venue ? 'text-emerald-600' : 'text-gray-500'}>📍 {outLoc.length > 20 ? outLoc.slice(0, 20) + '…' : outLoc}</span>}
                          </>
                        })()}
                      </div>
                    )}
                  </div>
                )}
              </button>
            )
          })}
        </div>
      )}
      </>}

      {/* DETAIL MODAL */}
      {detail && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end justify-center" onClick={function () { setDetail(null) }}>
          <div className="bg-white rounded-t-2xl w-full max-w-md shadow-xl max-h-[80vh] flex flex-col"
            onClick={function (e) { e.stopPropagation() }}>
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between shrink-0">
              <div>
                <h3 className="text-sm font-bold text-gray-900">{detail.name}</h3>
                <p className="text-xs text-gray-500">{detail.emp_code} · {dateLabel}</p>
              </div>
              <div className="flex items-center gap-2">
                <span className={'text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ' +
                  (STATUS_COLORS[detail.status] || 'bg-gray-100 text-gray-500')}>
                  {detail.status}
                </span>
                <button onClick={function () { setDetail(null) }} className="text-gray-400 hover:text-gray-700 text-lg">✕</button>
              </div>
            </div>
            <div className="overflow-y-auto flex-1 px-5 py-4">
              {detailLoading ? (
                <p className="text-sm text-gray-400 text-center py-8">{t('loading')}</p>
              ) : detailPunches.length === 0 ? (
                <p className="text-sm text-gray-400 italic text-center py-8">No punches recorded</p>
              ) : (
                <div className="space-y-3">
                  {detailPunches.map(function (p) {
                    var venueName = p.venues ? p.venues.name : null
                    var hasGps = p.latitude != null && p.longitude != null
                    var mapsUrl = hasGps ? 'https://www.google.com/maps?q=' + p.latitude + ',' + p.longitude : null

                    return (
                      <div key={p.id} className="bg-gray-50 rounded-xl px-4 py-3">
                        <div className="flex items-center justify-between mb-1.5">
                          <div className="flex items-center gap-2">
                            <span className={'text-[10px] font-bold uppercase px-2 py-0.5 rounded ' +
                              (p.punch_type === 'in' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-600')}>
                              {p.punch_type === 'in' ? 'Punch In' : 'Punch Out'}
                            </span>
                            {p.is_proxy && <span className="text-[9px] text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">proxy</span>}
                          </div>
                          <span className="text-sm font-mono font-semibold text-gray-700">{fmtTime(p.punched_at)}</span>
                        </div>

                        {/* Location */}
                        <div className="flex items-center gap-1.5 mt-1">
                          <span className="text-xs">📍</span>
                          {venueName ? (
                            <span className="text-xs text-emerald-700 font-medium">{venueName}</span>
                          ) : p.location_name ? (
                            <span className="text-xs text-gray-600">{p.location_name}</span>
                          ) : hasGps ? (
                            <span className="text-xs text-gray-400 italic">Unknown area</span>
                          ) : (
                            <span className="text-xs text-gray-400">No GPS data</span>
                          )}
                          {p.gps_accuracy_meters && p.gps_accuracy_meters > 100 && (
                            <span className="text-[9px] text-amber-500 ml-1">±{Math.round(p.gps_accuracy_meters)}m</span>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      {/* Monthly drill-down modal */}
      {mDetail && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end justify-center" onClick={function () { setMDetail(null) }}>
          <div className="bg-white rounded-t-2xl w-full max-w-md shadow-xl max-h-[85vh] flex flex-col"
            onClick={function (e) { e.stopPropagation() }}>
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between shrink-0">
              <div>
                <h3 className="text-sm font-bold text-gray-900">{mDetail.name}</h3>
                <p className="text-xs text-gray-500">{mDetail.emp_code} · {MONTHS[mMonth - 1]} {mYear}</p>
              </div>
              <button onClick={function () { setMDetail(null) }} className="text-gray-400 hover:text-gray-700 text-lg">✕</button>
            </div>

            <div className="flex gap-2 px-5 py-2.5 border-b border-gray-100 bg-gray-50">
              <span className="text-[11px] text-emerald-600 font-bold">{mDetail.days_present || 0}P</span>
              <span className="text-[11px] text-orange-600 font-bold">{mDetail.days_half || 0}H</span>
              <span className="text-[11px] text-red-600 font-bold">{mDetail.days_absent || 0}A</span>
              <span className="text-[11px] text-amber-600 font-bold">{mDetail.days_incomplete || 0}Inc</span>
              <span className="text-[11px] text-gray-500">{mDetail.total_hours}hrs</span>
            </div>

            <div className="overflow-y-auto flex-1 px-5 py-3">
              {mDetailLoading ? (
                <p className="text-sm text-gray-400 text-center py-8">{t('loading')}</p>
              ) : mDetailDays.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-8">No data</p>
              ) : (
                <div className="space-y-1.5">
                  {mDetailDays.map(function (day) {
                    var statusColor = day.status === 'Present' ? 'bg-emerald-50 border-emerald-200' :
                      day.status === 'Absent' ? 'bg-red-50 border-red-200' :
                      day.status === 'Half Day' ? 'bg-orange-50 border-orange-200' :
                      day.status === 'Incomplete' ? 'bg-amber-50 border-amber-200' :
                      'bg-gray-50 border-gray-200'

                    var statusText = day.status === 'Present' ? 'text-emerald-700' :
                      day.status === 'Absent' ? 'text-red-600' :
                      day.status === 'Half Day' ? 'text-orange-600' :
                      'text-amber-600'

                    var locationIn = day.firstIn && day.firstIn.venues ? day.firstIn.venues.name : (day.firstIn ? day.firstIn.location_name : null)

                    return (
                      <div key={day.date} className={'border rounded-lg px-3 py-2 ' + statusColor}>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-gray-700 w-5">{day.day}</span>
                            <span className="text-[10px] text-gray-400 w-7">{day.weekday}</span>
                            {day.status !== 'Absent' && (
                              <>
                                <span className="text-[11px] text-gray-600">
                                  {day.firstIn ? fmtTime(day.firstIn.punched_at) : '—'}
                                </span>
                                <span className="text-[10px] text-gray-400">→</span>
                                <span className="text-[11px] text-gray-600">
                                  {day.lastOut ? fmtTime(day.lastOut.punched_at) : '—'}
                                </span>
                              </>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            {day.hours > 0 && <span className="text-[10px] text-gray-500">{day.hours}h</span>}
                            <span className={'text-[10px] font-bold uppercase ' + statusText}>{day.status}</span>
                          </div>
                        </div>
                        {day.status !== 'Absent' && locationIn && (
                          <div className="flex items-center gap-1 mt-1 ml-14">
                            <span className="text-[10px]">📍</span>
                            <span className="text-[10px] text-gray-500 truncate">{locationIn}</span>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

var MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

function MonthlyView({ mYear, setMYear, mMonth, setMMonth, mRecords, mLoading, mSearch, setMSearch, t, onTapEmployee }) {
  var now = new Date()
  var isCurrentMonth = mYear === now.getFullYear() && mMonth === now.getMonth() + 1

  function prevMonth() {
    if (mMonth === 1) { setMMonth(12); setMYear(mYear - 1) }
    else setMMonth(mMonth - 1)
  }
  function nextMonth() {
    if (isCurrentMonth) return
    if (mMonth === 12) { setMMonth(1); setMYear(mYear + 1) }
    else setMMonth(mMonth + 1)
  }

  var filtered = mRecords.filter(function (r) {
    if (!mSearch) return true
    var q = mSearch.toLowerCase()
    return r.name.toLowerCase().includes(q) || r.emp_code.toLowerCase().includes(q)
  })

  filtered.sort(function (a, b) {
    var pctA = a.effective_days > 0 ? a.days_present / a.effective_days : 0
    var pctB = b.effective_days > 0 ? b.days_present / b.effective_days : 0
    return pctB - pctA
  })

  var totals = { present: 0, half: 0, absent: 0, incomplete: 0, hours: 0 }
  filtered.forEach(function (r) {
    totals.present += r.days_present || 0
    totals.half += r.days_half || 0
    totals.absent += r.days_absent || 0
    totals.incomplete += r.days_incomplete || 0
    totals.hours += r.total_hours || 0
  })

  return (
    <>
      {/* Month nav */}
      <div className="flex items-center gap-2 mb-3">
        <button onClick={prevMonth}
          className="px-2.5 py-1.5 text-sm bg-gray-100 rounded-lg hover:bg-gray-200 active:bg-gray-300">←</button>
        <div className="flex-1 text-center text-sm font-semibold text-gray-700">
          {MONTHS[mMonth - 1]} {mYear}
        </div>
        <button onClick={nextMonth} disabled={isCurrentMonth}
          className="px-2.5 py-1.5 text-sm bg-gray-100 rounded-lg hover:bg-gray-200 active:bg-gray-300 disabled:opacity-30">→</button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-5 gap-1.5 mb-3">
        {[
          { label: 'Staff', value: filtered.length, color: 'text-slate-700' },
          { label: 'Present', value: totals.present, color: 'text-emerald-600' },
          { label: 'Half', value: totals.half, color: 'text-orange-600' },
          { label: 'Absent', value: totals.absent, color: 'text-red-600' },
          { label: 'Hours', value: Math.round(totals.hours * 10) / 10, color: 'text-blue-600' }
        ].map(function (s) {
          return (
            <div key={s.label} className="bg-white border border-gray-200 rounded-lg px-1 py-2 text-center">
              <p className="text-[8px] font-semibold text-gray-400 uppercase">{s.label}</p>
              <p className={'text-lg font-bold ' + s.color}>{s.value}</p>
            </div>
          )
        })}
      </div>

      {/* Search */}
      <input type="text" value={mSearch} onChange={function (e) { setMSearch(e.target.value) }}
        placeholder="Search name or code…"
        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-slate-700" />

      {/* Employee cards */}
      {mLoading ? (
        <p className="text-sm text-gray-400 text-center py-12">{t('loading')}</p>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-8">No records</p>
      ) : (
        <div className="space-y-2">
          {filtered.map(function (r) {
            var pct = r.effective_days > 0 ? Math.round((r.days_present / r.effective_days) * 100) : 0
            var pctColor = pct >= 90 ? 'text-emerald-600' : pct >= 75 ? 'text-amber-600' : 'text-red-600'
            return (
              <div key={r.employee_id} onClick={function () { if (onTapEmployee) onTapEmployee(r) }}
                className="bg-white border border-gray-200 rounded-xl px-4 py-3 cursor-pointer active:scale-[0.99] transition-transform">
                <div className="flex items-center justify-between mb-1.5">
                  <div>
                    <p className="text-sm font-semibold text-gray-900">{r.name}
                      {r.is_casual && <span className="ml-1 text-[9px] text-gray-400 bg-gray-100 px-1 rounded">casual</span>}
                    </p>
                    <p className="text-[11px] text-gray-400">{r.emp_code} · {r.designation || ''}</p>
                  </div>
                  <div className="text-right">
                    <p className={'text-lg font-bold ' + pctColor}>{pct}%</p>
                    <p className="text-[9px] text-gray-400">attendance</p>
                  </div>
                </div>
                <div className="flex gap-3 text-[11px]">
                  <span className="text-emerald-600 font-semibold">{r.days_present || 0}P</span>
                  <span className="text-orange-600 font-semibold">{r.days_half || 0}H</span>
                  <span className="text-red-600 font-semibold">{r.days_absent || 0}A</span>
                  <span className="text-amber-600 font-semibold">{r.days_incomplete || 0}Inc</span>
                  <span className="text-gray-500">{r.total_hours}hrs</span>
                  {r.claims_used > 0 && (
                    <span className={r.claims_over_limit ? 'text-red-600 font-bold' : 'text-purple-600'}>
                      {r.claims_used}/{r.claims_limit}C
                    </span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </>
  )
}