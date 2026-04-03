import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/useAuth'
import { useLanguage } from '../../lib/i18n'
import PunchCapture from '../../components/PunchCapture'
import InstallPrompt from '../../components/InstallPrompt'

export default function Home() {
  var { employee } = useAuth()
  var [status, setStatus] = useState(null)
  var [punches, setPunches] = useState([])
  var [loading, setLoading] = useState(true)

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

  function handlePunchComplete() {
    setTimeout(function () { loadStatus() }, 1500)
  }

  if (loading) {
    return <p className="text-sm text-gray-400 text-center py-12">Loading…</p>
  }

  var { t } = useLanguage()
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