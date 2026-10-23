import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../../lib/useAuth'
import { supabase } from '../../lib/supabase'
import { useLanguage } from '../../lib/i18n'

export default function Settings() {
  var { employee, changePassword, logout } = useAuth()
  var [showChangePw, setShowChangePw] = useState(false)
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
    setNewPw('')
    setConfirmPw('')
    setTimeout(function () { setShowChangePw(false); setSuccess('') }, 1500)
  }

  var isAdminOrManager = employee.role === 'admin' || employee.role === 'manager'

  var { t } = useLanguage()

  return (
    <div>
      <h2 className="text-[22px] font-bold text-slate-900 tracking-tight leading-tight mb-4">{t('settings_title')}</h2>

      {/* Profile */}
      <div className={CARD + ' overflow-hidden mb-4'}>
        <div className="px-4 pt-4 pb-3.5 flex items-center gap-3.5">
          <div className="w-14 h-14 rounded-full bg-gradient-to-br from-blue-500 to-blue-700 text-white text-xl font-bold flex items-center justify-center shrink-0 shadow-lg shadow-blue-700/35">
            {employee.name.charAt(0)}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-lg font-bold text-gray-900 truncate leading-tight">{employee.name}</p>
            <p className="text-sm text-gray-500 truncate mt-0.5">{employee.designation || employee.role}</p>
          </div>
          <span className="shrink-0 text-[11px] font-semibold capitalize px-2.5 py-1 rounded-full neu-inset text-blue-700">
            {employee.role}
          </span>
        </div>
        <div className="grid grid-cols-2 border-t border-slate-300/50 divide-x divide-slate-300/50">
          <InfoCell icon="id" label={t('settings_emp_code')} value={employee.emp_code} />
          <InfoCell icon="phone" label={t('settings_phone')} value={employee.phone || '—'} />
        </div>
      </div>

      {/* Leave balance */}
      <LeaveBalance />

      {/* Notifications & Reminders */}
      <NotificationSettings employeeId={employee.id} />

      {/* Account */}
      <div className={CARD + ' overflow-hidden mb-4 divide-y divide-slate-300/50'}>
        <div>
          <SettingsRow icon="lock" tone="neu-sm text-violet-600" label={t('settings_change_pw')}
            open={showChangePw}
            onClick={function () { setShowChangePw(!showChangePw); setError(''); setSuccess('') }} />

          {showChangePw && (
            <form onSubmit={handleChangePassword} className="px-4 pb-4 pt-1 space-y-3">
              <div>
                <label className={LABEL}>{t('settings_new_pw')}</label>
                <input
                  type="password"
                  value={newPw}
                  onChange={function (e) { setNewPw(e.target.value) }}
                  placeholder={t('settings_pw_placeholder')}
                  className={INPUT}
                />
              </div>
              <div>
                <label className={LABEL}>{t('settings_confirm_pw')}</label>
                <input
                  type="password"
                  value={confirmPw}
                  onChange={function (e) { setConfirmPw(e.target.value) }}
                  placeholder={t('settings_pw_confirm_placeholder')}
                  className={INPUT}
                />
              </div>

              {error && <p className="text-xs text-red-600">{error}</p>}
              {success && <p className="text-xs text-emerald-600">{success}</p>}

              <button
                type="submit"
                disabled={saving}
                className="w-full h-11 text-sm font-semibold text-white bg-blue-600 rounded-xl shadow-md shadow-blue-600/30 hover:bg-blue-700 disabled:opacity-40 transition-colors"
              >
                {saving ? t('saving') : t('settings_pw_update')}
              </button>
            </form>
          )}
        </div>

        {isAdminOrManager && (
          <SettingsRow icon="monitor" tone="neu-sm text-sky-600" label={t('settings_admin_link')}
            hint={t('settings_admin_hint')} external
            onClick={function () {
              window.open(window.location.origin + '/ambria-attendance/admin', '_blank')
            }} />
        )}
      </div>

      {/* Sign out */}
      <button
        onClick={function () { logout() }}
        className={CARD + ' neu-press w-full h-12 inline-flex items-center justify-center gap-2 text-[15px] font-semibold text-red-600'}
      >
        <SIcon name="logout" className="w-[18px] h-[18px]" />
        {t('settings_signout')}
      </button>
    </div>
  )
}

// Shared look for the Settings cards and form fields
// Raised neumorphic card / pressed-in input (see .neu, .neu-inset in index.css)
var CARD = 'neu rounded-2xl'
var LABEL = 'block text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5'
var INPUT = 'w-full h-11 px-3 border-0 neu-inset rounded-xl text-base text-gray-900 outline-none focus:outline-2 focus:outline-blue-400/60'

