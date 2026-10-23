import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { useLanguage } from '../../lib/i18n'
import MiniIcon from '../../components/MiniIcon'

var STATUS_COLORS = {
  pending: 'bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200/80',
  approved: 'bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200/80',
  rejected: 'bg-red-50 text-red-600 ring-1 ring-inset ring-red-200/80'
}

export default function MyClaims() {
  var [claims, setClaims] = useState([])
  var [used, setUsed] = useState(0)
  var [limit, setLimit] = useState(4)
  var [loading, setLoading] = useState(true)
  var [showNew, setShowNew] = useState(false)
  var [toast, setToast] = useState('')

  // Form
  var [formDate, setFormDate] = useState('')
  var [formInTime, setFormInTime] = useState('')
  var [formOutTime, setFormOutTime] = useState('')
  var [existingIn, setExistingIn] = useState(null)
  var [existingOut, setExistingOut] = useState(null)
  var [pendingIn, setPendingIn] = useState(false)
  var [pendingOut, setPendingOut] = useState(false)
  var [fetchingPunches, setFetchingPunches] = useState(false)
  var [formReason, setFormReason] = useState('')
  var [formError, setFormError] = useState('')
  var [saving, setSaving] = useState(false)

  var showToast = useCallback(function (msg) {
    setToast(msg)
    setTimeout(function () { setToast('') }, 2500)
  }, [])

  var loadClaims = useCallback(async function () {
    var { data, error } = await supabase.rpc('my_claims')

    if (data && !data.error) {
      setClaims(data.claims || [])
      setUsed(data.used || 0)
      setLimit(data.limit || 4)
    }
    setLoading(false)
  }, [])

  useEffect(function () { loadClaims() }, [loadClaims])

  async function handleDateChange(dateVal) {
    setFormDate(dateVal)
    setFormInTime('')
    setFormOutTime('')
    setExistingIn(null)
    setExistingOut(null)
    setPendingIn(false)
    setPendingOut(false)
    setFormError('')
    if (!dateVal) return

    setFetchingPunches(true)
    var { data } = await supabase.rpc('punches_for_date', { p_date: dateVal })
    setFetchingPunches(false)

    if (data && !data.error) {
      if (data.punch_in) {
        var inT = String(data.punch_in).slice(0, 5)
        setExistingIn(inT)
        setFormInTime(inT)
      }
      if (data.punch_out) {
        var outT = String(data.punch_out).slice(0, 5)
        setExistingOut(outT)
        setFormOutTime(outT)
      }
      if (data.pending_in) setPendingIn(true)
      if (data.pending_out) setPendingOut(true)
    }
  }

  function resetForm() {
    setFormDate('')
    setFormInTime('')
    setFormOutTime('')
    setExistingIn(null)
    setExistingOut(null)
    setPendingIn(false)
    setPendingOut(false)
    setFormReason('')
    setFormError('')
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setFormError('')

    if (!formDate) return setFormError(t('claims_err_date'))

    var inChanged = formInTime && !pendingIn && formInTime !== existingIn
    var outChanged = formOutTime && !pendingOut && formOutTime !== existingOut

    if (!inChanged && !outChanged) {
      return setFormError('Change at least one punch time to submit a claim')
    }
    if (!formReason.trim()) return setFormError(t('claims_err_reason'))

    setSaving(true)

    var claimType = (inChanged && outChanged) ? 'missed_both' : inChanged ? 'missed_in' : 'missed_out'
    var primaryTime = inChanged ? formInTime + ':00' : formOutTime + ':00'
    var outTime = (claimType === 'missed_both') ? formOutTime + ':00' : null

    var rpcParams = {
      p_attendance_date: formDate,
      p_claim_type: claimType,
      p_claimed_time: primaryTime,
      p_reason: formReason.trim()
    }
    if (outTime) rpcParams.p_claimed_out_time = outTime

    var data, error
    try {
      var res = await supabase.rpc('submit_claim', rpcParams)
      data = res.data
      error = res.error
    } catch (netErr) {
      setSaving(false)
      setFormError('Network issue. Refreshing list to check — if your claim is missing, try again.')
      loadClaims()
      return
    }

    if (error || (data && data.error)) {
      setSaving(false)
      setFormError((data && data.error) || (error && error.message) || 'Submit failed')
      return
    }

    setSaving(false)
    var label = claimType === 'missed_both' ? 'In & Out' : claimType === 'missed_in' ? 'Punch In' : 'Punch Out'
    showToast(label + ' claim submitted')
    setShowNew(false)
    resetForm()
    loadClaims()
  }

  var { t } = useLanguage()

  if (loading) {
    return <p className="text-sm text-slate-500 text-center py-12">{t('loading')}</p>
  }

  var remaining = limit - used
  var overBy = Math.max(0, used - limit)
  var isOverLimit = overBy > 0

  return (
    <div>
      <div className="flex items-start justify-between gap-3 mb-5">
        <div className="min-w-0">
          <h2 className="text-[22px] font-bold text-slate-900 tracking-tight leading-tight">{t('claims_title')}</h2>
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-gray-500 mt-1">
            {t('claims_used', { used: used, limit: limit })}
            {isOverLimit ? (
              <span className="inline-block whitespace-nowrap text-[11px] font-semibold px-2 py-0.5 rounded-full bg-red-50 text-red-600 ring-1 ring-inset ring-red-200/80">
                {t('claims_over_by', { n: overBy }) || ('+' + overBy + ' over limit')}
              </span>
            ) : (
              <span className={'inline-block whitespace-nowrap text-[11px] font-semibold px-2 py-0.5 rounded-full ' +
                (remaining <= 1 ? 'bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200/80' : 'bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200/80')}>
                {t('claims_remaining', { n: remaining })}
              </span>
            )}
          </p>
        </div>
        <button
          onClick={function () { setShowNew(true); resetForm() }}
          className="shrink-0 inline-flex items-center gap-1.5 px-3.5 py-2.5 text-sm font-semibold text-white bg-blue-600 rounded-xl shadow-md shadow-blue-600/30 hover:bg-blue-700 transition-colors"
        >
          <ClaimIcon name="plus" className="w-4 h-4" />
          {t('claims_new_short')}
        </button>
      </div>

      {isOverLimit && (
        <div className="bg-red-50/95 border border-red-200 rounded-2xl px-4 py-3 mb-4">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-red-800">
            <MiniIcon name="alert" className="w-4 h-4 shrink-0" />{t('claims_over_banner_title', { n: overBy }) || 'You are ' + overBy + ' claim' + (overBy > 1 ? 's' : '') + ' over the limit'}
          </p>
          <p className="text-[11px] text-red-600 mt-0.5">
            {t('claims_over_banner_desc') || 'Monthly limit is ' + limit + '. Extra claims will still be submitted but flagged for admin review.'}
          </p>
        </div>
      )}

      {/* New claim form */}
      {showNew && (
        <div className="neu rounded-2xl p-4 mb-5">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wider mb-1.5">{t('claims_date')} *</label>
              <input type="date" value={formDate} onChange={function (e) { handleDateChange(e.target.value) }}
                min={function () {
                  var now = new Date()
                  var ist = new Date(now.getTime() + (330 * 60000))
                  var cutoff = new Date(ist.getTime() - 3 * 86400000)
                  return cutoff.getUTCFullYear() + '-' + String(cutoff.getUTCMonth() + 1).padStart(2, '0') + '-' + String(cutoff.getUTCDate()).padStart(2, '0')
                }()}
                max={function () {
                  var now = new Date()
                  var ist = new Date(now.getTime() + (330 * 60000))
                  return ist.getUTCFullYear() + '-' + String(ist.getUTCMonth() + 1).padStart(2, '0') + '-' + String(ist.getUTCDate()).padStart(2, '0')
                }()}
                className="w-full h-12 px-3.5 border-0 neu-inset rounded-xl text-base text-gray-900 outline-none focus:outline-2 focus:outline-blue-400/60" />
            </div>

            {fetchingPunches && (
              <p className="text-xs text-slate-500 text-center py-2">Checking punches…</p>
            )}

            {formDate && !fetchingPunches && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wider mb-1.5">Punch In</label>
                    {existingIn ? (
                      <input type="time" value={formInTime} onChange={function (e) { setFormInTime(e.target.value) }}
                        className="w-full h-11 px-3 border-0 neu-inset rounded-xl text-base font-mono text-emerald-700 outline-none focus:outline-2 focus:outline-blue-400/60" />
                    ) : pendingIn ? (
                      <div className="h-11 px-3 flex items-center gap-1 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-700 font-mono">
                        <MiniIcon name="hourglass" className="w-3.5 h-3.5" /> <span className="text-[10px] font-sans">claim pending</span>
                      </div>
                    ) : (
                      <input type="time" value={formInTime} onChange={function (e) { setFormInTime(e.target.value) }}
                        className="w-full h-11 px-3 border-0 neu-inset rounded-xl text-base text-gray-900 outline-none focus:outline-2 focus:outline-blue-400/60" />
                    )}
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wider mb-1.5">Punch Out</label>
                    {existingOut ? (
                      <input type="time" value={formOutTime} onChange={function (e) { setFormOutTime(e.target.value) }}
                        className="w-full h-11 px-3 border-0 neu-inset rounded-xl text-base font-mono text-emerald-700 outline-none focus:outline-2 focus:outline-blue-400/60" />
                    ) : pendingOut ? (
                      <div className="h-11 px-3 flex items-center gap-1 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-700 font-mono">
                        <MiniIcon name="hourglass" className="w-3.5 h-3.5" /> <span className="text-[10px] font-sans">claim pending</span>
                      </div>
                    ) : (
                      <input type="time" value={formOutTime} onChange={function (e) { setFormOutTime(e.target.value) }}
                        className="w-full h-11 px-3 border-0 neu-inset rounded-xl text-base text-gray-900 outline-none focus:outline-2 focus:outline-blue-400/60" />
                    )}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wider mb-1.5">{t('claims_reason')} *</label>
                  <textarea value={formReason} onChange={function (e) { setFormReason(e.target.value) }}
                    rows={2} maxLength={500} placeholder={t('claims_reason_placeholder')}
                    className="w-full px-3.5 py-2.5 border-0 neu-inset rounded-xl text-base text-gray-900 outline-none focus:outline-2 focus:outline-blue-400/60 resize-none" />
                </div>
              </>
            )}

            {formError && <p className="text-xs text-red-600">{formError}</p>}

            <div className="flex gap-3">
              <button type="button" onClick={function () { setShowNew(false) }}
                className="flex-1 h-12 text-[15px] font-semibold text-gray-700 neu-press rounded-xl">{t('cancel')}</button>
              <button type="submit" disabled={saving || !formDate || fetchingPunches}
                className="flex-1 h-12 text-[15px] font-semibold text-white bg-blue-600 rounded-xl shadow-md shadow-blue-600/30 hover:bg-blue-700 disabled:opacity-50 transition-colors">
                {saving ? t('claims_submitting') : t('claims_submit')}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Claims list */}
      {claims.length === 0 ? (
        <div className="text-center px-6 py-8 rounded-2xl neu">
          <EmptyClaimsArt />
          <p className="text-lg font-bold text-gray-900 mt-5">{t('claims_empty_title')}</p>
          <p className="text-sm text-gray-500 mt-1.5 leading-relaxed">{t('claims_empty_desc')}</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {claims.map(function (c) {
            return (
              <div key={c.id} className="neu rounded-2xl px-4 py-3">
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <span className={'text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ' +
                      (c.claim_type === 'missed_in' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-600')}>
                      {c.claim_type === 'missed_in' ? t('claims_missed_in_short') : t('claims_missed_out_short')}
                    </span>
                    <span className={'text-xs ' + (c.claim_type === 'missed_in' ? 'text-gray-500' : 'font-semibold text-red-600')}>{c.attendance_date}</span>
                  </div>
                  <span className={'text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ' +
                    (STATUS_COLORS[c.status] || 'bg-gray-100 text-gray-500')}>
                    {t('claims_status_' + c.status)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <p className="text-xs text-gray-600">
                    {t('claims_time_label')}: <span className="font-mono">{c.claimed_time}</span> — {c.reason}
                  </p>
                </div>
                {c.reviewed_by && (
                  <p className="text-[10px] text-slate-500 mt-1">
                    {t('claims_reviewed_by')} {c.reviewed_by} · {formatDate(c.reviewed_at)}
                  </p>
                )}
              </div>
            )
          })}
        </div>
      )}

      {toast && (
        <div className="fixed bottom-20 left-4 right-4 bg-slate-800 text-white px-5 py-3 rounded-xl text-sm shadow-lg z-50 text-center">
          {toast}
        </div>
      )}
    </div>
  )
}

function formatDate(isoString) {
  if (!isoString) return ''
  var d = new Date(isoString)
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
}

function ClaimIcon({ name, className }) {
  var paths = { plus: <path d="M12 5v14M5 12h14" /> }
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>
  )
}

// Document-with-clock drawing for the empty list
function EmptyClaimsArt() {
  return (
    <svg className="w-28 h-28 mx-auto" viewBox="0 0 120 120" fill="none" aria-hidden="true">
      <rect x="22" y="14" width="62" height="80" rx="9" fill="#EEF0FD" stroke="#C7CBF6" strokeWidth="3" />
      <path d="M36 38h34M36 52h34M36 66h20" stroke="#7C82E3" strokeWidth="4" strokeLinecap="round" />
      <circle cx="82" cy="80" r="22" fill="#fff" stroke="#4F46E5" strokeWidth="4" />
      <path d="M82 68v13l8 5" stroke="#4F46E5" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
