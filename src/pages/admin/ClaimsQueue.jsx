// ClaimsQueue.jsx
// Admin → Requests → Claims. Missed-punch claims from all_claims() for one
// month as cards with Approve / Reject, filtered by status, department and
// search. Phones (< sm) stack the toolbar and scroll the status chips.

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/useAuth'
import { selfieThumbUrl, selfieFullUrl } from '../../lib/selfieUrl'

var STATUS_COLORS = {
  pending: 'bg-amber-50 text-amber-700 border-amber-200',
  approved: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  rejected: 'bg-red-50 text-red-600 border-red-200'
}

export default function ClaimsQueue() {
  var { employee } = useAuth()
  var [claims, setClaims] = useState([])
  var [selfClaimNotice, setSelfClaimNotice] = useState(null)
  var [departments, setDepartments] = useState([])
  var [deptFilter, setDeptFilter] = useState('')
  var [statusFilter, setStatusFilter] = useState('')
  var [typeFilter, setTypeFilter] = useState('')
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
        p_status: null
      }),
      supabase.from('departments').select('id, name').eq('active', true).order('name')
    ])

    setClaims(claimsRes.data || [])
    setDepartments(deptRes.data || [])
    setLoading(false)
  }, [deptFilter])

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

    showToast(claim.employee_name + ' — claim approved, override created')
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

    showToast(rejectTarget.employee_name + ' — claim rejected')
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
  var approvedCount = monthClaims.filter(function (c) { return c.status === 'approved' }).length
  var rejectedCount = monthClaims.filter(function (c) { return c.status === 'rejected' }).length

  // Claim type counts for the month, within the chosen status tab
  var typeCounts = { missed_in: 0, missed_out: 0, missed_both: 0 }
  monthClaims.forEach(function (c) {
    if (statusFilter && c.status !== statusFilter) return
    if (typeCounts[c.claim_type] !== undefined) typeCounts[c.claim_type]++
  })
  var typeTotal = typeCounts.missed_in + typeCounts.missed_out + typeCounts.missed_both

  var shownClaims = claims.filter(function (c) {
    if (statusFilter && c.status !== statusFilter) return false
    if (typeFilter && c.claim_type !== typeFilter) return false
    var d = c.attendance_date
    if (d) {
      var parts = d.split('-')
      if (Number(parts[0]) !== mYear || Number(parts[1]) !== mMonth) return false
    }
    if (search) {
      var q = search.toLowerCase()
      if (!c.employee_name.toLowerCase().includes(q) && !c.emp_code.toLowerCase().includes(q)) return false
    }
    return true
  })

  var STATUS_TABS = [
    { id: '', label: 'All', count: pendingCount + approvedCount + rejectedCount },
    { id: 'pending', label: 'Pending', count: pendingCount },
    { id: 'approved', label: 'Approved', count: approvedCount },
    { id: 'rejected', label: 'Rejected', count: rejectedCount }
  ]
  var isCurrentMonth = mYear === new Date().getFullYear() && mMonth === new Date().getMonth() + 1

  return (
    <div>
      <div className="mb-4">
        <h2 className="text-xl sm:text-2xl font-bold text-gray-900 tracking-tight">Claims</h2>
        <p className="flex flex-wrap items-center gap-2 text-sm text-gray-500 mt-1">
          {monthClaims.length} claim{monthClaims.length !== 1 ? 's' : ''} this month
          {pendingCount > 0 && (
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-amber-50 ring-1 ring-amber-200 text-xs font-semibold text-amber-700">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
              {pendingCount} pending
            </span>
          )}
        </p>
      </div>

      {/* Toolbar: status tabs, department, claim type, search, month */}
      <div className="bg-white rounded-2xl ring-1 ring-gray-200/70 shadow-sm p-3 mb-5 flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-3">
        <div className="flex gap-1 bg-gray-100 rounded-xl p-1 max-w-full overflow-x-auto sm:overflow-visible">
          {STATUS_TABS.map(function (tab) {
            var active = statusFilter === tab.id
            return (
              <button key={tab.label} onClick={function () { setStatusFilter(tab.id) }}
                className={'shrink-0 px-2 sm:px-3 h-8 rounded-lg text-sm font-semibold inline-flex items-center gap-1.5 transition-colors ' +
                  (active ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-800')}>
                {tab.label}
                <span className={'text-[11px] font-semibold px-1.5 rounded-md tabular-nums ' +
                  (active ? (tab.id === 'pending' ? 'bg-amber-100 text-amber-700' : 'bg-blue-50 text-blue-700') : 'bg-gray-200/80 text-gray-500')}>
                  {tab.count}
                </span>
              </button>
            )
          })}
        </div>

        <select value={deptFilter} onChange={function (e) { setDeptFilter(e.target.value) }}
          className="h-10 px-3 border border-gray-200 rounded-xl bg-white text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 w-full sm:w-auto min-w-44">
          <option value="">All departments</option>
          {departments.map(function (d) { return <option key={d.id} value={d.id}>{d.name}</option> })}
        </select>

        <select value={typeFilter} onChange={function (e) { setTypeFilter(e.target.value) }} aria-label="Claim type"
          className={'h-10 px-3 border rounded-xl bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-full sm:w-auto min-w-44 ' +
            (typeFilter ? 'border-blue-400 text-gray-900 font-medium' : 'border-gray-200 text-gray-800')}>
          <option value="">All claim types ({typeTotal})</option>
          <option value="missed_in">Missed In ({typeCounts.missed_in})</option>
          <option value="missed_out">Missed Out ({typeCounts.missed_out})</option>
          <option value="missed_both">Missed In &amp; Out ({typeCounts.missed_both})</option>
        </select>

        <div className="relative sm:flex-1 sm:min-w-52">
          <QIcon name="search" className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input type="text" value={search} onChange={function (e) { setSearch(e.target.value) }}
            placeholder="Search name or code…"
            className="w-full h-10 pl-9 pr-3 border border-gray-200 rounded-xl bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>

        <div className="flex items-center justify-between sm:justify-start gap-1 bg-gray-100 rounded-xl p-1">
          <button onClick={function () { if (mMonth === 1) { setMMonth(12); setMYear(mYear - 1) } else setMMonth(mMonth - 1) }}
            aria-label="Previous month"
            className="w-8 h-8 inline-flex items-center justify-center rounded-lg text-gray-600 hover:bg-white hover:shadow-sm">
            <QIcon name="left" className="w-4 h-4" />
          </button>
          <span className="px-2 text-sm font-semibold text-gray-800 min-w-24 text-center">
            {['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][mMonth - 1]} {mYear}
          </span>
          <button onClick={function () {
              if (isCurrentMonth) return
              if (mMonth === 12) { setMMonth(1); setMYear(mYear + 1) } else setMMonth(mMonth + 1)
            }}
            disabled={isCurrentMonth}
            aria-label="Next month"
            className="w-8 h-8 inline-flex items-center justify-center rounded-lg text-gray-600 hover:bg-white hover:shadow-sm disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:shadow-none">
            <QIcon name="right" className="w-4 h-4" />
          </button>
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-gray-400 text-center py-12">Loading…</p>
      ) : shownClaims.length === 0 ? (
        <div className="bg-white rounded-2xl ring-1 ring-gray-200/70 shadow-sm text-center py-14">
          <span className="w-14 h-14 rounded-2xl bg-blue-50 text-blue-500 inline-flex items-center justify-center mb-3">
            <QIcon name="doc" className="w-7 h-7" />
          </span>
          <p className="text-base font-semibold text-gray-800">
            {typeFilter ? 'No claims of this type' : statusFilter === 'pending' ? 'No pending claims — all caught up' : statusFilter ? 'No ' + statusFilter + ' claims' : 'No claims this month'}
          </p>
        </div>
      ) : (
        <div className="grid md:grid-cols-2 2xl:grid-cols-3 gap-3 sm:gap-4">
          {shownClaims.map(function (c) {
            var isPending = c.status === 'pending'
            var initials = (c.employee_name || '?').trim().split(/\s+/).slice(0, 2).map(function (w) { return w[0] }).join('').toUpperCase()
            var typeChip = c.claim_type === 'missed_both'
              ? { label: 'Missed In & Out', cls: 'bg-violet-50 text-violet-700 ring-violet-200' }
              : c.claim_type === 'missed_in'
                ? { label: 'Missed In', cls: 'bg-emerald-50 text-emerald-700 ring-emerald-200' }
                : { label: 'Missed Out', cls: 'bg-rose-50 text-rose-700 ring-rose-200' }
            return (
              <div key={c.claim_id} className={'flex flex-col rounded-2xl shadow-sm ring-1 overflow-hidden ' +
                (c.is_over_limit ? 'bg-red-50/60 ring-red-200' : 'bg-white ring-gray-200/70')}>
                <div className="p-4">
                  <div className="flex items-center gap-3">
                    <span className="w-10 h-10 rounded-full bg-blue-100 text-blue-700 text-sm font-bold inline-flex items-center justify-center shrink-0">{initials}</span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[15px] font-semibold text-gray-900 truncate leading-tight">{c.employee_name}</p>
                      <p className="text-xs text-gray-500 truncate mt-0.5">{c.emp_code} · {c.department_name}</p>
                    </div>
                    <span className={'shrink-0 w-[84px] text-center text-[10px] font-bold uppercase tracking-wide px-2 py-1 rounded-lg border ' +
                      (STATUS_COLORS[c.status] || 'bg-gray-100 text-gray-500 border-gray-200')}>
                      {c.status}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5 flex-wrap mt-3">
                    <span className={'inline-flex justify-center w-[112px] text-[11px] font-semibold px-2 py-0.5 rounded-md ring-1 ' + typeChip.cls}>{typeChip.label}</span>
                    {c.is_over_limit && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-md bg-red-600 text-white">
                        <QIcon name="alert" className="w-3 h-3" />
                        Over limit
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-2 mt-3">
                    <div className="rounded-xl bg-gray-50 px-3 py-2">
                      <p className="flex items-center gap-1 text-[11px] text-gray-500"><QIcon name="calendar" className="w-3.5 h-3.5" />Date</p>
                      <p className="text-sm font-semibold text-gray-900 mt-0.5">{formatDay(c.attendance_date)}</p>
                    </div>
                    <div className="rounded-xl bg-gray-50 px-3 py-2">
                      <p className="flex items-center gap-1 text-[11px] text-gray-500">
                        <QIcon name="clock" className="w-3.5 h-3.5" />
                        {c.claim_type === 'missed_both' ? 'In → Out' : c.claim_type === 'missed_in' ? 'Claimed in' : 'Claimed out'}
                      </p>
                      <p className="text-sm font-semibold text-gray-900 mt-0.5 tabular-nums">
                        {c.claim_type === 'missed_both'
                          ? formatClock(c.claimed_time) + ' – ' + formatClock(c.claimed_out_time)
                          : formatClock(c.claimed_time)}
                      </p>
                    </div>
                  </div>

                  {c.reason && (
                    <p className="mt-3 pl-3 border-l-2 border-blue-300 text-[13px] text-gray-700 leading-relaxed">{c.reason}</p>
                  )}
                  <p className="text-[11px] text-gray-400 mt-2">Submitted {formatDateTime(c.created_at)}</p>

                  {!isPending && c.reviewed_by_name && (
                    <p className={'text-xs mt-2 font-medium ' + (c.status === 'approved' ? 'text-emerald-700' : 'text-red-600')}>
                      {c.status === 'approved' ? 'Approved' : 'Rejected'} by {c.reviewed_by_name}
                      {c.reviewed_at && <span className="text-gray-400 font-normal"> · {formatDateTime(c.reviewed_at)}</span>}
                    </p>
                  )}
                </div>

                {/* Existing punches that day — mt-auto pins this and the
                    buttons to the card bottom, so they line up across a row */}
                {isPending && (
                  <div className="mt-auto border-t border-gray-100">
                    <button
                      onClick={function () { loadPunchContext(c) }}
                      className="w-full flex items-center justify-between px-4 py-2.5 text-xs font-semibold text-blue-600 hover:bg-blue-50/60"
                    >
                      {expandedClaim === c.claim_id ? 'Hide existing punches' : 'Show existing punches'}
                      <QIcon name="down" className={'w-4 h-4 transition-transform ' + (expandedClaim === c.claim_id ? 'rotate-180' : '')} />
                    </button>
                    {expandedClaim === c.claim_id && (
                      <div className="mx-4 mb-3 bg-blue-50/80 rounded-xl px-3 py-2.5">
                        {punchLoading ? (
                          <p className="text-xs text-blue-500">Loading…</p>
                        ) : claimPunches.length === 0 ? (
                          <p className="text-xs text-blue-600">No punches recorded for this date</p>
                        ) : (
                          <div className="space-y-2">
                            {claimPunches.map(function (p, i) {
                              var t = new Date(p.punched_at)
                              var timeStr = t.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' }).toUpperCase()
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
                                  {p.is_late_entry && <span className="text-amber-600 text-[10px]">(claim)</span>}
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
                        className="w-full h-10 text-sm font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-xl hover:bg-amber-100 transition-colors"
                      >
                        Your own claim — cannot review
                      </button>
                    ) : (
                      <div className="flex gap-2.5">
                        <button
                          onClick={function () { handleApprove(c) }}
                          disabled={saving}
                          className="flex-1 h-10 inline-flex items-center justify-center gap-1.5 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-sm shadow-emerald-700/20 disabled:opacity-40 transition-colors"
                        >
                          <QIcon name="check" className="w-4 h-4" />
                          Approve
                        </button>
                        <button
                          onClick={function () { setRejectTarget(c); setRejectReason('') }}
                          className="flex-1 h-10 inline-flex items-center justify-center gap-1.5 text-sm font-semibold text-red-600 bg-white border border-red-200 hover:bg-red-50 rounded-xl transition-colors"
                        >
                          <QIcon name="x" className="w-4 h-4" />
                          Reject
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
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-3 sm:p-4" onClick={function () { setSelfClaimNotice(null) }}>
          <div className="bg-white rounded-2xl p-5 sm:p-6 w-full max-w-sm text-center space-y-3 max-h-[88vh] overflow-y-auto md:max-h-none md:overflow-visible" onClick={function (e) { e.stopPropagation() }}>
            <div className="text-5xl">🚫</div>
            <h3 className="font-bold text-slate-800 text-base">Cannot review your own claim</h3>
            <p className="text-sm text-gray-600">
              This claim was submitted by you. To keep things fair, only another admin or manager can approve or reject your claim.
            </p>
            <p className="text-xs text-gray-400">
              Claim for {selfClaimNotice.attendance_date}
            </p>
            <button
              onClick={function () { setSelfClaimNotice(null) }}
              className="w-full bg-slate-800 text-white rounded-lg py-2 text-sm font-semibold mt-2"
            >
              Got it
            </button>
          </div>
        </div>
      )}

      {/* Reject reason modal */}
      {rejectTarget && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-3 sm:p-4" onClick={function () { setRejectTarget(null) }}>
          <div className="bg-white rounded-xl w-full max-w-sm shadow-xl max-h-[88vh] overflow-y-auto md:max-h-none md:overflow-visible" onClick={function (e) { e.stopPropagation() }}>
            <div className="px-5 py-4 border-b border-gray-100">
              <h3 className="text-sm font-bold text-gray-900">Reject Claim</h3>
              <p className="text-xs text-gray-500">{rejectTarget.employee_name} · {rejectTarget.attendance_date}</p>
            </div>
            <div className="px-5 py-4 space-y-3">
              <div>
                <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1">Reason for rejection *</label>
                <textarea value={rejectReason} onChange={function (e) { setRejectReason(e.target.value) }}
                  rows={2} maxLength={500} placeholder="Why is this claim being rejected?"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-700 resize-none"
                  autoFocus />
              </div>
              <div className="flex gap-2">
                <button onClick={function () { setRejectTarget(null) }}
                  className="flex-1 py-2 text-sm text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors">Cancel</button>
                <button onClick={handleReject} disabled={saving || !rejectReason.trim()}
                  className="flex-1 py-2 text-sm text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-40 transition-colors font-medium">
                  {saving ? 'Rejecting…' : 'Reject'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-4 left-4 right-4 sm:left-auto sm:bottom-6 sm:right-6 bg-slate-800 text-white px-5 py-3 rounded-xl text-sm shadow-lg z-50">
          {toast}
        </div>
      )}
    </div>
  )
}

function formatDateTime(isoString) {
  if (!isoString) return ''
  var d = new Date(isoString)
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) + ' ' +
    d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true }).toUpperCase()
}

// "2026-10-17" -> "Sat, 17 Oct"
function formatDay(dateStr) {
  if (!dateStr) return '—'
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })
}

// "13:35:00" -> "1:35 PM"
function formatClock(timeStr) {
  if (!timeStr) return '—'
  var parts = String(timeStr).split(':')
  var h = Number(parts[0])
  return ((h % 12) || 12) + ':' + (parts[1] || '00') + ' ' + (h < 12 ? 'AM' : 'PM')
}

// Line icons for the claims page (24x24)
function QIcon({ name, className }) {
  var paths = {
    search: <><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></>,
    left: <path d="M15 18l-6-6 6-6" />,
    right: <path d="M9 6l6 6-6 6" />,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></>,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    down: <path d="M6 9l6 6 6-6" />,
    check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
    x: <path d="M6 6l12 12M18 6L6 18" />,
    doc: <><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" /><path d="M14 3v6h6M9 15.5l1.5 1.5 4-4" /></>,
    alert: <><path d="M12 9v4M12 17h.01" /><path d="M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" /></>
  }
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>
  )
}
