import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/useAuth'
import { useLanguage } from '../../lib/i18n'
import PunchCapture from '../../components/PunchCapture'
import InstallPrompt from '../../components/InstallPrompt'
import { getPendingPunches, removePunch } from '../../lib/offlineQueue'

export default function Home() {
  var { employee } = useAuth()
  var [status, setStatus] = useState(null)
  var [punches, setPunches] = useState([])
  var [loading, setLoading] = useState(true)
  var [pendingCount, setPendingCount] = useState(0)
  var [syncing, setSyncing] = useState(false)
  var [syncError, setSyncError] = useState('')

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
    var pending = await getPendingPunches()
    setPendingCount(pending.length)
    if (pending.length === 0 || syncing) return

    setSyncing(true)
    for (var i = 0; i < pending.length; i++) {
      var p = pending[i]
      try {
        // Upload selfie
        var { data: { user } } = await supabase.auth.getUser()
        if (!user) break

        var filePath = user.id + '/' + p.clientTimestamp.slice(0, 10) + '_' + p.punchType + '_' + Date.now() + '.jpg'
        var { error: upErr } = await supabase.storage
          .from('selfies')
          .upload(filePath, p.selfieBlob, { contentType: 'image/jpeg', upsert: false })

        if (upErr) continue

        // Call punch RPC with client timestamp
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

        if (!rpcErr && (!result || !result.error)) {
          await removePunch(p.id)
        }
      } catch (e) {
        // Skip this punch, retry next time
      }
    }
    setSyncing(false)
    var remaining = await getPendingPunches()
    setPendingCount(remaining.length)
    if (remaining.length === 0) {
      loadStatus()
    } else if (navigator.onLine) {
      // Some punches failed to sync even though we're online — likely duplicates or expired
      setSyncError(remaining.length + ' punch' + (remaining.length > 1 ? 'es' : '') + ' failed to sync — may be duplicates')
    }
  }, [syncing, loadStatus])
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
    return <p className="text-sm text-gray-400 text-center py-12">Loading…</p>
  }

  
  var isPunchedIn = status && status.is_punched_in
  var punchType = isPunchedIn ? 'out' : 'in'

  return (
    <div>
      {/* Greeting */}
      <h2 className="text-lg font-bold text-gray-900 mb-0.5">
        {t('home_greeting')}, {employee.name.split(' ')[0]}
      </h2>
      <p className="text-xs text-gray-400 mb-5">
        {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}
      </p>
      <InstallPrompt />
      {pendingCount > 0 && (
        <div className={'rounded-2xl px-4 py-3 mb-4 border ' + (syncing ? 'bg-blue-50 border-blue-200' : 'bg-amber-50 border-amber-200')}>
          <div className="flex items-center justify-between">
            <div>
              <p className={'text-sm font-semibold ' + (syncing ? 'text-blue-800' : 'text-amber-800')}>
                {syncing ? '⟳ Syncing...' : '📶 ' + pendingCount + ' punch' + (pendingCount > 1 ? 'es' : '') + ' waiting'}
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
          <p className="text-sm font-semibold text-amber-800">⚠️ {t('home_stale_title')}</p>
          <p className="text-[11px] text-amber-600 mt-0.5">{t('home_stale_desc')}</p>
        </div>
      )}

      {/* Status card */}
      <div className={'rounded-2xl px-5 py-4 mb-5 border ' + (isPunchedIn
        ? 'bg-emerald-50 border-emerald-200'
        : 'bg-gray-50 border-gray-200'
      )}>
        <div className="flex items-center justify-between mb-1">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{t('home_status')}</p>
          {status && status.sessions_today > 0 && (
            <p className="text-[10px] text-gray-400">
              {status.sessions_today} {status.sessions_today > 1 ? t('home_sessions_plural') : t('home_sessions')}
            </p>
          )}
        </div>
        <div className="flex items-center justify-between">
          <p className={'text-base font-bold ' + (isPunchedIn ? 'text-emerald-700' : 'text-gray-500')}>
            {isPunchedIn ? '🟢 ' + t('home_punched_in') : '⚪ ' + t('home_not_punched_in')}
          </p>
          {status && status.last_in && (
            <div className="text-right">
              <p className="text-[10px] text-gray-400">{t('home_since')}</p>
              <p className="text-sm font-mono text-gray-700">{formatTime(status.last_in)}</p>
            </div>
          )}
        </div>
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
          <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">{t('home_today_punches')}</h3>
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <div className="divide-y divide-gray-100">
              {punches.map(function (p) {
                return (
                  <div key={p.id} className="px-4 py-3 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={'w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold ' +
                        (p.punch_type === 'in'
                          ? 'bg-emerald-100 text-emerald-700'
                          : 'bg-red-100 text-red-600')
                      }>
                        {p.punch_type === 'in' ? 'IN' : 'OUT'}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-800">
                          {p.punch_type === 'in' ? t('home_punch_in') : t('home_punch_out')}
                        </p>
                        <p className="text-[11px] text-gray-400">{p.nearest_venue || ''}</p>
                      </div>
                    </div>
                    <p className="text-sm font-mono text-gray-600">
                      {formatTime(p.punched_at)}
                    </p>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function formatTime(isoString) {
  if (!isoString) return '—'
  var d = new Date(isoString)
  return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })
}