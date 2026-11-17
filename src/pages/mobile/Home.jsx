import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/useAuth'
import { useLanguage } from '../../lib/i18n'
import PunchCapture from '../../components/PunchCapture'
import InstallPrompt from '../../components/InstallPrompt'
import MarkTestsBanner from '../../components/MarkTestsBanner'
import TaskDueBanner from '../../components/TaskDueBanner'
import PocOverdueBanner from '../../components/PocOverdueBanner'
import { useOfflineSyncState, dismissRejected } from '../../lib/offlineSync'
import MiniIcon from '../../components/MiniIcon'

export default function Home() {
  var { employee } = useAuth()
  var [status, setStatus] = useState(null)
  var [punches, setPunches] = useState([])
  var [loading, setLoading] = useState(true)
  // Punches saved on the phone and still being sent (offlineSync.js sends
  // them quietly in the background). They are shown here like any other
  // punch, so a slow network never looks like a missing punch.
  var sync = useOfflineSyncState()

  var loadStatus = useCallback(async function () {
    var [statusRes, punchesRes] = await Promise.all([
      supabase.rpc('my_punch_status'),
      supabase.rpc('my_punches_today')
    ])

    if (statusRes.data) setStatus(statusRes.data)
    if (punchesRes.data) setPunches(punchesRes.data)
    setLoading(false)
  }, [])

  useEffect(function () {
    loadStatus()
  }, [loadStatus])

  var { t } = useLanguage()
  // Refresh the status once queued punches have reached the server
  useEffect(function () {
    window.addEventListener('ambria-punches-synced', loadStatus)
    return function () { window.removeEventListener('ambria-punches-synced', loadStatus) }
  }, [loadStatus])

  function handlePunchComplete() {
    setTimeout(function () { loadStatus() }, 1500)
  }

  if (loading) {
    return <p className="text-sm text-slate-500 text-center py-12">Loading…</p>
  }

  
  // Today's punches = the server's + those still waiting on the phone; the
  // newest waiting punch decides whether the person is in or out
  var todayStr = new Date().toLocaleDateString('en-CA')
  var waiting = sync.items
    .filter(function (q) { return new Date(q.clientTimestamp).toLocaleDateString('en-CA') === todayStr })
    .map(function (q, i) { return { id: 'q' + i, punch_type: q.punchType, punched_at: q.clientTimestamp, nearest_venue: q.areaName } })
  var allPunches = punches.concat(waiting).sort(function (a, b) { return new Date(a.punched_at) - new Date(b.punched_at) })
  var lastWaiting = sync.items[sync.items.length - 1]
  var isPunchedIn = lastWaiting ? lastWaiting.punchType === 'in' : (status && status.is_punched_in)
  var punchType = isPunchedIn ? 'out' : 'in'

  return (
    <div>
      {/* Greeting */}
      <h2 className="text-[26px] font-bold text-slate-900 tracking-tight leading-tight">
        {t('home_greeting')}, {employee.name.split(' ')[0]}
      </h2>
      <p className="text-sm text-slate-500 mt-1 mb-5">
        {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
      </p>
      <InstallPrompt />
      <TaskDueBanner />
      <PocOverdueBanner />
      <MarkTestsBanner />
      {/* Punches the server refused after they were sent from the phone */}
      {sync.rejected.map(function (r, i) {
        var when = new Date(r.clientTimestamp)
        var whenText = when.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) + ', ' +
          when.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true }).toUpperCase()
        return (
          <div key={i} className="rounded-2xl px-4 py-3 mb-4 border bg-red-50 border-red-200">
            <p className="flex items-center gap-1.5 text-sm font-semibold text-red-800">
              <MiniIcon name="alert" className="w-4 h-4 shrink-0" />
              {(r.punchType === 'in' ? t('home_punch_in') : t('home_punch_out')) + ' · ' + whenText + ' — ' + t('sync_rejected_title')}
            </p>
            <p className="text-[11px] text-red-700 mt-0.5">{r.reason}</p>
            <div className="flex items-center gap-2 mt-2">
              <Link to="/claims" className="text-xs font-semibold text-white bg-red-600 px-3 py-1.5 rounded-lg no-underline">{t('sync_rejected_claim')}</Link>
              <button onClick={function () { dismissRejected(i) }} className="text-xs font-semibold text-red-700 bg-red-100 px-3 py-1.5 rounded-lg">{t('sync_rejected_dismiss')}</button>
            </div>
          </div>
        )
      })}

      {status && status.has_stale_punch && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 mb-4">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-amber-800"><MiniIcon name="alert" className="w-4 h-4 shrink-0" />{t('home_stale_title')}</p>
          <p className="text-[11px] text-amber-600 mt-0.5">{t('home_stale_desc')}</p>
        </div>
      )}

      {/* Today's punches */}
      {allPunches.length > 0 && (
        <div className="mb-5">
          <div className="flex items-center justify-between mb-2.5">
            <h3 className="flex items-center gap-2 text-base font-bold text-gray-900">
              {t('home_today_punches')}
              <span className="min-w-6 h-6 px-1.5 rounded-full neu-inset text-xs font-semibold text-gray-700 inline-flex items-center justify-center">{allPunches.length}</span>
            </h3>
            <Link to="/attendance" className="inline-flex items-center gap-0.5 text-sm font-medium text-blue-600 no-underline">
              {t('home_view_all')}
              <HomeIcon name="chevron" className="w-4 h-4" />
            </Link>
          </div>
          <div className="space-y-2.5">
            {allPunches.map(function (p) {
              var isIn = p.punch_type === 'in'
              return (
                <div key={p.id} className={'px-4 py-3 flex items-center gap-3 rounded-2xl neu'}>
                  <span className={'w-11 h-11 rounded-full neu-sm inline-flex items-center justify-center shrink-0 ' +
                    (isIn ? 'text-emerald-600' : 'text-red-500')}>
                    <HomeIcon name={isIn ? 'login' : 'logout'} className="w-5 h-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[15px] font-semibold text-gray-900">
                      {isIn ? t('home_punch_in') : t('home_punch_out')}
                    </p>
                    {p.nearest_venue && (
                      <p className="flex items-center gap-1 text-xs text-gray-500 mt-0.5">
                        <HomeIcon name="pin" className="w-3 h-3 shrink-0" />
                        <span className="truncate">{p.nearest_venue}</span>
                      </p>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <span className={'text-[10px] font-bold px-2 py-0.5 rounded-full ' +
                      (isIn ? 'bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200/80' : 'bg-red-50 text-red-600 ring-1 ring-inset ring-red-200/80')}>
                      {isIn ? 'IN' : 'OUT'}
                    </span>
                    <p className="text-sm font-semibold text-gray-800 tabular-nums">{formatTime(p.punched_at)}</p>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Punch button */}
      <div>
        <PunchCapture
          punchType={punchType}
          onComplete={handlePunchComplete}
        />
      </div>
    </div>
  )
}

function formatTime(isoString) {
  if (!isoString) return '—'
  var d = new Date(isoString)
  return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true }).toUpperCase()
}

// Small line icons for the Home cards (24x24).
function HomeIcon({ name, className }) {
  var paths = {
    pin: <><path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z" /><circle cx="12" cy="9.5" r="2.5" /></>,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    chevron: <path d="M9 6l6 6-6 6" />,
    login: <><path d="M10 17l5-5-5-5M15 12H3" /><path d="M14 3h5a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-5" /></>,
    logout: <><path d="M14 17l5-5-5-5M19 12H8" /><path d="M10 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h5" /></>
  }
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>
  )
}