// One label + value cell of the profile card
function InfoCell({ icon, label, value }) {
  return (
    <div className="px-4 py-3 flex items-center gap-2.5 min-w-0">
      <SIcon name={icon} className="w-4 h-4 text-slate-500 shrink-0" />
      <div className="min-w-0">
        <p className="text-[11px] text-gray-500">{label}</p>
        <p className="text-sm font-semibold text-gray-900 truncate tabular-nums">{value}</p>
      </div>
    </div>
  )
}

// A tappable settings row: icon tile, label (+ hint), chevron
function SettingsRow({ icon, tone, label, hint, open, external, onClick }) {
  return (
    <button onClick={onClick} className="w-full px-4 py-3.5 flex items-center gap-3 text-left active:bg-white/40 transition-colors">
      <span className={'w-9 h-9 rounded-xl inline-flex items-center justify-center shrink-0 ' + tone}>
        <SIcon name={icon} className="w-[18px] h-[18px]" />
      </span>
      <span className="flex-1 min-w-0">
        <span className="block text-[15px] font-medium text-gray-900">{label}</span>
        {hint && <span className="block text-xs text-gray-500 truncate">{hint}</span>}
      </span>
      <SIcon name={external ? 'external' : 'chevron'}
        className={'w-4 h-4 text-slate-500 shrink-0 transition-transform ' + (open ? 'rotate-90' : '')} />
    </button>
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

  var isMonthly = data.leave_scheme === 'monthly_cap'
  var isNewJoiner = data.leave_scheme === 'new_joiner'
  var effectiveTotal = data.annual_leaves + (data.continue_credits_earned || 0)
  var pct = effectiveTotal > 0
    ? Math.max(0, Math.round((data.leaves_remaining / effectiveTotal) * 100))
    : 0
  var barColor = pct > 40 ? 'bg-emerald-500' : pct > 15 ? 'bg-amber-500' : 'bg-red-500'
  var fyLabel = data.fy_start.slice(0, 4) + '–' + data.fy_end.slice(0, 4)

  var total = data.annual_leaves + (data.continue_credits_earned || 0)
  var ringColor = pct > 40 ? '#10b981' : pct > 15 ? '#f59e0b' : '#ef4444'
  var showQuarter = !isMonthly && data.quarter_label && data.quarter_total > 0
  var showHalf = !isMonthly && data.half_annual_total > 0

  return (
    <div className={CARD + ' p-4 mb-4'}>
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2.5">
          <span className="w-9 h-9 rounded-xl neu-sm text-emerald-600 inline-flex items-center justify-center">
            <SIcon name="calendar" className="w-[18px] h-[18px]" />
          </span>
          <p className="text-base font-bold text-gray-900">{t('settings_leave_balance')}</p>
        </div>
        <span className="text-[11px] font-semibold text-slate-600 neu-inset px-2 py-1 rounded-lg">{t('settings_fy')} {fyLabel}</span>
      </div>

      {isMonthly && (
        <p className="mb-3 px-3 py-2 bg-indigo-50 rounded-xl text-[11px] font-semibold text-indigo-700">
          Monthly Cap: {data.monthly_cap}/month × {data.months_elapsed} months{data.bonus_days > 0 ? ' + ' + data.bonus_days + ' bonus' : ''} = {data.annual_leaves} total
        </p>
      )}

      {isNewJoiner && (
        <p className="mb-3 px-3 py-2 bg-teal-50 rounded-xl text-[11px] font-semibold text-teal-700">
          Prorated (joined {new Date(data.date_of_joining).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}) · {data.annual_leaves} leaves this year
        </p>
      )}

      {(data.continue_credits_earned || 0) > 0 && (
        <div className="mb-3 px-3 py-2 bg-teal-50 rounded-xl flex items-center justify-between">
          <p className="text-[11px] font-semibold text-teal-700">Continue Credits: +{data.continue_credits_earned}</p>
          <p className="text-[11px] text-teal-600">Base {data.annual_leaves} + {data.continue_credits_earned} = {total}</p>
        </div>
      )}

      {/* Remaining as a ring, with used / total beside it */}
      <div className="flex items-center gap-5">
        <Ring pct={pct} color={ringColor}>
          <span className="text-[26px] font-bold text-gray-900 leading-none tabular-nums">{data.leaves_remaining}</span>
          <span className="text-[11px] text-gray-500 mt-1">{t('settings_leaves_left')}</span>
        </Ring>
        <div className="flex-1 space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-500">{t('settings_total')}</span>
            <span className="text-base font-bold text-gray-900 tabular-nums">{total}</span>
          </div>
          <div className="h-px bg-slate-300/50" />
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-500">{t('settings_used_label')}</span>
            <span className="text-base font-bold text-gray-900 tabular-nums">{data.leaves_used}</span>
          </div>
        </div>
      </div>

      {(showQuarter || showHalf) && (
        <div className={'grid gap-2.5 mt-4 ' + (showQuarter && showHalf ? 'grid-cols-2' : 'grid-cols-1')}>
          {showQuarter && (
            <MiniBalance
              title={data.quarter_label + ' ' + (t('settings_quarterly') || 'Quarterly')}
              sub={new Date(data.quarter_start).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) + ' – ' +
                new Date(data.quarter_end).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
              left={data.quarter_remaining} total={data.quarter_total} used={data.quarter_used}
              bar="bg-blue-500" t={t} />
          )}
          {showHalf && (
            <MiniBalance
              title={t('settings_halfday_short')}
              sub={t('settings_this_year')}
              left={data.half_days_remaining} total={data.half_annual_total} used={data.half_days_used}
              bar="bg-orange-400" t={t} />
          )}
        </div>
      )}

      {!isMonthly && data.deductions > 0 && (
        <div className="mt-3 px-3 py-2.5 rounded-xl bg-pink-50 flex items-center justify-between gap-2">
          <div>
            <p className="text-xs font-semibold text-pink-800">{t('settings_deductions') || 'Salary Deductions'}</p>
            <p className="text-[10px] text-pink-600/80 mt-0.5">FY-to-date excess beyond quarterly + half-day limits</p>
          </div>
          <span className="shrink-0 px-2 py-0.5 text-xs font-bold text-pink-700 neu-sm rounded-full">
            {data.deductions} day{data.deductions !== 1 ? 's' : ''}
          </span>
        </div>
      )}
    </div>
  )
}

// Circular progress with content in the middle
function Ring({ pct, color, children }) {
  var r = 40
  var c = 2 * Math.PI * r
  return (
    <div className="relative w-[104px] h-[104px] shrink-0">
      <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
        <circle cx="50" cy="50" r={r} fill="none" stroke="#ece6dc" strokeWidth="9" />
        <circle cx="50" cy="50" r={r} fill="none" stroke={color} strokeWidth="9" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - Math.min(100, Math.max(0, pct)) / 100)}
          className="transition-all duration-700" />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">{children}</div>
    </div>
  )
}

