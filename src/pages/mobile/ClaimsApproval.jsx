import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/useAuth'
import MiniIcon from '../../components/MiniIcon'
import { useLanguage } from '../../lib/i18n'
import { useHindiText } from '../../lib/autoTranslate'
import { selfieThumbUrl, selfieFullUrl } from '../../lib/selfieUrl'

var STATUS_COLORS = {
  pending: 'bg-amber-50 text-amber-700 border-amber-200',
  approved: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  rejected: 'bg-red-50 text-red-600 border-red-200'
}

var STATUS_CHIPS = [
  { id: '', key: 'ca_all' },
  { id: 'pending', key: 'ca_pending' },
  { id: 'approved', key: 'ca_approved' },
  { id: 'rejected', key: 'ca_rejected' },
]

export default function ClaimsApproval() {
  var { t, lang } = useLanguage()
  var locale = lang === 'hi' ? 'hi-IN' : 'en-IN'
  var { employee } = useAuth()
  var [claims, setClaims] = useState([])
  var [selfClaimNotice, setSelfClaimNotice] = useState(null)
  var [departments, setDepartments] = useState([])
  var [deptFilter, setDeptFilter] = useState('')
  var [statusFilter, setStatusFilter] = useState('pending')
  var [search, setSearch] = useState('')
  var [mYear, setMYear] = useState(new Date().getFullYear())
  var [mMonth, setMMonth] = useState(new Date().getMonth() + 1)
  var [loading, setLoading] = useState(true)
  var [saving, setSaving] = useState(false)
  var [toast, setToast] = useState('')
  var [rejectTarget, setRejectTarget] = useState(null)
  var [rejectReason, setRejectReason] = useState('')
  var [expandedClaim, setExpandedClaim] = useState(null)
  var [claimPunches, setClaimPunches] = useState([])
  var [punchLoading, setPunchLoading] = useState(false)

  var showToast = useCallback(function (msg) {
    setToast(msg)
    setTimeout(function () { setToast('') }, 2500)
  }, [])

  var loadAll = useCallback(async function () {
    setLoading(true)
    var [claimsRes, deptRes] = await Promise.all([
      supabase.rpc('all_claims', {
        p_department_id: deptFilter ? Number(deptFilter) : null,
        p_status: statusFilter || null
      }),
      supabase.from('departments').select('id, name').eq('active', true).order('name')
    ])

    setClaims(claimsRes.data || [])
    setDepartments(deptRes.data || [])
    setLoading(false)
  }, [deptFilter, statusFilter])

  useEffect(function () { loadAll() }, [loadAll])

  async function handleApprove(claim) {
    setSaving(true)

    var { data, error } = await supabase.rpc('review_claim', {
      p_claim_id: claim.claim_id,
      p_action: 'approved'
    })

    setSaving(false)

    if (error || (data && data.error)) {
      showToast((data && data.error) || error.message)
      return
    }

    showToast(t('ca_toast_approved', { name: claim.employee_name }))
    loadAll()
  }

  async function handleReject() {
    if (!rejectTarget) return
    if (!rejectReason.trim()) return

    setSaving(true)

    var { data, error } = await supabase.rpc('review_claim', {
      p_claim_id: rejectTarget.claim_id,
      p_action: 'rejected',
      p_reject_reason: rejectReason.trim()
    })

    setSaving(false)

    if (error || (data && data.error)) {
      showToast((data && data.error) || error.message)
      return
    }

    showToast(t('ca_toast_rejected', { name: rejectTarget.employee_name }))
    setRejectTarget(null)
    setRejectReason('')
    loadAll()
  }

  async function loadPunchContext(claim) {
    if (expandedClaim === claim.claim_id) {
      setExpandedClaim(null)
      return
    }
    setExpandedClaim(claim.claim_id)
    setPunchLoading(true)
    var { data } = await supabase
      .from('punches')
      .select('punch_type, punched_at, is_late_entry, location_name, selfie_path, venues(name)')
      .eq('employee_id', claim.employee_id)
      .eq('attendance_date', claim.attendance_date)
      .order('punched_at')
    setClaimPunches(data || [])
    setPunchLoading(false)
  }

  var monthClaims = claims.filter(function (c) {
    var d = c.attendance_date
    if (!d) return false
    var parts = d.split('-')
    return Number(parts[0]) === mYear && Number(parts[1]) === mMonth
  })
  var pendingCount = monthClaims.filter(function (c) { return c.status === 'pending' }).length

  var visibleClaims = monthClaims.filter(function (c) {
    if (search) {
      var q = search.toLowerCase()
      if (!c.employee_name.toLowerCase().includes(q) && !c.emp_code.toLowerCase().includes(q)) return false
    }
    return true
  })

  return (
    <div>
      <div className="mb-4">
        <h2 className="text-[22px] font-bold text-slate-900 tracking-tight leading-tight">{t('ca_title')}</h2>
        <p className="flex flex-wrap items-center gap-2 text-[13px] text-gray-500 mt-1">
          {t('ca_month_count', { n: monthClaims.length })}
          {pendingCount > 0 && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 ring-1 ring-inset ring-amber-200 text-[11px] font-semibold [text-shadow:none]">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
              {t('ca_pending_count', { n: pendingCount })}
            </span>
          )}
        </p>
      </div>

      {/* Month nav */}
      <div className="flex items-center justify-between mb-4">
        <button onClick={function () { if (mMonth === 1) { setMMonth(12); setMYear(mYear - 1) } else setMMonth(mMonth - 1) }}
          aria-label={t('ca_prev_month')}
          className="w-10 h-10 flex items-center justify-center rounded-xl neu-press text-gray-700">
          <ApproveIcon name="left" className="w-5 h-5" />
        </button>
        <span className="text-base font-bold text-slate-800">
          {new Date(mYear, mMonth - 1, 1).toLocaleDateString(locale, { month: 'short', year: 'numeric' })}
        </span>
        <button onClick={function () {
            var now = new Date(); if (mYear === now.getFullYear() && mMonth === now.getMonth() + 1) return;
            if (mMonth === 12) { setMMonth(1); setMYear(mYear + 1) } else setMMonth(mMonth + 1)
          }}
          disabled={mYear === new Date().getFullYear() && mMonth === new Date().getMonth() + 1}
          aria-label={t('ca_next_month')}
          className="w-10 h-10 flex items-center justify-center rounded-xl neu-press text-gray-700 disabled:opacity-40">
          <ApproveIcon name="right" className="w-5 h-5" />
        </button>
      </div>

      {/* Status chips */}
      <div className="flex gap-2 mb-3 overflow-x-auto pt-1 pb-3 -mx-4 px-4">
        {STATUS_CHIPS.map(function (chip) {
          var active = statusFilter === chip.id
          return (
            <button key={chip.id} onClick={function () { setStatusFilter(chip.id) }}
              className={'flex-shrink-0 px-4 py-2 text-sm font-semibold rounded-xl ' +
                (active ? 'neu-on text-blue-600' : 'neu-press text-gray-700')}>
              {t(chip.key)}
            </button>
          )
        })}
      </div>

      {/* Department + search */}
      <div className="space-y-2 mb-4">
        <select value={deptFilter} onChange={function (e) { setDeptFilter(e.target.value) }}
          className="w-full h-11 px-3 border-0 neu-inset rounded-xl text-sm text-gray-800 outline-none focus:outline-2 focus:outline-blue-400/60">
          <option value="">{t('ca_all_depts')}</option>
          {departments.map(function (d) { return <option key={d.id} value={d.id}>{d.name}</option> })}
        </select>
        <div className="relative">
          <ApproveIcon name="search" className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input type="text" value={search} onChange={function (e) { setSearch(e.target.value) }}
            placeholder={t('ca_search')}
            className="w-full h-11 pl-9 pr-3 border-0 neu-inset rounded-xl text-base text-gray-900 placeholder:text-sm placeholder:text-slate-500 outline-none focus:outline-2 focus:outline-blue-400/60" />
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-slate-500 text-center py-12">{t('loading')}</p>
      ) : visibleClaims.length === 0 ? (
        <div className="text-center px-6 py-8 rounded-2xl neu">
          <EmptyApprovalsArt />
          <p className="text-lg font-bold text-gray-900 mt-5">
            {t(statusFilter ? 'ca_empty_' + statusFilter : 'ca_empty_month')}
          </p>
          {statusFilter === 'pending' && (
            <p className="text-sm text-gray-500 mt-1.5 leading-relaxed">{t('ca_caught_up')}</p>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {visibleClaims.map(function (c) {
            var isPending = c.status === 'pending'
            var initials = (c.employee_name || '?').trim().split(/\s+/).slice(0, 2)
              .map(function (w) { return w[0] }).join('').toUpperCase()
            var typeChip = c.claim_type === 'missed_both'
              ? { label: t('ca_missed_both'), cls: 'bg-violet-50 text-violet-700 ring-violet-200' }
              : c.claim_type === 'missed_in'
                ? { label: t('ca_missed_in'), cls: 'bg-emerald-50 text-emerald-700 ring-emerald-200' }
                : { label: t('ca_missed_out'), cls: 'bg-rose-50 text-rose-700 ring-rose-200' }
            return (
              <div key={c.claim_id} className={'neu rounded-2xl overflow-hidden ' +
                (c.is_over_limit ? 'outline-2 outline-red-300' : '')}>
                <div className="p-4">
                  {/* Who */}
                  <div className="flex items-center gap-3">
                    <span className="w-10 h-10 rounded-full neu-sm text-blue-700 text-sm font-bold inline-flex items-center justify-center shrink-0">
                      {initials}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[15px] font-semibold text-gray-900 truncate leading-tight">{c.employee_name}</p>
                      <p className="text-xs text-gray-500 truncate mt-0.5">{c.emp_code} · {c.department_name}</p>
                    </div>
                    <span className={'shrink-0 w-[84px] text-center text-[10px] font-bold uppercase tracking-wide px-2 py-1 rounded-lg border ' +
                      (STATUS_COLORS[c.status] || 'bg-gray-100 text-gray-500 border-gray-200')}>
                      {t('ca_' + c.status)}
                    </span>
                  </div>

                  {/* What */}
                  <div className="flex items-center gap-1.5 flex-wrap mt-3">
                    <span className={'inline-flex justify-center w-[112px] text-[11px] font-semibold px-2 py-0.5 rounded-md ring-1 ' + typeChip.cls}>{typeChip.label}</span>
                    {c.is_over_limit && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-md bg-red-600 text-white">
                        <ApproveIcon name="alert" className="w-3 h-3" />
                        {t('ca_over_limit')}
                      </span>
                    )}
                  </div>

                  {/* When */}
                  <div className="grid grid-cols-2 gap-2 mt-3">
                    <div className="neu-inset rounded-xl px-3 py-2">
                      <p className="flex items-center gap-1 text-[11px] text-gray-500">
                        <ApproveIcon name="calendar" className="w-3.5 h-3.5" />
                        {t('ca_date')}
                      </p>
                      <p className="text-sm font-semibold text-gray-900 mt-0.5">{formatDay(c.attendance_date, locale)}</p>
                    </div>
                    <div className="neu-inset rounded-xl px-3 py-2">
                      <p className="flex items-center gap-1 text-[11px] text-gray-500">
                        <ApproveIcon name="clock" className="w-3.5 h-3.5" />
                        {t(c.claim_type === 'missed_both' ? 'ca_in_out' : c.claim_type === 'missed_in' ? 'ca_claimed_in' : 'ca_claimed_out')}
                      </p>
                      <p className="text-sm font-semibold text-gray-900 mt-0.5 tabular-nums">
                        {c.claim_type === 'missed_both'
                          ? formatClock(c.claimed_time) + ' – ' + formatClock(c.claimed_out_time)
                          : formatClock(c.claimed_time)}
                      </p>
                    </div>
                  </div>

                  {/* Why */}
                  {c.reason && (
                    <p className="mt-3 pl-3 border-l-2 border-blue-300 text-[13px] text-gray-700 leading-relaxed"><HindiText text={c.reason} /></p>
                  )}
                  <p className="text-[11px] text-slate-500 mt-2">{t('ca_submitted', { d: formatDateTime(c.created_at, locale) })}</p>

                  {!isPending && c.reviewed_by_name && (
                    <p className={'text-xs mt-2 font-medium ' + (c.status === 'approved' ? 'text-emerald-700' : 'text-red-600')}>
                      {t(c.status === 'approved' ? 'ca_approved_by' : 'ca_rejected_by', { name: c.reviewed_by_name })}
                      {c.reviewed_at && <span className="text-slate-500 font-normal"> · {formatDateTime(c.reviewed_at, locale)}</span>}
                    </p>
                  )}
                </div>

                {/* Existing punches that day */}
                {isPending && (
                  <div className="border-t border-slate-300/50">
                    <button
                      onClick={function () { loadPunchContext(c) }}
                      className="w-full flex items-center justify-between px-4 py-2.5 text-xs font-semibold text-blue-600 active:bg-white/40"
                    >
                      {t(expandedClaim === c.claim_id ? 'ca_hide_punches' : 'ca_show_punches')}
                      <ApproveIcon name="down" className={'w-4 h-4 transition-transform ' + (expandedClaim === c.claim_id ? 'rotate-180' : '')} />
                    </button>
                    {expandedClaim === c.claim_id && (
                      <div className="mx-4 mb-3 neu-inset rounded-xl px-3 py-2.5">
                        {punchLoading ? (
                          <p className="text-xs text-blue-500">{t('loading')}</p>
                        ) : claimPunches.length === 0 ? (
                          <p className="text-xs text-blue-600">{t('ca_no_punches')}</p>
                        ) : (
                          <div className="space-y-2">
                            {claimPunches.map(function (p, i) {
                              var pt = new Date(p.punched_at)
                              var timeStr = pt.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' }).toUpperCase()
                              return (
                                <div key={i} className="flex items-center gap-2.5 text-xs">
                                  {p.selfie_path && (
                                    <img
                                      src={selfieThumbUrl(p.selfie_path)}
                                      onError={function (e) { e.target.onerror = null; e.target.src = selfieFullUrl(p.selfie_path) }}
                                      className="w-8 h-8 rounded-full object-cover ring-2 ring-white flex-shrink-0"
                                      alt=""
                                    />
                                  )}
                                  <span className={'text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ' + (p.punch_type === 'in' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-600')}>
                                    {p.punch_type}
                                  </span>
                                  <span className="font-semibold text-gray-800 tabular-nums">{timeStr}</span>
                                  {(p.venues || p.location_name) && <span className="text-gray-500 truncate">· {p.venues ? p.venues.name : p.location_name}</span>}
                                  {p.is_late_entry && <span className="text-amber-600 text-[10px]">{t('ca_claim_tag')}</span>}
                                </div>
                              )
                            })}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Actions */}
                {isPending && (
                  <div className="px-4 pb-4">
                    {employee && c.employee_id === employee.id ? (
                      <button
                        onClick={function () { setSelfClaimNotice(c) }}
                        className="w-full h-11 text-sm font-semibold text-amber-700 neu-press rounded-xl"
                      >
                        {t('ca_own_claim')}
                      </button>
                    ) : (
                      <div className="flex gap-2.5">
                        <button
                          onClick={function () { handleApprove(c) }}
                          disabled={saving}
                          className="flex-1 h-11 inline-flex items-center justify-center gap-1.5 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-[0_8px_18px_-8px] shadow-emerald-700/50 active:scale-[0.98] disabled:opacity-40 transition-all"
                        >
                          <ApproveIcon name="check" className="w-4 h-4" />
                          {t('ca_approve')}
                        </button>
                        <button
                          onClick={function () { setRejectTarget(c); setRejectReason('') }}
                          className="flex-1 h-11 inline-flex items-center justify-center gap-1.5 text-sm font-semibold text-red-600 neu-press rounded-xl"
                        >
                          <ApproveIcon name="x" className="w-4 h-4" />
                          {t('ca_reject')}
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Self-claim notice modal */}
      {selfClaimNotice && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={function () { setSelfClaimNotice(null) }}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm text-center space-y-3" onClick={function (e) { e.stopPropagation() }}>
            <div className="w-14 h-14 mx-auto rounded-full bg-red-50 text-red-500 inline-flex items-center justify-center"><MiniIcon name="ban" className="w-7 h-7" /></div>
            <h3 className="font-bold text-slate-800 text-base">{t('ca_self_title')}</h3>
            <p className="text-sm text-gray-600">
              {t('ca_self_body')}
            </p>
            <p className="text-xs text-slate-500">
              {t('ca_claim_for', { d: formatDay(selfClaimNotice.attendance_date, locale) })}
            </p>
            <button
              onClick={function () { setSelfClaimNotice(null) }}
              className="w-full bg-slate-800 text-white rounded-lg py-2.5 text-sm font-semibold mt-2"
            >
              {t('ca_got_it')}
            </button>
          </div>
        </div>
      )}

      {/* Reject reason modal */}
      {rejectTarget && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={function () { setRejectTarget(null) }}>
          <div className="bg-white rounded-xl w-full max-w-sm shadow-xl" onClick={function (e) { e.stopPropagation() }}>
            <div className="px-5 py-4 border-b border-gray-100">
              <h3 className="text-sm font-bold text-gray-900">{t('ca_reject_title')}</h3>
              <p className="text-xs text-gray-500">{rejectTarget.employee_name} · {formatDay(rejectTarget.attendance_date, locale)}</p>
            </div>
            <div className="px-5 py-4 space-y-3">
              <div>
                <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1">{t('ca_reject_reason')}</label>
                <textarea value={rejectReason} onChange={function (e) { setRejectReason(e.target.value) }}
                  rows={3} maxLength={500} placeholder={t('ca_reject_ph')}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-700 resize-none"
                  autoFocus />
              </div>
              <div className="flex gap-2">
                <button onClick={function () { setRejectTarget(null) }}
                  className="flex-1 py-2.5 text-sm text-gray-600 bg-gray-100 rounded-lg active:bg-gray-200 transition-colors">{t('ca_cancel')}</button>
                <button onClick={handleReject} disabled={saving || !rejectReason.trim()}
                  className="flex-1 py-2.5 text-sm text-white bg-red-600 rounded-lg active:bg-red-700 disabled:opacity-40 transition-colors font-medium">
                  {saving ? t('ca_rejecting') : t('ca_reject')}
                </button>
              </div>
            </div>
          </div>
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

// Free text the employee typed, shown in Hindi when the app is in Hindi
function HindiText({ text }) {
  return useHindiText(text)
}

function formatDateTime(isoString, locale) {
  if (!isoString) return ''
  var d = new Date(isoString)
  return d.toLocaleDateString(locale || 'en-IN', { day: 'numeric', month: 'short' }) + ' ' +
    d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true }).toUpperCase()
}

function ApproveIcon({ name, className }) {
  var paths = {
    left: <path d="M15 18l-6-6 6-6" />,
    right: <path d="M9 6l6 6-6 6" />,
    search: <><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></>,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></>,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    down: <path d="M6 9l6 6 6-6" />,
    check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
    x: <path d="M6 6l12 12M18 6L6 18" />,
    alert: <><path d="M12 9v4M12 17h.01" /><path d="M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" /></>
  }
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>
  )
}

// Document with a check badge, for the empty list
function EmptyApprovalsArt() {
  return (
    <svg className="w-28 h-28 mx-auto" viewBox="0 0 120 120" fill="none" aria-hidden="true">
      <path d="M26 20a8 8 0 0 1 8-8h34l18 18v62a8 8 0 0 1-8 8H34a8 8 0 0 1-8-8z" fill="#EEF0FD" stroke="#C7CBF6" strokeWidth="3" />
      <path d="M68 12v18h18" stroke="#C7CBF6" strokeWidth="3" strokeLinejoin="round" />
      <path d="M38 48h32M38 62h32M38 76h18" stroke="#7C82E3" strokeWidth="4" strokeLinecap="round" />
      <circle cx="84" cy="84" r="20" fill="#4338CA" />
      <path d="M75 84l6 6 12-12" stroke="#fff" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

// "2026-10-17" -> "Sat, 17 Oct"
function formatDay(dateStr, locale) {
  if (!dateStr) return '—'
  return new Date(dateStr + 'T00:00:00').toLocaleDateString(locale || 'en-IN', { weekday: 'short', day: 'numeric', month: 'short' })
}

// "13:35:00" -> "1:35 PM"
function formatClock(timeStr) {
  if (!timeStr) return '—'
  var parts = String(timeStr).split(':')
  var h = Number(parts[0])
  var m = parts[1] || '00'
  return ((h % 12) || 12) + ':' + m + ' ' + (h < 12 ? 'AM' : 'PM')
}
