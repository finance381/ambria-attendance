import { useState, useEffect, useCallback, useRef } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/useAuth'
import { useLanguage } from '../../lib/i18n'
import PunchCapture from '../../components/PunchCapture'
import InstallPrompt from '../../components/InstallPrompt'
import MarkTestsBanner from '../../components/MarkTestsBanner'
import TaskDueBanner from '../../components/TaskDueBanner'
import PocOverdueBanner from '../../components/PocOverdueBanner'
import { getPendingPunches, removePunch } from '../../lib/offlineQueue'
import MiniIcon from '../../components/MiniIcon'

export default function Home() {
  var { employee } = useAuth()
  var [status, setStatus] = useState(null)
  var [punches, setPunches] = useState([])
  var [loading, setLoading] = useState(true)
  var [pendingCount, setPendingCount] = useState(0)
  var [syncing, setSyncing] = useState(false)
  var [syncError, setSyncError] = useState('')
  var syncingRef = useRef(false)

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

  var syncOfflinePunches = useCallback(async function () {
    // Atomic guard — prevents concurrent runs even across re-renders
    if (syncingRef.current) return
    syncingRef.current = true

    try {
      var pending = await getPendingPunches()
      setPendingCount(pending.length)
      if (pending.length === 0) {
        return
      }

      setSyncing(true)
      setSyncError('')

      for (var i = 0; i < pending.length; i++) {
        var p = pending[i]
        try {
          var { data: { user } } = await supabase.auth.getUser()
          if (!user) break

          var filePath = user.id + '/' + p.clientTimestamp.slice(0, 10) + '_' + p.punchType + '_' + Date.now() + '.jpg'
          var { error: upErr } = await supabase.storage
            .from('selfies')
            .upload(filePath, p.selfieBlob, { contentType: 'image/jpeg', upsert: false })

          if (upErr) {
            // Storage upload failed — could be network. Skip, retry next cycle.
            continue
          }

          var { data: result, error: rpcErr } = await supabase.rpc('punch', {
            p_punch_type: p.punchType,
            p_selfie_path: filePath,
            p_latitude: p.latitude,
            p_longitude: p.longitude,
            p_gps_accuracy: p.gpsAccuracy,
            p_device_info: p.deviceInfo,
            p_client_timestamp: p.clientTimestamp,
            p_client_punch_id: p.clientPunchId
          })

          if (rpcErr) {
            // Network / infrastructure error — keep in queue for retry
            console.warn('Offline punch RPC network error, will retry:', rpcErr)
            continue
          }

          // Success OR server-side rejection (duplicate / already punched / stale)
          // Either way, remove — retrying will not fix a server rejection
          if (result && result.error) {
            console.warn('Offline punch rejected by server, removing from queue:', result.error)
          }
          await removePunch(p.id)
        } catch (e) {
          console.warn('Offline punch sync exception, will retry:', e)
        }
      }

      var remaining = await getPendingPunches()
      setPendingCount(remaining.length)
      if (remaining.length === 0) {
        loadStatus()
      } else if (navigator.onLine) {
        setSyncError(remaining.length + ' punch' + (remaining.length > 1 ? 'es' : '') + ' failed to sync — check network and retry')
      }
    } finally {
      syncingRef.current = false
      setSyncing(false)
    }
  }, [loadStatus])
  var { t } = useLanguage()
  // Sync on mount + when coming back online
  useEffect(function () {
    syncOfflinePunches()
    window.addEventListener('online', syncOfflinePunches)
    function onSWMessage(e) { if (e.data && e.data.type === 'sync-punches') syncOfflinePunches() }
    navigator.serviceWorker && navigator.serviceWorker.addEventListener('message', onSWMessage)
    return function () {
      window.removeEventListener('online', syncOfflinePunches)
      navigator.serviceWorker && navigator.serviceWorker.removeEventListener('message', onSWMessage)
    }
  }, [syncOfflinePunches])

  function handlePunchComplete() {
    setTimeout(function () { loadStatus() }, 1500)
  }

  if (loading) {
    return <p className="text-sm text-slate-500 text-center py-12">Loading…</p>
  }

  
  var isPunchedIn = status && status.is_punched_in
  var punchType = isPunchedIn ? 'out' : 'in'
  // Venue of the latest punch-in today, shown under "Punched In"
  var lastInVenue = null
  punches.forEach(function (p) { if (p.punch_type === 'in' && p.nearest_venue) lastInVenue = p.nearest_venue })

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
      {pendingCount > 0 && (
        <div className={'rounded-2xl px-4 py-3 mb-4 border ' + (syncing ? 'bg-blue-50 border-blue-200' : 'bg-amber-50 border-amber-200')}>
          <div className="flex items-center justify-between">
            <div>
              <p className={'flex items-center gap-1.5 text-sm font-semibold ' + (syncing ? 'text-blue-800' : 'text-amber-800')}>
                <MiniIcon name={syncing ? 'sync' : 'offline'} className={'w-4 h-4 shrink-0' + (syncing ? ' animate-spin' : '')} />
                {syncing ? 'Syncing...' : pendingCount + ' punch' + (pendingCount > 1 ? 'es' : '') + ' waiting'}
              </p>
              <p className={'text-[11px] mt-0.5 ' + (syncing ? 'text-blue-600' : 'text-amber-600')}>
                {syncing ? 'Uploading offline punches' : 'Will sync when back online'}
              </p>
            </div>
            {!syncing && navigator.onLine && (
              <button onClick={syncOfflinePunches} className="text-xs font-semibold text-amber-700 bg-amber-100 px-3 py-1.5 rounded-lg">
                Sync now
              </button>
            )}
          </div>
        </div>
      )}
      
      {syncError && (
        <div className="rounded-2xl px-4 py-3 mb-4 border bg-red-50 border-red-200">
          <div className="flex items-center justify-between">
            <p className="text-sm text-red-700">{syncError}</p>
            <button onClick={async function () {
              var all = await getPendingPunches()
              for (var i = 0; i < all.length; i++) { await removePunch(all[i].id) }
              setPendingCount(0)
              setSyncError('')
            }} className="text-xs font-semibold text-red-600 bg-red-100 px-3 py-1.5 rounded-lg">
              Clear queue
            </button>
          </div>
        </div>
      )}
      {status && status.has_stale_punch && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 mb-4">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-amber-800"><MiniIcon name="alert" className="w-4 h-4 shrink-0" />{t('home_stale_title')}</p>
          <p className="text-[11px] text-amber-600 mt-0.5">{t('home_stale_desc')}</p>
        </div>
      )}

      {/* Status card: status on the left, since-when on the right */}
      <div className="neu rounded-2xl mb-4 flex">
        <div className="flex-1 min-w-0 px-4 py-4">
          <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">{t('home_current_status')}</p>
          <div className="flex items-center gap-2.5 mt-2.5">
            <span className={'w-6 h-6 rounded-full shrink-0 ring-4 ' +
              (isPunchedIn ? 'bg-emerald-500 ring-emerald-100' : 'bg-gray-300 ring-gray-100')} />
            <p className={'text-[22px] font-bold leading-tight ' + (isPunchedIn ? 'text-emerald-600' : 'text-gray-500')}>
              {isPunchedIn ? t('home_punched_in') : t('home_not_punched_in')}
            </p>
          </div>
          {isPunchedIn && lastInVenue && (
            <p className="flex items-center gap-1 text-[13px] text-gray-600 mt-2 pl-0.5">
              <HomeIcon name="pin" className="w-3.5 h-3.5 text-gray-500 shrink-0" />
              <span className="truncate">{lastInVenue}</span>
            </p>
          )}
        </div>
        {status && status.last_in && (
          <div className="shrink-0 px-4 py-4 border-l border-slate-300/60 flex flex-col justify-center">
            <p className="flex items-center gap-1.5 text-[13px] text-gray-600">
              <HomeIcon name="clock" className="w-4 h-4 text-gray-700" />
              {t('home_since')}
            </p>
            <p className="text-[22px] font-bold text-gray-900 leading-tight tabular-nums mt-1.5">{formatTime(status.last_in)}</p>
            {status.sessions_today > 0 && (
              <p className="text-xs text-gray-500 mt-0.5">
                {status.sessions_today} {status.sessions_today > 1 ? t('home_sessions_plural') : t('home_sessions')} {t('home_today_word')}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Punch button */}
      <div className="mb-6">
        <PunchCapture
          punchType={punchType}
          onComplete={handlePunchComplete}
        />
      </div>

      {/* Today's punches */}
      {punches.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-2.5">
            <h3 className="flex items-center gap-2 text-base font-bold text-gray-900">
              {t('home_today_punches')}
              <span className="min-w-6 h-6 px-1.5 rounded-full neu-inset text-xs font-semibold text-gray-700 inline-flex items-center justify-center">{punches.length}</span>
            </h3>
            <Link to="/attendance" className="inline-flex items-center gap-0.5 text-sm font-medium text-blue-600 no-underline">
              {t('home_view_all')}
              <HomeIcon name="chevron" className="w-4 h-4" />
            </Link>
          </div>
          <div className="space-y-2.5">
            {punches.map(function (p) {
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

