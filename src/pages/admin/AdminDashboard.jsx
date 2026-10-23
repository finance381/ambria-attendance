// AdminDashboard.jsx
// Admin "Overview" tab (/admin). Today at a glance from the admin_overview()
// RPC, refreshed every 3 minutes while the tab is visible.
// Layout: header (date, live status, refresh) → four stat cards → on wide
// screens "Needs attention" as a row of three cards, then two columns: the
// live punch feed on the left (scrolls inside, same height as the right),
// today's present/absent ring + quick links on the right.
// Phones: stat cards stay 2 per row with smaller numbers, attention cards
// stack, the feed and right column run full width one under the other.

import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { fmtTime } from '../../lib/formatters'

export default function AdminDashboard() {
  var [data, setData] = useState(null)
  var [loading, setLoading] = useState(true)
  var [refreshing, setRefreshing] = useState(false)
  var [updatedAt, setUpdatedAt] = useState(null)
  var navigate = useNavigate()

  var loadData = useCallback(async function () {
    var { data: res } = await supabase.rpc('admin_overview')
    if (res && !res.error) {
      setData(res)
      setUpdatedAt(new Date())
    }
    setLoading(false)
  }, [])

  useEffect(function () {
    loadData()
    var interval = setInterval(loadData, 180000)
    function onVis() {
      if (document.visibilityState === 'visible') {
        loadData()
        clearInterval(interval)
        interval = setInterval(loadData, 180000)
      } else {
        clearInterval(interval)
      }
    }
    document.addEventListener('visibilitychange', onVis)
    return function () {
      clearInterval(interval)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [loadData])

  async function refreshNow() {
    setRefreshing(true)
    await loadData()
    setRefreshing(false)
  }

  if (loading) {
    return <p className="text-sm text-gray-400 text-center py-12">Loading…</p>
  }

  if (!data) {
    return <p className="text-sm text-red-500 text-center py-12">Failed to load overview</p>
  }

  var hasIssues = data.pending_claims > 0 || data.open_punches_past > 0 || data.incomplete_today > 0
  var total = data.total_permanent || 0
  var presentPct = total > 0 ? Math.round(data.present_today / total * 100) : 0

  function openUnresolved() {
    var now = new Date()
    var ist = new Date(now.getTime() + (330 * 60000))
    ist.setUTCDate(ist.getUTCDate() - 1)
    var yStr = ist.getUTCFullYear() + '-' + String(ist.getUTCMonth() + 1).padStart(2, '0') + '-' + String(ist.getUTCDate()).padStart(2, '0')
    navigate('/admin/attendance?date=' + yStr + '&status=Incomplete')
  }

  return (
    <div>
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-3 mb-4 sm:mb-6">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-gray-900 tracking-tight">Dashboard</h2>
          <p className="text-sm text-gray-500 mt-0.5">Live overview of today's attendance</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="h-9 px-2.5 sm:px-3 inline-flex items-center gap-2 rounded-lg bg-white ring-1 ring-gray-200 text-[13px] sm:text-sm text-gray-700 whitespace-nowrap">
            <DashIcon name="calendar" className="w-4 h-4 text-gray-400" />
            {new Date().toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
          </span>
          <span className="h-9 px-2.5 sm:px-3 inline-flex items-center gap-2 rounded-lg bg-emerald-50 ring-1 ring-emerald-200 text-[13px] sm:text-sm font-medium text-emerald-700 whitespace-nowrap"
            title="Refreshes every 3 minutes while this tab is open">
            <span className="relative flex w-2 h-2">
              <span className="absolute inline-flex w-full h-full rounded-full bg-emerald-400 opacity-75 animate-ping" />
              <span className="relative inline-flex w-2 h-2 rounded-full bg-emerald-500" />
            </span>
            Live{updatedAt ? ' · ' + updatedAt.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true }).toUpperCase() : ''}
          </span>
          <button onClick={refreshNow} disabled={refreshing} aria-label="Refresh now"
            className="w-9 h-9 inline-flex items-center justify-center rounded-lg bg-white ring-1 ring-gray-200 text-gray-600 hover:text-gray-900 hover:bg-gray-50 disabled:opacity-50">
            <DashIcon name="refresh" className={'w-4 h-4 ' + (refreshing ? 'animate-spin' : '')} />
          </button>
        </div>
      </div>

      {/* Today's numbers */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-4 sm:mb-6">
        <StatCard label="Present Today" value={data.present_today} sub={'of ' + total + ' staff · ' + presentPct + '%'}
          icon="check" tile="bg-emerald-50 text-emerald-600" color="text-emerald-600" progress={presentPct} bar="bg-emerald-500" />
        <StatCard label="Absent Today" value={data.absent_today} sub="no punch recorded"
          icon="x" tile="bg-red-50 text-red-500" color="text-red-600" />
        <StatCard label="Currently In" value={data.currently_in} sub="punched in right now"
          icon="pulse" tile="bg-blue-50 text-blue-600" color="text-blue-600" />
        <StatCard label="Casuals Active" value={data.total_casual} sub="registered casuals"
          icon="hardhat" tile="bg-amber-50 text-amber-600" color="text-amber-600" />
      </div>

      {hasIssues && (
        <section className="mb-5 sm:mb-6">
          <SectionTitle>Needs attention</SectionTitle>
          <div className="grid sm:grid-cols-3 gap-3 sm:gap-4">
            {data.pending_claims > 0 && (
              <ActionCard tone="amber" icon="doc" value={data.pending_claims}
                label={'Pending claim' + (data.pending_claims > 1 ? 's' : '')}
                sub="Missed punch claims to review"
                onClick={function () { navigate('/admin/requests') }} />
            )}
            {data.open_punches_past > 0 && (
              <ActionCard tone="red" icon="alert" value={data.open_punches_past}
                label={'Unresolved punch-in' + (data.open_punches_past > 1 ? 's' : '')}
                sub="Earlier days, no punch-out"
                onClick={openUnresolved} />
            )}
            {data.incomplete_today > 0 && (
              <ActionCard tone="slate" icon="clock" value={data.incomplete_today}
                label="Still punched in"
                sub="Haven't punched out today"
                onClick={function () { navigate('/admin/attendance?status=Incomplete') }} />
            )}
          </div>
        </section>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 sm:gap-6">
        {/* Left: what needs doing + live feed */}
        <div className="lg:col-span-2 relative min-w-0">
          {/* Absolute on lg so the right column sets the row height and the
              feed scrolls inside it instead of stretching the page */}
          <section className="lg:absolute lg:inset-0 flex flex-col">
            <SectionTitle right={data.recent_punches.length > 0 ? data.recent_punches.length + ' latest' : null}>Live feed</SectionTitle>
            {data.recent_punches.length === 0 ? (
              <div className="bg-white rounded-2xl ring-1 ring-gray-200/70 p-8 text-center">
                <p className="text-sm text-gray-400">No punches recorded today yet</p>
              </div>
            ) : (
              <div className="flex-1 min-h-0 bg-white rounded-2xl ring-1 ring-gray-200/70 shadow-sm overflow-hidden flex flex-col">
                <div className="thin-scroll flex-1 min-h-0 divide-y divide-gray-100 max-h-130 lg:max-h-none overflow-y-auto">
                  {data.recent_punches.map(function (p, i) {
                    var isIn = p.punch_type === 'in'
                    var initials = (p.name || '?').trim().split(/\s+/).slice(0, 2).map(function (w) { return w[0] }).join('').toUpperCase()
                    return (
                      <div key={i} className="px-4 sm:px-5 py-3 flex items-center gap-2.5 sm:gap-3.5 hover:bg-gray-50/70">
                        <span className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-slate-100 text-slate-600 text-[11px] sm:text-xs font-bold inline-flex items-center justify-center shrink-0">
                          {initials}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-gray-900 truncate">
                            {p.name}
                            {p.is_proxy && <span className="ml-1.5 text-[10px] font-semibold text-amber-700 bg-amber-50 ring-1 ring-amber-200 px-1.5 py-0.5 rounded align-middle">proxy</span>}
                          </p>
                          {p.venue && (
                            <p className="flex items-center gap-1 text-xs text-gray-500 truncate mt-0.5">
                              <DashIcon name="pin" className="w-3 h-3 shrink-0" />
                              {p.venue}
                            </p>
                          )}
                        </div>
                        <span className={'text-[10px] font-bold px-1.5 sm:px-2 py-0.5 rounded-full shrink-0 ' +
                          (isIn ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200' : 'bg-red-50 text-red-600 ring-1 ring-red-200')}>
                          {isIn ? 'IN' : 'OUT'}
                        </span>
                        <p className="w-16 sm:w-18 text-right text-[13px] sm:text-sm font-medium text-gray-700 tabular-nums shrink-0">{fmtTime(p.punched_at)}</p>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </section>
        </div>

        {/* Right: today at a glance + shortcuts */}
        <div className="space-y-5 sm:space-y-6 min-w-0">
          <section>
            <SectionTitle>Today at a glance</SectionTitle>
            <div className="bg-white rounded-2xl ring-1 ring-gray-200/70 shadow-sm p-4 sm:p-5">
              <div className="flex items-center gap-5">
                <AttendanceRing pct={presentPct} />
                <div className="flex-1 space-y-2.5 text-sm">
                  <Legend dot="bg-emerald-500" label="Present" value={data.present_today} />
                  <Legend dot="bg-red-400" label="Absent" value={data.absent_today} />
                  <Legend dot="bg-blue-500" label="In right now" value={data.currently_in} />
                </div>
              </div>
              <p className="text-xs text-gray-500 mt-4 pt-3 border-t border-gray-100">
                {data.present_today} of {total} permanent staff have punched in today.
              </p>
            </div>
          </section>

          <section>
            <SectionTitle>Shortcuts</SectionTitle>
            <div className="bg-white rounded-2xl ring-1 ring-gray-200/70 shadow-sm divide-y divide-gray-100 overflow-hidden">
              <QuickLink label="Daily Attendance" icon="calendar" tile="bg-blue-50 text-blue-600" onClick={function () { navigate('/admin/attendance?tab=daily') }} />
              <QuickLink label="Monthly Report" icon="chart" tile="bg-violet-50 text-violet-600" onClick={function () { navigate('/admin/attendance?tab=monthly') }} />
              <QuickLink label="Manage Employees" icon="users" tile="bg-emerald-50 text-emerald-600" onClick={function () { navigate('/admin/people?tab=employees') }} />
              <QuickLink label="Manage Venues" icon="pin" tile="bg-amber-50 text-amber-600" onClick={function () { navigate('/admin/config?tab=venues') }} />
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}

function SectionTitle({ children, right }) {
  return (
    <div className="flex items-center justify-between mb-2.5">
      <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider">{children}</h3>
      {right && <span className="text-xs text-gray-400">{right}</span>}
    </div>
  )
}

function StatCard({ label, value, sub, icon, tile, color, progress, bar }) {
  return (
    <div className="bg-white rounded-2xl ring-1 ring-gray-200/70 shadow-sm p-4 sm:p-5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs sm:text-[13px] sm:leading-normal font-medium text-gray-500">{label}</p>
        <span className={'w-8 h-8 sm:w-9 sm:h-9 rounded-xl inline-flex items-center justify-center shrink-0 ' + tile}>
          <DashIcon name={icon} className="w-4.5 h-4.5" />
        </span>
      </div>
      <p className={'text-[26px] sm:text-[32px] font-bold leading-none mt-2 tabular-nums ' + (color || 'text-gray-900')}>{value}</p>
      {progress != null && (
        <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden mt-3">
          <div className={'h-full rounded-full ' + bar} style={{ width: Math.min(100, progress) + '%' }} />
        </div>
      )}
      {sub && <p className="text-xs text-gray-500 mt-2">{sub}</p>}
    </div>
  )
}

var ACTION_TONES = {
  amber: { tile: 'bg-amber-100 text-amber-700', value: 'text-amber-700', bar: 'bg-amber-400' },
  red: { tile: 'bg-red-100 text-red-600', value: 'text-red-600', bar: 'bg-red-500' },
  slate: { tile: 'bg-slate-100 text-slate-600', value: 'text-gray-900', bar: 'bg-slate-400' }
}

function ActionCard({ tone, icon, value, label, sub, onClick }) {
  var c = ACTION_TONES[tone] || ACTION_TONES.slate
  return (
    <button onClick={onClick}
      className="group relative overflow-hidden text-left bg-white rounded-2xl ring-1 ring-gray-200/70 shadow-sm hover:ring-gray-300 hover:shadow-md transition-all p-4 flex items-center gap-3.5">
      <span className={'absolute left-0 top-0 bottom-0 w-1 ' + c.bar} />
      <span className={'w-11 h-11 rounded-xl inline-flex items-center justify-center shrink-0 ' + c.tile}>
        <DashIcon name={icon} className="w-5 h-5" />
      </span>
      <span className="flex-1 min-w-0">
        <span className="flex items-baseline gap-2">
          <span className={'text-2xl font-bold tabular-nums leading-none ' + c.value}>{value}</span>
          <span className="text-sm font-semibold text-gray-800 truncate">{label}</span>
        </span>
        <span className="block text-xs text-gray-500 mt-1 truncate">{sub}</span>
      </span>
      <DashIcon name="arrow" className="w-4 h-4 text-gray-400 shrink-0 transition-transform group-hover:translate-x-0.5 group-hover:text-gray-700" />
    </button>
  )
}

function QuickLink({ label, icon, tile, onClick }) {
  return (
    <button onClick={onClick}
      className="group w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 transition-colors">
      <span className={'w-9 h-9 rounded-xl inline-flex items-center justify-center shrink-0 ' + tile}>
        <DashIcon name={icon} className="w-4.5 h-4.5" />
      </span>
      <span className="flex-1 text-sm font-medium text-gray-800">{label}</span>
      <DashIcon name="chevron" className="w-4 h-4 text-gray-400 group-hover:text-gray-700" />
    </button>
  )
}

function Legend({ dot, label, value }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="flex items-center gap-2 text-gray-600">
        <span className={'w-2.5 h-2.5 rounded-full ' + dot} />
        {label}
      </span>
      <span className="font-semibold text-gray-900 tabular-nums">{value}</span>
    </div>
  )
}

// Present share of permanent staff as a ring
function AttendanceRing({ pct }) {
  var r = 40
  var c = 2 * Math.PI * r
  return (
    <div className="relative w-28 h-28 shrink-0">
      <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
        <circle cx="50" cy="50" r={r} fill="none" stroke="#fee2e2" strokeWidth="10" />
        <circle cx="50" cy="50" r={r} fill="none" stroke="#10b981" strokeWidth="10" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - Math.min(100, pct) / 100)} className="transition-all duration-700" />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-bold text-gray-900 leading-none tabular-nums">{pct}%</span>
        <span className="text-[11px] text-gray-500 mt-1">present</span>
      </div>
    </div>
  )
}

// Line icons for the dashboard (24x24)
function DashIcon({ name, className }) {
  var paths = {
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></>,
    refresh: <><path d="M20 11a8 8 0 0 0-14.9-3.9M4 4v4h4" /><path d="M4 13a8 8 0 0 0 14.9 3.9M20 20v-4h-4" /></>,
    check: <><circle cx="12" cy="12" r="9" /><path d="M8.5 12.5l2.5 2.5 4.5-5" /></>,
    x: <><circle cx="12" cy="12" r="9" /><path d="M9 9l6 6M15 9l-6 6" /></>,
    pulse: <path d="M3 12h4l2.5-6 5 12 2.5-6H21" />,
    hardhat: <><path d="M10 10V5a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v5" /><path d="M14 6a6 6 0 0 1 6 6v3" /><path d="M4 15v-3a6 6 0 0 1 6-6" /><rect x="2" y="15" width="20" height="4" rx="1" /></>,
    doc: <><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" /><path d="M14 3v6h6M9 13h6M9 17h4" /></>,
    alert: <><path d="M12 9v4M12 17h.01" /><path d="M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" /></>,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    arrow: <path d="M5 12h14M13 6l6 6-6 6" />,
    chevron: <path d="M9 6l6 6-6 6" />,
    chart: <path d="M5 20V13M12 20V6M19 20v-9" />,
    users: <><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0" /><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14a6.5 6.5 0 0 1 3.5 6" /></>,
    pin: <><path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z" /><circle cx="12" cy="9.5" r="2.5" /></>
  }
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>
  )
}