// Small balance tile (quarter / half days)
function MiniBalance({ title, sub, left, total, used, bar, t }) {
  var frac = total > 0 ? Math.max(0, Math.min(1, left / total)) : 0
  var fill = left < 0 ? 'bg-red-500' : frac > 0.4 ? bar : frac > 0.15 ? 'bg-amber-500' : 'bg-red-500'
  return (
    <div className="neu-inset rounded-xl p-3">
      <p className="text-xs font-semibold text-gray-700 truncate">{title}</p>
      <p className="text-[10px] text-slate-500 truncate">{sub}</p>
      <p className="mt-2 tabular-nums">
        <span className={'text-xl font-bold ' + (left < 0 ? 'text-red-600' : 'text-gray-900')}>{left}</span>
        <span className="text-xs text-slate-500"> / {total}</span>
      </p>
      <div className="w-full h-1.5 bg-slate-300/50 rounded-full overflow-hidden mt-1.5">
        <div className={'h-full rounded-full transition-all ' + fill} style={{ width: Math.round(frac * 100) + '%' }} />
      </div>
      <p className="text-[10px] text-gray-500 mt-1">{used} {t('settings_used')}</p>
    </div>
  )
}


function NotificationSettings({ employeeId }) {
  var { t } = useLanguage()
  var [supported, setSupported] = useState(false)
  var [subscribed, setSubscribed] = useState(false)
  var [loading, setLoading] = useState(true)
  var [iosNeedsInstall, setIosNeedsInstall] = useState(false)
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

    var ua = navigator.userAgent || ''
    var isIos = /iPad|iPhone|iPod/.test(ua) || (ua.includes('Mac') && 'ontouchend' in document)
    var isStandalone = window.matchMedia && window.matchMedia('(display-mode: standalone)').matches
      || window.navigator.standalone === true
    if (isIos && !isStandalone) setIosNeedsInstall(true)

    if (!isSupported) { setLoading(false); return }

    // Only trust THIS browser's subscription. A DB row can belong to another
    // device or another install (e.g. the standalone Attendance app vs. the
    // Ambria Hub app, which keep separate subscriptions on iOS), and showing
    // "on" here would hide the Enable button on a context that gets nothing.
    navigator.serviceWorker.ready.then(function (reg) {
      return reg.pushManager.getSubscription()
    }).then(function (sub) {
      setSubscribed(!!sub && Notification.permission === 'granted')
      setLoading(false)
    }).catch(function () {
      setSubscribed(false)
      setLoading(false)
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
    if (iosNeedsInstall) {
      showToast('Install to Home Screen first (see instructions above)')
      return
    }
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

      localStorage.setItem('push_last_refresh_' + employeeId, String(Date.now()))

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
      localStorage.removeItem('push_last_refresh_' + employeeId)
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
    <div className={CARD + ' overflow-hidden mb-4'}>
      <div className="px-4 py-3.5">
        <div className="flex items-center gap-3">
          <span className="w-9 h-9 rounded-xl neu-sm text-amber-600 inline-flex items-center justify-center shrink-0">
            <SIcon name="bell" className="w-[18px] h-[18px]" />
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-[15px] font-medium text-gray-900">{t('settings_notif_title')}</p>
            <p className="text-xs text-gray-500">{t('settings_notif_desc')}</p>
          </div>
          {loading ? (
            <span className="text-[11px] text-slate-500 shrink-0">{t('settings_notif_checking')}</span>
          ) : subscribed ? (
            <button onClick={handleUnsubscribe} disabled={saving}
              className="shrink-0 px-3 py-2 text-xs font-semibold text-red-600 neu-press rounded-xl disabled:opacity-40">
              {saving ? t('saving') : t('settings_notif_off')}
            </button>
          ) : (
            <button onClick={handleSubscribe} disabled={saving || iosNeedsInstall}
              className="shrink-0 px-3.5 py-2 text-xs font-semibold text-white bg-blue-600 rounded-xl shadow-md shadow-blue-600/30 hover:bg-blue-700 transition-colors disabled:opacity-40">
              {saving ? t('saving') : t('settings_notif_enable')}
            </button>
          )}
        </div>
        {iosNeedsInstall && (
          <div className="mt-3 p-3 bg-blue-50 rounded-xl">
            <p className="text-xs font-bold text-blue-900 mb-1">iPhone setup required</p>
            <ol className="text-[10px] text-blue-800 space-y-0.5 list-decimal list-inside">
              <li>Tap the Share icon at the bottom of Safari</li>
              <li>Scroll down and tap "Add to Home Screen"</li>
              <li>Open the app from the home screen icon</li>
              <li>Return here and tap Enable</li>
            </ol>
          </div>
        )}
      </div>

      {subscribed && (
        <div className="px-4 py-3.5 space-y-3 border-t border-slate-300/50">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-gray-800">{t('settings_reminders')}</p>
            <button
              onClick={function () { setRemindersEnabled(!remindersEnabled) }}
              className={'w-10 h-5 rounded-full transition-colors relative ' +
                (remindersEnabled ? 'bg-emerald-500' : 'neu-inset')}
            >
              <div className={'w-4 h-4 bg-white rounded-full absolute top-0.5 transition-transform shadow-sm ' +
                (remindersEnabled ? 'translate-x-5' : 'translate-x-0.5')} />
            </button>
          </div>

          {remindersEnabled && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={LABEL}>
                    {t('settings_reminder_in')}
                  </label>
                  <input
                    type="time"
                    value={punchInTime}
                    onChange={function (e) { setPunchInTime(e.target.value) }}
                    className={INPUT}
                  />
                  <p className="text-[10px] text-slate-500 mt-0.5">e.g. 09:00</p>
                </div>
                <div>
                  <label className={LABEL}>
                    {t('settings_reminder_out')}
                  </label>
                  <input
                    type="time"
                    value={punchOutTime}
                    onChange={function (e) { setPunchOutTime(e.target.value) }}
                    className={INPUT}
                  />
                  <p className="text-[10px] text-slate-500 mt-0.5">e.g. 18:00</p>
                </div>
              </div>

              <button
                onClick={handleSaveReminders}
                disabled={saving}
                className="w-full h-11 text-sm font-semibold text-white bg-blue-600 rounded-xl shadow-md shadow-blue-600/30 hover:bg-blue-700 disabled:opacity-40 transition-colors"
              >
                {saving ? t('saving') : t('settings_save_reminders')}
              </button>
            </>
          )}

          <p className="text-[10px] text-slate-500">
            {t('settings_notif_also')}
          </p>
        </div>
      )}

      {toast && (
        <div className="px-4 py-2.5 bg-slate-900 text-white text-xs text-center">
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

// Line icons for the Settings cards (24x24)
function SIcon({ name, className }) {
  var paths = {
    id: <><rect x="3" y="5" width="18" height="14" rx="2" /><circle cx="9" cy="11" r="2" /><path d="M6 16a3 3 0 0 1 6 0M15 10h3M15 13h3" /></>,
    phone: <path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z" />,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></>,
    bell: <><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" /></>,
    lock: <><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></>,
    monitor: <><rect x="3" y="4" width="18" height="12" rx="2" /><path d="M8 20h8M12 16v4" /></>,
    logout: <><path d="M14 17l5-5-5-5M19 12H8" /><path d="M10 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h5" /></>,
    chevron: <path d="M9 6l6 6-6 6" />,
    external: <><path d="M14 4h6v6M20 4l-9 9" /><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" /></>
  }
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>
  )
}
