import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { useLanguage } from '../../lib/i18n'

var STATUS_COLORS = {
  Present: 'bg-emerald-500',
  'Half Day': 'bg-orange-400',
  Absent: 'bg-red-400',
  Incomplete: 'bg-amber-400',
}

var STATUS_DOT_COLORS = {
  Present: 'text-emerald-600',
  'Half Day': 'text-orange-500',
  Absent: 'text-red-500',
  Incomplete: 'text-amber-500'
}

export default function MyAttendance() {
  var now = new Date()
  var [year, setYear] = useState(now.getFullYear())
  var [month, setMonth] = useState(now.getMonth() + 1)
  var [days, setDays] = useState({})
  var [loading, setLoading] = useState(true)
  var [selectedDay, setSelectedDay] = useState(null)

  var loadMonth = useCallback(async function () {
    setLoading(true)
    setSelectedDay(null)

    var startDate = year + '-' + String(month).padStart(2, '0') + '-01'
    var endDay = new Date(year, month, 0).getDate()
    var endDate = year + '-' + String(month).padStart(2, '0') + '-' + String(endDay).padStart(2, '0')

    // Get user once
    var { data: { user } } = await supabase.auth.getUser()
    var userId = user.id

    // Get all my punches for this month
    var { data: punches } = await supabase
      .from('punches')
      .select('attendance_date, punch_type, punched_at, nearest_venue_id')
      .eq('employee_id', userId)
      .gte('attendance_date', startDate)
      .lte('attendance_date', endDate)
      .order('punched_at')

    // Get overrides
    var { data: overrides } = await supabase
      .from('attendance_overrides')
      .select('attendance_date, override_type, override_value')
      .eq('employee_id', userId)
      .gte('attendance_date', startDate)
      .lte('attendance_date', endDate)

    // Get config
    var { data: halfConfig } = await supabase
      .from('app_config')
      .select('value')
      .eq('key', 'half_day_threshold_hours')
      .maybeSingle()

    var halfThreshold = halfConfig ? parseFloat(halfConfig.value) : 4

    var { data: absentConfig } = await supabase
      .from('app_config')
      .select('value')
      .eq('key', 'absent_threshold_hours')
      .maybeSingle()

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
    var { data: empData } = await supabase
      .from('employees')
      .select('date_of_joining')
      .eq('id', userId)
      .maybeSingle()

    var joiningDate = empData && empData.date_of_joining ? empData.date_of_joining : null

    for (var day = 1; day <= endDay; day++) {
      var dateStr = year + '-' + String(month).padStart(2, '0') + '-' + String(day).padStart(2, '0')
      if (!dayMap[dateStr] && dateStr <= today) {
        if (joiningDate && dateStr < joiningDate) continue
        dayMap[dateStr] = { punches: [], status: 'Absent', totalHours: 0, sessions: 0 }
      }
    }

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
      <h2 className="text-lg font-bold text-gray-900 mb-4">{t('attendance_title')}</h2>

      {/* Month/Year picker */}
      <div className="flex items-center justify-between mb-4">
        <button onClick={prevMonth} className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-500 text-lg">←</button>
        <p className="text-sm font-bold text-gray-800">{MONTH_NAMES_T[month - 1]} {year}</p>
        <button onClick={nextMonth} className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-500 text-lg">→</button>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-4 gap-2 mb-4">
        <MiniStat label={t('attendance_present')} value={stats.Present} color="text-emerald-600" />
        <MiniStat label={t('attendance_half')} value={stats['Half Day']} color="text-orange-500" />
        <MiniStat label={t('attendance_absent')} value={stats.Absent} color="text-red-500" />
        <MiniStat label={t('attendance_hours')} value={Math.round(stats.hours * 10) / 10} color="text-slate-700" />
      </div>

      {loading ? (
        <p className="text-sm text-gray-400 text-center py-8">{t('loading')}</p>
      ) : (
        <>
          {/* Calendar grid */}
          <div className="bg-white border border-gray-200 rounded-xl p-3 mb-4">
            {/* Day headers */}
            <div className="grid grid-cols-7 gap-1 mb-1">
              {DAY_NAMES_T.map(function (d) {
                return <div key={d} className="text-center text-[10px] font-bold text-gray-400 uppercase">{d}</div>
              })}
            </div>

            {/* Date cells */}
            <div className="grid grid-cols-7 gap-1">
              {calendarCells.map(function (day, idx) {
                if (day === null) {
                  return <div key={'e' + idx} className="h-10" />
                }

                var dateStr = year + '-' + String(month).padStart(2, '0') + '-' + String(day).padStart(2, '0')
                var dayData = days[dateStr]
                var status = dayData ? dayData.status : null
                var isToday = dateStr === todayStr
                var isFuture = dateStr > todayStr
                var isSelected = selectedDay === dateStr
                var dotColor = status ? (STATUS_COLORS[status] || '') : ''

                return (
                  <button
                    key={day}
                    onClick={function () {
                      if (!isFuture && dayData) setSelectedDay(isSelected ? null : dateStr)
                    }}
                    className={'h-10 rounded-lg flex flex-col items-center justify-center relative transition-colors ' +
                      (isFuture ? 'text-gray-300 cursor-default' :
                       isSelected ? 'bg-slate-800 text-white' :
                       isToday ? 'bg-slate-100 font-bold' :
                       'hover:bg-gray-50')
                    }
                  >
                    <span className="text-xs">{day}</span>
                    {dotColor && !isSelected && (
                      <div className={'w-1.5 h-1.5 rounded-full absolute bottom-1 ' + dotColor} />
                    )}
                  </button>
                )
              })}
            </div>

            {/* Legend */}
            <div className="flex flex-wrap gap-3 mt-3 pt-2 border-t border-gray-100">
              {[
                { key: 'Present', label: t('attendance_present') },
                { key: 'Half Day', label: t('attendance_half_day') },
                { key: 'Absent', label: t('attendance_absent') },
                { key: 'Incomplete', label: t('attendance_incomplete') }
              ].map(function (s) {
                return (
                  <div key={s.key} className="flex items-center gap-1">
                    <div className={'w-2 h-2 rounded-full ' + (STATUS_COLORS[s.key] || 'bg-gray-300')} />
                    <span className="text-[10px] text-gray-500">{s.label}</span>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Selected day detail */}
          {selectedDay && days[selectedDay] && (
            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-bold text-gray-800">
                  {new Date(selectedDay + 'T00:00').toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}
                </p>
                <span className={'text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ' +
                  (STATUS_DOT_COLORS[days[selectedDay].status] || 'text-gray-500') + ' ' +
                  (STATUS_COLORS[days[selectedDay].status] ? STATUS_COLORS[days[selectedDay].status].replace('bg-', 'bg-opacity-20 bg-') : 'bg-gray-100')
                }>
                  {days[selectedDay].status}
                </span>
              </div>

              {days[selectedDay].totalHours > 0 && (
                <p className="text-xs text-gray-500 mb-2">
                  {days[selectedDay].sessions} {days[selectedDay].sessions > 1 ? t('attendance_sessions_plural') : t('attendance_sessions')} · {days[selectedDay].totalHours} {t('attendance_hours')}
                </p>
              )}

              {days[selectedDay].punches.length > 0 ? (
                <div className="space-y-1.5">
                  {days[selectedDay].punches.map(function (p, i) {
                    return (
                      <div key={i} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2">
                        <div className="flex items-center gap-2">
                          <span className={'text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ' +
                            (p.punch_type === 'in' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-600')}>
                            {p.punch_type}
                          </span>
                        </div>
                        <span className="text-xs font-mono text-gray-600">{formatTime(p.punched_at)}</span>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <p className="text-xs text-gray-400 italic">{t('attendance_no_punches')}</p>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}

function MiniStat({ label, value, color }) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg px-3 py-2 text-center">
      <p className="text-[9px] font-semibold text-gray-400 uppercase">{label}</p>
      <p className={'text-lg font-bold ' + (color || 'text-gray-900')}>{value}</p>
    </div>
  )
}

function formatTime(isoString) {
  if (!isoString) return '—'
  var d = new Date(isoString)
  return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' })
}