import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { useLanguage } from '../../lib/i18n'

var STATUS_COLORS = {
  pending: 'bg-amber-50 text-amber-700',
  approved: 'bg-emerald-50 text-emerald-700',
  rejected: 'bg-red-50 text-red-600'
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

    var { data, error } = await supabase.rpc('submit_claim', rpcParams)

    if (error || (data && data.error)) {
      setSaving(false)
      setFormError((data && data.error) || error.message)
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
    return <p className="text-sm text-gray-400 text-center py-12">{t('loading')}</p>
  }

  var remaining = limit - used
  var overBy = Math.max(0, used - limit)
  var isOverLimit = overBy > 0

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-bold text-gray-900">{t('claims_title')}</h2>
          <p className="text-xs text-gray-400">
            {t('claims_used', { used: used, limit: limit })}
            {isOverLimit ? (
              <span className="ml-2 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-red-50 text-red-600">
                {t('claims_over_by', { n: overBy }) || ('+' + overBy + ' over limit')}
              </span>
            ) : (
              <span className={'ml-2 text-[10px] font-bold px-1.5 py-0.5 rounded-full ' +
                (remaining <= 1 ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700')}>
                {t('claims_remaining', { n: remaining })}
              </span>
            )}
          </p>
        </div>
        <button
          onClick={function () { setShowNew(true); resetForm() }}
          className="px-3 py-1.5 text-xs font-semibold text-white bg-slate-800 rounded-lg hover:bg-slate-900 transition-colors"
        >
          {t('claims_new')}
        </button>
      </div>

      {isOverLimit && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 mb-4">
          <p className="text-sm font-semibold text-red-800">
            ⚠️ {t('claims_over_banner_title', { n: overBy }) || 'You are ' + overBy + ' claim' + (overBy > 1 ? 's' : '') + ' over the limit'}
          </p>
          <p className="text-[11px] text-red-600 mt-0.5">
            {t('claims_over_banner_desc') || 'Monthly limit is ' + limit + '. Extra claims will still be submitted but flagged for admin review.'}
          </p>
        </div>
      )}

      {/* New claim form */}
      {showNew && (
        <div className="bg-white border border-gray-200 rounded-xl p-4 mb-5">
          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1">{t('claims_date')} *</label>
              <input type="date" value={formDate} onChange={function (e) { handleDateChange(e.target.value) }}
                max={new Date().toISOString().slice(0, 10)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-700" />
            </div>

            {fetchingPunches && (
              <p className="text-xs text-gray-400 text-center py-2">Checking punches…</p>
            )}

            {formDate && !fetchingPunches && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1">Punch In</label>
                    {existingIn ? (
                      <input type="time" value={formInTime} onChange={function (e) { setFormInTime(e.target.value) }}
                        className="w-full px-3 py-2 border border-emerald-300 bg-emerald-50/50 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-slate-700" />
                    ) : pendingIn ? (
                      <div className="px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-700 font-mono">
                        ⏳ <span className="text-[10px] font-sans">claim pending</span>
                      </div>
                    ) : (
                      <input type="time" value={formInTime} onChange={function (e) { setFormInTime(e.target.value) }}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-700" />
                    )}
                  </div>
                  <div>
                    <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1">Punch Out</label>
                    {existingOut ? (
                      <input type="time" value={formOutTime} onChange={function (e) { setFormOutTime(e.target.value) }}
                        className="w-full px-3 py-2 border border-emerald-300 bg-emerald-50/50 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-slate-700" />
                    ) : pendingOut ? (
                      <div className="px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-700 font-mono">
                        ⏳ <span className="text-[10px] font-sans">claim pending</span>
                      </div>
                    ) : (
                      <input type="time" value={formOutTime} onChange={function (e) { setFormOutTime(e.target.value) }}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-700" />
                    )}
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1">{t('claims_reason')} *</label>
                  <textarea value={formReason} onChange={function (e) { setFormReason(e.target.value) }}
                    rows={2} maxLength={500} placeholder={t('claims_reason_placeholder')}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-700 resize-none" />
                </div>
              </>
            )}

            {formError && <p className="text-xs text-red-600">{formError}</p>}

            <div className="flex gap-2">
              <button type="button" onClick={function () { setShowNew(false) }}
                className="flex-1 py-2 text-sm text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors">{t('cancel')}</button>
              <button type="submit" disabled={saving || !formDate || fetchingPunches}
                className="flex-1 py-2 text-sm text-white bg-slate-800 rounded-lg hover:bg-slate-900 disabled:opacity-40 transition-colors font-medium">
                {saving ? t('claims_submitting') : t('claims_submit')}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Claims list */}
      {claims.length === 0 ? (
        <div className="text-center py-8">
          <p className="text-sm text-gray-400">{t('claims_empty')}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {claims.map(function (c) {
            return (
              <div key={c.id} className="bg-white border border-gray-200 rounded-xl px-4 py-3">
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <span className={'text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ' +
                      (c.claim_type === 'missed_in' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-600')}>
                      {c.claim_type === 'missed_in' ? t('claims_missed_in_short') : t('claims_missed_out_short')}
                    </span>
                    <span className="text-xs text-gray-500">{c.attendance_date}</span>
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
                  <p className="text-[10px] text-gray-400 mt-1">
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