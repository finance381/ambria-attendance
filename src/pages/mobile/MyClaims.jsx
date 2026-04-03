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
  var [formType, setFormType] = useState('missed_out')
  var [formTime, setFormTime] = useState('')
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

  async function handleSubmit(e) {
    e.preventDefault()
    setFormError('')

    if (!formDate) return setFormError(t('claims_err_date'))
    if (!formTime) return setFormError(t('claims_err_time'))
    if (!formReason.trim()) return setFormError(t('claims_err_reason'))

    setSaving(true)

    var { data, error } = await supabase.rpc('submit_claim', {
      p_attendance_date: formDate,
      p_claim_type: formType,
      p_claimed_time: formTime + ':00',
      p_reason: formReason.trim()
    })

    setSaving(false)

    if (error || (data && data.error)) {
      setFormError((data && data.error) || error.message)
      return
    }

    showToast(t('claims_toast_submitted', { used: data.used, limit: data.limit }))
    setShowNew(false)
    setFormDate('')
    setFormType('missed_out')
    setFormTime('')
    setFormReason('')
    loadClaims()
  }

  var { t } = useLanguage()

  if (loading) {
    return <p className="text-sm text-gray-400 text-center py-12">{t('loading')}</p>
  }

  var remaining = limit - used

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-bold text-gray-900">{t('claims_title')}</h2>
          <p className="text-xs text-gray-400">
            {t('claims_used', { used: used, limit: limit })}
            <span className={'ml-2 text-[10px] font-bold px-1.5 py-0.5 rounded-full ' +
              (remaining <= 1 ? 'bg-red-50 text-red-600' : 'bg-emerald-50 text-emerald-700')}>
              {t('claims_remaining', { n: remaining })}
            </span>
          </p>
        </div>
        {remaining > 0 && (
          <button
            onClick={function () { setShowNew(true); setFormError('') }}
            className="px-3 py-1.5 text-xs font-semibold text-white bg-slate-800 rounded-lg hover:bg-slate-900 transition-colors"
          >
            {t('claims_new')}
          </button>
        )}
      </div>

      {/* New claim form */}
      {showNew && (
        <div className="bg-white border border-gray-200 rounded-xl p-4 mb-5">
          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1">{t('claims_date')} *</label>
                <input type="date" value={formDate} onChange={function (e) { setFormDate(e.target.value) }}
                  max={new Date().toISOString().slice(0, 10)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-700" />
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1">{t('claims_type')} *</label>
                <select value={formType} onChange={function (e) { setFormType(e.target.value) }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-700">
                  <option value="missed_out">{t('claims_missed_out')}</option>
                  <option value="missed_in">{t('claims_missed_in')}</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1">
                {t('claims_time')} *
              </label>
              <input type="time" value={formTime} onChange={function (e) { setFormTime(e.target.value) }}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-700" />
            </div>

            <div>
              <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1">{t('claims_reason')} *</label>
              <textarea value={formReason} onChange={function (e) { setFormReason(e.target.value) }}
                rows={2} placeholder={t('claims_reason_placeholder')}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-700 resize-none" />
            </div>

            {formError && <p className="text-xs text-red-600">{formError}</p>}

            <div className="flex gap-2">
              <button type="button" onClick={function () { setShowNew(false) }}
                className="flex-1 py-2 text-sm text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors">{t('cancel')}</button>
              <button type="submit" disabled={saving}
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