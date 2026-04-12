import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../../lib/useAuth'
import { supabase } from '../../lib/supabase'
import { useLanguage } from '../../lib/i18n'

export default function Settings() {
  var { employee, changePassword, logout } = useAuth()
  var [showChangePw, setShowChangePw] = useState(false)
  var [currentPw, setCurrentPw] = useState('')
  var [newPw, setNewPw] = useState('')
  var [confirmPw, setConfirmPw] = useState('')
  var [error, setError] = useState('')
  var [success, setSuccess] = useState('')
  var [saving, setSaving] = useState(false)

  async function handleChangePassword(e) {
    e.preventDefault()
    setError('')
    setSuccess('')

    if (newPw.length < 6) return setError(t('settings_pw_err_length'))
    if (newPw !== confirmPw) return setError(t('settings_pw_err_match'))

    setSaving(true)
    var result = await changePassword(newPw)
    setSaving(false)

    if (result.error) {
      setError(result.error.message)
      return
    }

    setSuccess(t('settings_pw_success'))
    setCurrentPw('')
    setNewPw('')
    setConfirmPw('')
    setTimeout(function () { setShowChangePw(false); setSuccess('') }, 1500)
  }

  var isAdminOrManager = employee.role === 'admin' || employee.role === 'manager'

  var { t } = useLanguage()

  return (
    <div>
      <h2 className="text-lg font-bold text-gray-900 mb-5">{t('settings_title')}</h2>

      {/* Profile info */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 mb-4">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-12 h-12 bg-slate-800 rounded-full flex items-center justify-center">
            <span className="text-white text-lg font-bold">{employee.name.charAt(0)}</span>
          </div>
          <div>
            <p className="text-sm font-bold text-gray-900">{employee.name}</p>
            <p className="text-xs text-gray-500">{employee.designation || employee.role}</p>
          </div>
        </div>
        <div className="space-y-2 text-xs">
          <div className="flex justify-between">
            <span className="text-gray-400">{t('settings_emp_code')}</span>
            <span className="text-gray-700 font-mono">{employee.emp_code}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">{t('settings_phone')}</span>
            <span className="text-gray-700">{employee.phone || '—'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">{t('settings_role')}</span>
            <span className="text-gray-700 capitalize">{employee.role}</span>
          </div>
        </div>
      </div>
      {/* Leave balance */}
      <LeaveBalance />

      {/* Half day balance */}
      <HalfDayBalance />

      {/* Notifications & Reminders */}
      <NotificationSettings employeeId={employee.id} />

      {/* Change password */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden mb-4">
        <button
          onClick={function () { setShowChangePw(!showChangePw); setError(''); setSuccess('') }}
          className="w-full px-4 py-3 flex items-center justify-between text-sm text-gray-700 hover:bg-gray-50 transition-colors"
        >
          <span className="font-medium">🔒 {t('settings_change_pw')}</span>
          <span className="text-gray-400">{showChangePw ? '▲' : '▼'}</span>
        </button>

        {showChangePw && (
          <form onSubmit={handleChangePassword} className="px-4 pb-4 space-y-3 border-t border-gray-100 pt-3">
            <div>
              <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1">{t('settings_new_pw')}</label>
              <input
                type="password"
                value={newPw}
                onChange={function (e) { setNewPw(e.target.value) }}
                placeholder={t('settings_pw_placeholder')}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-700"
              />
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1">{t('settings_confirm_pw')}</label>
              <input
                type="password"
                value={confirmPw}
                onChange={function (e) { setConfirmPw(e.target.value) }}
                placeholder={t('settings_pw_confirm_placeholder')}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-700"
              />
            </div>

            {error && <p className="text-xs text-red-600">{error}</p>}
            {success && <p className="text-xs text-emerald-600">{success}</p>}

            <button
              type="submit"
              disabled={saving}
              className="w-full py-2 text-sm text-white bg-slate-800 rounded-lg hover:bg-slate-900 disabled:opacity-40 transition-colors font-medium"
            >
              {saving ? t('saving') : t('settings_pw_update')}
            </button>
          </form>
        )}
      </div>

      {/* Admin dashboard link */}
      {isAdminOrManager && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden mb-4">
          <button
            onClick={function () {
              window.open(window.location.origin + '/ambria-attendance/admin', '_blank')
            }}
            className="w-full px-4 py-3 flex items-center justify-between text-sm text-gray-700 hover:bg-gray-50 transition-colors"
          >
            <span className="font-medium">🖥️ {t('settings_admin_link')}</span>
            <span className="text-xs text-gray-400">{t('settings_admin_hint')}</span>
          </button>
        </div>
      )}

      {/* Sign out */}
      <button
        onClick={function () { logout() }}
        className="w-full py-3 text-sm text-red-600 bg-white border border-gray-200 rounded-xl hover:bg-red-50 transition-colors font-medium"
      >
        {t('settings_signout')}
      </button>
    </div>
  )
}
function LeaveBalance() {
  var { t } = useLanguage()
  var [data, setData] = useState(null)
  var [loading, setLoading] = useState(true)
  var [err, setErr] = useState('')

  useEffect(function () {
    supabase.rpc('my_leave_balance').then(function (res) {
      if (res.error) {
        setErr(res.error.message)
      } else if (res.data && res.data.error) {
        setErr(res.data.error)
      } else {
        setData(res.data)
      }
      setLoading(false)
    })
  }, [])

  if (loading) return null
  if (err) return (
    <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-4">
      <p className="text-xs text-red-600">{t('settings_leave_error')}: {err}</p>
    </div>
  )
  if (!data) return null

  var pct = data.annual_leaves > 0
    ? Math.round((data.leaves_remaining / data.annual_leaves) * 100)
    : 0
  var barColor = pct > 40 ? 'bg-emerald-500' : pct > 15 ? 'bg-amber-500' : 'bg-red-500'
  var fyLabel = data.fy_start.slice(0, 4) + '–' + data.fy_end.slice(0, 4)

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 mb-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-bold text-gray-900">{t('settings_leave_balance')}</p>
        <span className="text-[10px] text-gray-400 font-medium">{t('settings_fy')} {fyLabel}</span>
      </div>
      <div className="flex items-end justify-between mb-2">
        <div>
          <span className="text-2xl font-bold text-gray-900">{data.leaves_remaining}</span>
          <span className="text-sm text-gray-400 ml-1">/ {data.annual_leaves}</span>
        </div>
        <span className="text-xs text-gray-500">{data.leaves_used} {t('settings_used')}</span>
      </div>
      <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
        <div className={'h-full rounded-full transition-all ' + barColor} style={{ width: pct + '%' }} />
      </div>

      {data.quarter_label && (
        <div className="mt-3 pt-3 border-t border-gray-100">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold text-gray-700">{data.quarter_label} {t('settings_quarterly') || 'Quarterly'}</p>
            <span className="text-[10px] text-gray-400">
              {new Date(data.quarter_start).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
              {' – '}
              {new Date(data.quarter_end).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
            </span>
          </div>
          <div className="flex items-end justify-between mb-2">
            <div>
              <span className="text-lg font-bold text-gray-900">{data.quarter_remaining}</span>
              <span className="text-xs text-gray-400 ml-1">/ {data.quarter_total}</span>
            </div>
            <span className="text-[10px] text-gray-500">{data.quarter_used} {t('settings_used')}</span>
          </div>
          <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div className={'h-full rounded-full transition-all ' + (
              data.quarter_remaining / data.quarter_total > 0.4 ? 'bg-blue-500' :
              data.quarter_remaining / data.quarter_total > 0.15 ? 'bg-amber-500' : 'bg-red-500'
            )} style={{ width: Math.round((data.quarter_remaining / data.quarter_total) * 100) + '%' }} />
          </div>
        </div>
      )}

    </div>
    
  )
}

function HalfDayBalance() {
  var { t } = useLanguage()
  var [data, setData] = useState(null)
  var [loading, setLoading] = useState(true)

  useEffect(function () {
    supabase.rpc('my_half_day_balance').then(function (res) {
      if (!res.error && res.data && !res.data.error) setData(res.data)
      setLoading(false)
    })
  }, [])

  if (loading || !data) return null

  var pct = data.annual_half_days > 0
    ? Math.round((data.half_days_remaining / data.annual_half_days) * 100)
    : 0
  var barColor = pct > 40 ? 'bg-orange-400' : pct > 15 ? 'bg-amber-500' : 'bg-red-500'
  var fyLabel = data.fy_start.slice(0, 4) + '–' + data.fy_end.slice(0, 4)

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 mb-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-bold text-gray-900">{t('settings_halfday_balance') || 'Half Day Balance'}</p>
        <span className="text-[10px] text-gray-400 font-medium">{t('settings_fy')} {fyLabel}</span>
      </div>
      <div className="flex items-end justify-between mb-2">
        <div>
          <span className="text-2xl font-bold text-gray-900">{data.half_days_remaining}</span>
          <span className="text-sm text-gray-400 ml-1">/ {data.annual_half_days}</span>
        </div>
        <span className="text-xs text-gray-500">{data.half_days_used} {t('settings_used')}</span>
      </div>
      <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
        <div className={'h-full rounded-full transition-all ' + barColor} style={{ width: pct + '%' }} />
      </div>
    </div>
  )
}

function NotificationSettings({ employeeId }) {
  var { t } = useLanguage()
  var [supported, setSupported] = useState(false)
  var [subscribed, setSubscribed] = useState(false)
  var [loading, setLoading] = useState(true)
  var [saving, setSaving] = useState(false)
  var [punchInTime, setPunchInTime] = useState('')
  var [punchOutTime, setPunchOutTime] = useState('')
  var [remindersEnabled, setRemindersEnabled] = useState(true)
  var [toast, setToast] = useState('')

  var showToast = useCallback(function (msg) {
    setToast(msg)
    setTimeout(function () { setToast('') }, 2500)
  }, [])

  useEffect(function () {
    var isSupported = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
    setSupported(isSupported)

    if (!isSupported) { setLoading(false); return }

    // Check existing subscription — browser first, DB fallback
    navigator.serviceWorker.ready.then(function (reg) {
      return reg.pushManager.getSubscription()
    }).then(function (sub) {
      if (sub) {
        setSubscribed(true)
        setLoading(false)
      } else {
        // Browser lost local state — check DB as fallback
        supabase
          .from('push_subscriptions')
          .select('id')
          .eq('employee_id', employeeId)
          .limit(1)
          .then(function (res) {
            setSubscribed(res.data && res.data.length > 0)
            setLoading(false)
          })
      }
    }).catch(function () {
      // SW not ready — check DB
      supabase
        .from('push_subscriptions')
        .select('id')
        .eq('employee_id', employeeId)
        .limit(1)
        .then(function (res) {
          setSubscribed(res.data && res.data.length > 0)
          setLoading(false)
        })
    })

    // Load reminder preferences
    supabase
      .from('reminder_preferences')
      .select('*')
      .eq('employee_id', employeeId)
      .maybeSingle()
      .then(function (res) {
        if (res.data) {
          setPunchInTime(res.data.punch_in_time ? res.data.punch_in_time.slice(0, 5) : '')
          setPunchOutTime(res.data.punch_out_time ? res.data.punch_out_time.slice(0, 5) : '')
          setRemindersEnabled(res.data.enabled !== false)
        }
      })
  }, [employeeId])

  async function handleSubscribe() {
    setSaving(true)
    try {
      var permission = await Notification.requestPermission()
      if (permission !== 'granted') {
        showToast('Notification permission denied')
        setSaving(false)
        return
      }

      var reg = await navigator.serviceWorker.ready
      var sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(import.meta.env.VITE_VAPID_PUBLIC_KEY)
      })

      var subJson = sub.toJSON()

      await supabase.from('push_subscriptions').upsert({
        employee_id: employeeId,
        endpoint: subJson.endpoint,
        p256dh: subJson.keys.p256dh,
        auth: subJson.keys.auth
      }, { onConflict: 'employee_id,endpoint' })

      setSubscribed(true)
      showToast('Notifications enabled')
    } catch (err) {
      showToast('Failed: ' + err.message)
    }
    setSaving(false)
  }

  async function handleUnsubscribe() {
    setSaving(true)
    try {
      var reg = await navigator.serviceWorker.ready
      var sub = await reg.pushManager.getSubscription()
      if (sub) {
        await sub.unsubscribe()
        await supabase
          .from('push_subscriptions')
          .delete()
          .eq('employee_id', employeeId)
          .eq('endpoint', sub.endpoint)
      }
      setSubscribed(false)
      showToast('Notifications disabled')
    } catch (err) {
      showToast('Failed: ' + err.message)
    }
    setSaving(false)
  }

  async function handleSaveReminders() {
    setSaving(true)
    var { error } = await supabase
      .from('reminder_preferences')
      .upsert({
        employee_id: employeeId,
        punch_in_time: punchInTime ? punchInTime + ':00' : null,
        punch_out_time: punchOutTime ? punchOutTime + ':00' : null,
        enabled: remindersEnabled,
        updated_at: new Date().toISOString()
      }, { onConflict: 'employee_id' })

    setSaving(false)
    if (error) {
      showToast('Save failed: ' + error.message)
    } else {
      showToast('Reminders saved')
    }
  }

  if (!supported) return null

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden mb-4">
      <div className="px-4 py-3 border-b border-gray-100">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-gray-900">🔔 {t('settings_notif_title')}</p>
            <p className="text-[10px] text-gray-400">{t('settings_notif_desc')}</p>
          </div>
          {loading ? (
            <span className="text-[10px] text-gray-400">{t('settings_notif_checking')}</span>
          ) : subscribed ? (
            <button onClick={handleUnsubscribe} disabled={saving}
              className="px-3 py-1.5 text-[11px] font-semibold text-red-600 bg-red-50 rounded-lg hover:bg-red-100 transition-colors disabled:opacity-40">
              {saving ? t('saving') : t('settings_notif_off')}
            </button>
          ) : (
            <button onClick={handleSubscribe} disabled={saving}
              className="px-3 py-1.5 text-[11px] font-semibold text-white bg-slate-800 rounded-lg hover:bg-slate-900 transition-colors disabled:opacity-40">
              {saving ? t('saving') : t('settings_notif_enable')}
            </button>
          )}
        </div>
      </div>

      {subscribed && (
        <div className="px-4 py-3 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-gray-700">{t('settings_reminders')}</p>
            <button
              onClick={function () { setRemindersEnabled(!remindersEnabled) }}
              className={'w-10 h-5 rounded-full transition-colors relative ' +
                (remindersEnabled ? 'bg-emerald-500' : 'bg-gray-300')}
            >
              <div className={'w-4 h-4 bg-white rounded-full absolute top-0.5 transition-transform shadow-sm ' +
                (remindersEnabled ? 'translate-x-5' : 'translate-x-0.5')} />
            </button>
          </div>

          {remindersEnabled && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1">
                    {t('settings_reminder_in')}
                  </label>
                  <input
                    type="time"
                    value={punchInTime}
                    onChange={function (e) { setPunchInTime(e.target.value) }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-700"
                  />
                  <p className="text-[10px] text-gray-400 mt-0.5">e.g. 09:00</p>
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1">
                    {t('settings_reminder_out')}
                  </label>
                  <input
                    type="time"
                    value={punchOutTime}
                    onChange={function (e) { setPunchOutTime(e.target.value) }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-700"
                  />
                  <p className="text-[10px] text-gray-400 mt-0.5">e.g. 18:00</p>
                </div>
              </div>

              <button
                onClick={handleSaveReminders}
                disabled={saving}
                className="w-full py-2 text-sm font-medium text-white bg-slate-800 rounded-lg hover:bg-slate-900 disabled:opacity-40 transition-colors"
              >
                {saving ? t('saving') : t('settings_save_reminders')}
              </button>
            </>
          )}

          <p className="text-[10px] text-gray-400">
            {t('settings_notif_also')}
          </p>
        </div>
      )}

      {toast && (
        <div className="px-4 py-2 bg-slate-800 text-white text-xs text-center">
          {toast}
        </div>
      )}
    </div>
  )
}

function urlBase64ToUint8Array(base64String) {
  var padding = '='.repeat((4 - base64String.length % 4) % 4)
  var base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  var rawData = window.atob(base64)
  var outputArray = new Uint8Array(rawData.length)
  for (var i = 0; i < rawData.length; i++) {
    outputArray[i] = rawData.charCodeAt(i)
  }
  return outputArray
}