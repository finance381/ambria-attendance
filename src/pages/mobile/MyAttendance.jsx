import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../../lib/supabase'
import { useLanguage } from '../../lib/i18n'

var STATUS_COLORS = {
  Present: 'bg-emerald-500',
  'Half Day': 'bg-orange-400',
  Absent: 'bg-red-400',
  Incomplete: 'bg-amber-400',
}

// Filled day cells when a status is picked from the stat cards / legend
var STATUS_HILITE = {
  Present: 'bg-emerald-100 text-emerald-800 ring-1 ring-inset ring-emerald-300',
  'Half Day': 'bg-orange-100 text-orange-800 ring-1 ring-inset ring-orange-300',
  Absent: 'bg-red-100 text-red-700 ring-1 ring-inset ring-red-300',
  Incomplete: 'bg-amber-100 text-amber-800 ring-1 ring-inset ring-amber-300',
}

var STATUS_DOT_COLORS = {
  Present: 'text-emerald-600',
  'Half Day': 'text-orange-500',
  Absent: 'text-red-500',
  Incomplete: 'text-amber-500'
}

// Months already built this session ("<user>:2026-10" -> day map), so reopening
// the tab or a month shows the calendar at once while it refreshes.
var monthCache = {}

export default function MyAttendance() {
  var now = new Date()
  var [year, setYear] = useState(now.getFullYear())
  var [month, setMonth] = useState(now.getMonth() + 1)
  var [days, setDays] = useState({})
  var [loading, setLoading] = useState(true)
  var [selectedDay, setSelectedDay] = useState(null)
  // Status picked on a stat card: those days are filled in, the
  // rest fade. Tap the same one again to show everything.
  var [filter, setFilter] = useState(null)
  function toggleFilter(status) { setFilter(filter === status ? null : status) }

  // Only the latest request may update the screen (fast month switching)
  var requestId = useRef(0)

  var loadMonth = useCallback(async function () {
    var myRequest = ++requestId.current
    setSelectedDay(null)
    setFilter(null)

    // The saved login on the phone (no network round trip, unlike getUser)
    var { data: { session } } = await supabase.auth.getSession()
    if (!session) { setLoading(false); return }
    var userId = session.user.id

    // Cached per person, so a different login on the same phone never sees it
    var cacheKey = userId + ':' + year + '-' + month
    if (monthCache[cacheKey]) {
      setDays(monthCache[cacheKey])
      setLoading(false)
    } else {
      setLoading(true)
    }

    var startDate = year + '-' + String(month).padStart(2, '0') + '-01'
    var endDay = new Date(year, month, 0).getDate()
    var endDate = year + '-' + String(month).padStart(2, '0') + '-' + String(endDay).padStart(2, '0')

    // Everything the calendar needs, fetched in parallel (these used to run
    // one after another, so a slow network added up six waits)
    var results = await Promise.all([
      supabase
        .from('punches')
        .select('attendance_date, punch_type, punched_at, nearest_venue_id')
        .eq('employee_id', userId)
        .gte('attendance_date', startDate)
        .lte('attendance_date', endDate)
        .order('punched_at'),
      supabase
        .from('attendance_overrides')
        .select('attendance_date, override_type, override_value')
        .eq('employee_id', userId)
        .gte('attendance_date', startDate)
        .lte('attendance_date', endDate),
      supabase.from('app_config').select('value').eq('key', 'half_day_threshold_hours').maybeSingle(),
      supabase.from('app_config').select('value').eq('key', 'absent_threshold_hours').maybeSingle(),
      supabase.from('employees').select('date_of_joining').eq('id', userId).maybeSingle()
    ])
    // A newer month was opened meanwhile: drop this result
    if (myRequest !== requestId.current) return

    var punches = results[0].data
    var overrides = results[1].data
    var halfConfig = results[2].data
    var absentConfig = results[3].data
    var empData = results[4].data
    var halfThreshold = halfConfig ? parseFloat(halfConfig.value) : 4
    var absentThreshold = absentConfig ? parseFloat(absentConfig.value) : 0.5

    // Build day map
    var dayMap = {}

    // Group punches by date
    ;(punches || []).forEach(function (p) {
      if (!dayMap[p.attendance_date]) {
        dayMap[p.attendance_date] = { punches: [], overrideStatus: null }
      }
      dayMap[p.attendance_date].punches.push(p)
    })

    // Apply overrides
    ;(overrides || []).forEach(function (o) {
      if (!dayMap[o.attendance_date]) {
        dayMap[o.attendance_date] = { punches: [], overrideStatus: null }
      }
      if (o.override_type === 'status' || o.override_type === 'full_day_override') {
        var val = o.override_value
        if (val === 'P') dayMap[o.attendance_date].overrideStatus = 'Present'
        else if (val === 'A') dayMap[o.attendance_date].overrideStatus = 'Absent'
        else if (val === 'H') dayMap[o.attendance_date].overrideStatus = 'Half Day'
      }
    })

    // Derive status per day
    var today = new Date().toISOString().slice(0, 10)

    Object.keys(dayMap).forEach(function (date) {
      var d = dayMap[date]
      if (d.overrideStatus) {
        d.status = d.overrideStatus
        return
      }

      var ins = d.punches.filter(function (p) { return p.punch_type === 'in' })
      var outs = d.punches.filter(function (p) { return p.punch_type === 'out' })

      if (ins.length === 0) {
        d.status = 'Absent'
        return
      }

      // Pair and calculate hours
      var totalHours = 0
      var hasIncomplete = false
      for (var i = 0; i < ins.length; i++) {
        if (i < outs.length) {
          var diff = (new Date(outs[i].punched_at) - new Date(ins[i].punched_at)) / 3600000
          totalHours += diff
        } else {
          hasIncomplete = true
        }
      }

      d.totalHours = Math.round(totalHours * 10) / 10
      d.sessions = ins.length

      if (hasIncomplete) {
        d.status = 'Incomplete'
      } else if (totalHours >= halfThreshold) {
        d.status = 'Present'
      } else if (totalHours >= absentThreshold) {
        d.status = 'Half Day'
      } else {
        d.status = 'Absent'
      }
    })

    // Fill absent for past working days with no punches
    var joiningDate = empData && empData.date_of_joining ? empData.date_of_joining : null

    for (var day = 1; day <= endDay; day++) {
      var dateStr = year + '-' + String(month).padStart(2, '0') + '-' + String(day).padStart(2, '0')
      if (!dayMap[dateStr] && dateStr <= today) {
        if (joiningDate && dateStr < joiningDate) continue
        dayMap[dateStr] = { punches: [], status: 'Absent', totalHours: 0, sessions: 0 }
      }
    }

    // Keep the cached copy unless this load failed (punches query errored)
    if (!results[0].error) monthCache[cacheKey] = dayMap
    setDays(dayMap)
    setLoading(false)
  }, [year, month])

  useEffect(function () { loadMonth() }, [loadMonth])

  // Calendar grid
  var firstDayOfWeek = new Date(year, month - 1, 1).getDay()
  var daysInMonth = new Date(year, month, 0).getDate()
  var todayStr = new Date().toISOString().slice(0, 10)

  var calendarCells = []
  for (var i = 0; i < firstDayOfWeek; i++) {
    calendarCells.push(null)
  }
  for (var d = 1; d <= daysInMonth; d++) {
    calendarCells.push(d)
  }

  // Stats
  var stats = { Present: 0, 'Half Day': 0, Absent: 0, Incomplete: 0, hours: 0 }
  Object.values(days).forEach(function (d) {
    if (d.status && stats[d.status] !== undefined) stats[d.status]++
    stats.hours += d.totalHours || 0
  })

  function prevMonth() {
    if (month === 1) { setYear(year - 1); setMonth(12) }
    else setMonth(month - 1)
  }

  function nextMonth() {
    var nowY = new Date().getFullYear()
    var nowM = new Date().getMonth() + 1
    if (year === nowY && month >= nowM) return
    if (month === 12) { setYear(year + 1); setMonth(1) }
    else setMonth(month + 1)
  }

  var { t } = useLanguage()

  var MONTH_NAMES_T = [t('month_1'),t('month_2'),t('month_3'),t('month_4'),t('month_5'),t('month_6'),t('month_7'),t('month_8'),t('month_9'),t('month_10'),t('month_11'),t('month_12')]
  var DAY_NAMES_T = [t('day_su'),t('day_mo'),t('day_tu'),t('day_we'),t('day_th'),t('day_fr'),t('day_sa')]

  return (
    <div>
      <h2 className="text-[22px] font-bold text-slate-900 tracking-tight leading-tight mb-4">{t('attendance_title')}</h2>

      {/* Month/Year picker */}
      <div className="flex items-center justify-between mb-4">
        <button onClick={prevMonth} aria-label="Previous month"
          className="w-10 h-10 flex items-center justify-center rounded-xl neu-press text-gray-700">
          <AttIcon name="left" className="w-5 h-5" />
        </button>
        <p className="text-lg font-bold text-slate-800">{MONTH_NAMES_T[month - 1]} {year}</p>
        <button onClick={nextMonth} aria-label="Next month"
          className="w-10 h-10 flex items-center justify-center rounded-xl neu-press text-gray-700">
          <AttIcon name="right" className="w-5 h-5" />
        </button>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 min-[370px]:grid-cols-4 gap-2 mb-4">
        <MiniStat label={t('attendance_present')} value={stats.Present} color="text-emerald-600"
          active={filter === 'Present'} onClick={function () { toggleFilter('Present') }} />
        <MiniStat label={t('attendance_half_day')} value={stats['Half Day']} color="text-orange-500"
          active={filter === 'Half Day'} onClick={function () { toggleFilter('Half Day') }} />
        <MiniStat label={t('attendance_absent')} value={stats.Absent} color="text-red-500"
          active={filter === 'Absent'} onClick={function () { toggleFilter('Absent') }} />
        <MiniStat label={t('attendance_hours')} value={Math.round(stats.hours * 10) / 10} color="text-gray-900" />
      </div>

      {loading ? (
        <p className="text-sm text-slate-500 text-center py-8">{t('loading')}</p>
      ) : (
        <>
          {/* Calendar grid */}
          <div className="neu rounded-2xl px-3 pt-4 pb-3 mb-4">
            {/* Day headers */}
            <div className="grid grid-cols-7 gap-1 mb-2">
              {DAY_NAMES_T.map(function (d) {
                return <div key={d} className="text-center text-[11px] font-semibold text-gray-500 uppercase">{d}</div>
              })}
            </div>

            {/* Date cells */}
            <div className="grid grid-cols-7 gap-1">
              {calendarCells.map(function (day, idx) {
                if (day === null) {
                  return <div key={'e' + idx} className="h-12" />
                }

                var dateStr = year + '-' + String(month).padStart(2, '0') + '-' + String(day).padStart(2, '0')
                var dayData = days[dateStr]
                var status = dayData ? dayData.status : null
                var isToday = dateStr === todayStr
                var isFuture = dateStr > todayStr
                var isSelected = selectedDay === dateStr
                var dotColor = status ? (STATUS_COLORS[status] || '') : ''
                var matches = filter && status === filter
                var faded = filter && !matches

                return (
                  <button
                    key={day}
                    onClick={function () {
                      if (!isFuture && dayData) setSelectedDay(isSelected ? null : dateStr)
                    }}
                    className={'h-12 rounded-xl flex flex-col items-center justify-center gap-1 transition-all ' +
                      (isFuture ? 'text-gray-400 cursor-default' + (filter ? ' opacity-40' : '') :
                       matches ? STATUS_HILITE[status] + (isSelected ? ' outline-2 outline-blue-500' : '') :
                       faded ? 'text-gray-800 opacity-25' :
                       isSelected ? 'neu-on text-blue-600' :
                       isToday ? 'neu-sm text-blue-600' :
                       'text-gray-800 hover:bg-white/40')
                    }
                  >
                    <span className={'text-sm ' + (isSelected || isToday || matches ? 'font-bold' : 'font-medium')}>{day}</span>
                    <span className={'w-1.5 h-1.5 rounded-full ' + (dotColor || 'bg-transparent')} />
                  </button>
                )
              })}
            </div>

            {filter && (
              <p className="text-center text-[11px] text-slate-500 mt-2">{t('attendance_filter_hint')}</p>
            )}

            {/* Legend */}
            <div className="flex flex-wrap justify-center gap-x-4 gap-y-1.5 mt-3 pt-3 border-t border-slate-300/50">
              {[
                { key: 'Present', label: t('attendance_present') },
                { key: 'Half Day', label: t('attendance_half_day') },
                { key: 'Absent', label: t('attendance_absent') },
                { key: 'Incomplete', label: t('attendance_incomplete') }
              ].map(function (s) {
                return (
                  <div key={s.key} className="flex items-center gap-1.5">
                    <div className={'w-2.5 h-2.5 rounded-full ' + (STATUS_COLORS[s.key] || 'bg-gray-300')} />
                    <span className="text-xs text-gray-600">{s.label}</span>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Selected day detail */}
          {selectedDay && days[selectedDay] && (
            <div className="neu rounded-2xl p-4">
              <div className="flex items-center justify-between gap-3 mb-2">
                <p className="text-base font-bold text-gray-900">
                  {new Date(selectedDay + 'T00:00').toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}
                </p>
                <span className={'text-[11px] font-bold uppercase tracking-wide px-2.5 py-1 rounded-lg shrink-0 ' +
                  (STATUS_PILL[days[selectedDay].status] || 'bg-gray-100 text-gray-600')}>
                  {days[selectedDay].status}
                </span>
              </div>

              {days[selectedDay].totalHours > 0 && (
                <p className="text-sm text-gray-500 mb-3">
                  {days[selectedDay].sessions} {days[selectedDay].sessions > 1 ? t('attendance_sessions_plural') : t('attendance_sessions')} · {days[selectedDay].totalHours} {t('attendance_hours')}
                </p>
              )}

              {days[selectedDay].punches.length > 0 ? (
                <div className="space-y-2">
                  {days[selectedDay].punches.map(function (p, i) {
                    var isIn = p.punch_type === 'in'
                    return (
                      <div key={i} className="flex items-center justify-between neu-inset rounded-xl px-3 py-2.5">
                        <span className={'text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ' +
                          (isIn ? 'bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200/80' : 'bg-red-50 text-red-600 ring-1 ring-inset ring-red-200/80')}>
                          {isIn ? 'IN' : 'OUT'}
                        </span>
                        <span className="text-sm font-semibold text-gray-800 tabular-nums">{formatTime(p.punched_at)}</span>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <p className="text-sm text-gray-500">{t('attendance_no_punches')}</p>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}

// A stat card; with onClick it's a toggle that fills in matching days on
// the calendar (pressed in while active)
function MiniStat({ label, value, color, active, onClick }) {
  var Tag = onClick ? 'button' : 'div'
  return (
    <Tag onClick={onClick} aria-pressed={onClick ? !!active : undefined}
      className={'min-w-0 rounded-2xl px-1.5 py-3 text-center transition-all ' + (active ? 'neu-on' : onClick ? 'neu-press' : 'neu')}>
      <p className={'text-[11px] truncate ' + (active ? 'font-semibold text-gray-800' : 'font-medium text-gray-500')}>{label}</p>
      {/* Longer numbers (e.g. 147.3 hours) drop a size so they always fit
          whole; the fixed height keeps every card the same height */}
      <p className={'h-8 mt-1 flex items-center justify-center font-bold tabular-nums whitespace-nowrap tracking-tight ' +
        (String(value).length > 3 ? 'text-lg' : 'text-2xl') + ' ' + (color || 'text-gray-900')}>{value}</p>
    </Tag>
  )
}

// Light pill colours for the selected day status
var STATUS_PILL = {
  Present: 'bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200/80',
  'Half Day': 'bg-orange-50 text-orange-600 ring-1 ring-inset ring-orange-200/80',
  Absent: 'bg-red-50 text-red-600 ring-1 ring-inset ring-red-200/80',
  Incomplete: 'bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200/80'
}

function AttIcon({ name, className }) {
  var paths = { left: <path d="M15 18l-6-6 6-6" />, right: <path d="M9 6l6 6-6 6" /> }
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>
  )
}

function formatTime(isoString) {
  if (!isoString) return '—'
  var d = new Date(isoString)
  return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' }).toUpperCase()
}