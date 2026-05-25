import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
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
  var [view, setView] = useState('daily')
  var [mYear, setMYear] = useState(new Date().getFullYear())
  var [mMonth, setMMonth] = useState(new Date().getMonth() + 1)
  var [mRecords, setMRecords] = useState([])
  var [mLoading, setMLoading] = useState(false)
  var [mSearch, setMSearch] = useState('')

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

  var loadMonthly = useCallback(async function () {
    setMLoading(true)
    var { data } = await supabase.rpc('monthly_summary', {
      p_year: mYear,
      p_month: mMonth,
      p_department_id: employee.role === 'admin' ? null : employee.department_id
    })
    setMRecords(data || [])
    setMLoading(false)
  }, [mYear, mMonth, employee.department_id])

  useEffect(function () {
    if (view === 'monthly') loadMonthly()
  }, [view, loadMonthly])

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
      </div>

      {view === 'monthly' && <MonthlyView
        mYear={mYear} setMYear={setMYear} mMonth={mMonth} setMMonth={setMMonth}
        mRecords={mRecords} mLoading={mLoading} mSearch={mSearch} setMSearch={setMSearch} t={t}
      />}

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
    </div>
  )
}

var MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

function MonthlyView({ mYear, setMYear, mMonth, setMMonth, mRecords, mLoading, mSearch, setMSearch, t }) {
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
              <div key={r.employee_id} className="bg-white border border-gray-200 rounded-xl px-4 py-3">
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

function fmtTime(iso) {
  if (!iso) return '—'
  var d = new Date(iso)
  var h = d.getHours(), m = d.getMinutes()
  var ampm = h >= 12 ? 'PM' : 'AM'
  h = h % 12 || 12
  return h + ':' + String(m).padStart(2, '0') + ' ' + ampm
}