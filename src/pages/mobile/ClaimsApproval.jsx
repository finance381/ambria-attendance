import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/useAuth'
import { useLanguage } from '../../lib/i18n'

var STATUS_COLORS = {
  pending: 'bg-amber-50 text-amber-700 border-amber-200',
  approved: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  rejected: 'bg-red-50 text-red-600 border-red-200'
}

var STATUS_CHIPS = [
  { id: '', label: 'All' },
  { id: 'pending', label: 'Pending' },
  { id: 'approved', label: 'Approved' },
  { id: 'rejected', label: 'Rejected' },
]

export default function ClaimsApproval() {
  var { t } = useLanguage()
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

    showToast(claim.employee_name + ' — claim approved')
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

  var visibleClaims = monthClaims.filter(function (c) {
    if (search) {
      var q = search.toLowerCase()
      if (!c.employee_name.toLowerCase().includes(q) && !c.emp_code.toLowerCase().includes(q)) return false
    }
    return true
  })

  return (
    <div>
      <div className="mb-3">
        <h2 className="text-lg font-bold text-gray-900">Approve Claims</h2>
        <p className="text-xs text-gray-500">
          {monthClaims.length} claim{monthClaims.length !== 1 ? 's' : ''} this month
          {pendingCount > 0 && <span className="ml-1 text-amber-600 font-semibold">· {pendingCount} pending</span>}
        </p>
      </div>

      {/* Month nav */}
      <div className="flex items-center justify-center gap-1 mb-3">
        <button onClick={function () { if (mMonth === 1) { setMMonth(12); setMYear(mYear - 1) } else setMMonth(mMonth - 1) }}
          className="px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-sm active:bg-gray-100">←</button>
        <span className="px-3 py-1.5 text-sm font-semibold text-gray-700 min-w-[110px] text-center">
          {['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][mMonth - 1]} {mYear}
        </span>
        <button onClick={function () {
            var now = new Date(); if (mYear === now.getFullYear() && mMonth === now.getMonth() + 1) return;
            if (mMonth === 12) { setMMonth(1); setMYear(mYear + 1) } else setMMonth(mMonth + 1)
          }}
          disabled={mYear === new Date().getFullYear() && mMonth === new Date().getMonth() + 1}
          className="px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-sm active:bg-gray-100 disabled:opacity-30">→</button>
      </div>

      {/* Status chips */}
      <div className="flex gap-1.5 mb-2 overflow-x-auto pb-1 -mx-4 px-4">
        {STATUS_CHIPS.map(function (chip) {
          var active = statusFilter === chip.id
          return (
            <button key={chip.id} onClick={function () { setStatusFilter(chip.id) }}
              className={'flex-shrink-0 px-3 py-1.5 text-xs font-semibold rounded-full border transition-colors ' +
                (active ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-gray-600 border-gray-200')}>
              {chip.label}
            </button>
          )
        })}
      </div>

      {/* Department + search */}
      <div className="space-y-2 mb-4">
        <select value={deptFilter} onChange={function (e) { setDeptFilter(e.target.value) }}
          className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-700 bg-white">
          <option value="">All Departments</option>
          {departments.map(function (d) { return <option key={d.id} value={d.id}>{d.name}</option> })}
        </select>
        <input type="text" value={search} onChange={function (e) { setSearch(e.target.value) }}
          placeholder="Search name or code…"
          className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-700" />
      </div>

      {loading ? (
        <p className="text-sm text-gray-400 text-center py-12">{t('loading')}</p>
      ) : visibleClaims.length === 0 ? (
        <div className="text-center py-12">
          <div className="w-14 h-14 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3">
            <span className="text-2xl">📝</span>
          </div>
          <p className="text-sm text-gray-500">
            {statusFilter ? 'No ' + statusFilter + ' claims' : 'No claims this month'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {visibleClaims.map(function (c) {
            var isPending = c.status === 'pending'
            return (
              <div key={c.claim_id} className={'border rounded-xl p-3 ' +
                (c.is_over_limit ? 'bg-red-50/30 border-red-200' : 'bg-white border-gray-200')}>
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{c.employee_name}</p>
                    <p className="text-[11px] text-gray-400 truncate">{c.emp_code} · {c.department_name}</p>
                  </div>
                  <span className={'flex-shrink-0 text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border ' +
                    (STATUS_COLORS[c.status] || 'bg-gray-100 text-gray-500 border-gray-200')}>
                    {c.status}
                  </span>
                </div>

                <div className="flex items-center gap-1.5 flex-wrap mb-2">
                  {c.is_over_limit && (
                    <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-red-600 text-white">
                      ⚠ Over Limit
                    </span>
                  )}
                  <span className={'text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ' +
                    (c.claim_type === 'missed_both' ? 'bg-purple-100 text-purple-700' : c.claim_type === 'missed_in' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-600')}>
                    {c.claim_type === 'missed_both' ? 'In & Out' : c.claim_type === 'missed_in' ? 'Missed In' : 'Missed Out'}
                  </span>
                </div>

                <div className="bg-gray-50 rounded-lg px-3 py-2 mb-3">
                  <div className="flex items-center justify-between text-xs flex-wrap gap-1">
                    <span className="text-gray-500">Date: <strong className="text-gray-700">{c.attendance_date}</strong></span>
                    <span className="text-gray-500">
                      {c.claim_type === 'missed_both' ? (
                        <>In: <strong className="font-mono text-gray-700">{c.claimed_time}</strong> · Out: <strong className="font-mono text-gray-700">{c.claimed_out_time}</strong></>
                      ) : (
                        <>Time: <strong className="font-mono text-gray-700">{c.claimed_time}</strong></>
                      )}
                    </span>
                  </div>
                  <p className="text-xs text-gray-600 mt-1">Reason: {c.reason}</p>
                  <p className="text-[10px] text-gray-400 mt-1">
                    Submitted {formatDateTime(c.created_at)}
                  </p>
                </div>

                {isPending && (
                  <div className="mb-3">
                    <button
                      onClick={function () { loadPunchContext(c) }}
                      className="text-[10px] font-semibold text-blue-600 active:text-blue-800 transition-colors"
                    >
                      {expandedClaim === c.claim_id ? '▼ Hide existing punches' : '▶ Show existing punches'}
                    </button>
                    {expandedClaim === c.claim_id && (
                      <div className="mt-2 bg-blue-50 rounded-lg px-3 py-2">
                        {punchLoading ? (
                          <p className="text-[10px] text-blue-400">Loading…</p>
                        ) : claimPunches.length === 0 ? (
                          <p className="text-[10px] text-blue-500">No punches recorded for this date</p>
                        ) : (
                          <div className="space-y-1">
                            <p className="text-[10px] font-semibold text-blue-700 uppercase tracking-wider mb-1">Punches on {c.attendance_date}</p>
                            {claimPunches.map(function (p, i) {
                              var pt = new Date(p.punched_at)
                              var timeStr = pt.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' })
                              return (
                                <div key={i} className="flex items-center gap-2 text-[11px]">
                                  {p.selfie_path && (
                                    <img
                                      src={supabase.storage.from('selfies').getPublicUrl(p.selfie_path).data.publicUrl}
                                      className="w-8 h-8 rounded-full object-cover border border-blue-200 flex-shrink-0"
                                      alt=""
                                    />
                                  )}
                                  <span className={'font-bold uppercase ' + (p.punch_type === 'in' ? 'text-emerald-600' : 'text-red-500')}>
                                    {p.punch_type}
                                  </span>
                                  <span className="font-mono text-blue-800">{timeStr}</span>
                                  {(p.venues || p.location_name) && <span className="text-blue-400 truncate">· {p.venues ? p.venues.name : p.location_name}</span>}
                                  {p.is_late_entry && <span className="text-amber-500 text-[9px]">(claim)</span>}
                                </div>
                              )
                            })}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {!isPending && c.reviewed_by_name && (
                  <div className="text-[10px] text-gray-400 mb-3">
                    {c.status === 'approved' ? '✓ Approved' : '✗ Rejected'} by {c.reviewed_by_name}
                    {c.reviewed_at && <span> · {formatDateTime(c.reviewed_at)}</span>}
                  </div>
                )}

                {isPending && (
                  employee && c.employee_id === employee.id ? (
                    <button
                      onClick={function () { setSelfClaimNotice(c) }}
                      className="w-full py-2.5 text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-lg active:bg-amber-100 transition-colors"
                    >
                      🚫 Your own claim — cannot review
                    </button>
                  ) : (
                    <div className="flex gap-2">
                      <button
                        onClick={function () { handleApprove(c) }}
                        disabled={saving}
                        className="flex-1 py-2.5 text-xs font-semibold text-white bg-emerald-600 rounded-lg active:bg-emerald-700 disabled:opacity-40 transition-colors"
                      >
                        Approve
                      </button>
                      <button
                        onClick={function () { setRejectTarget(c); setRejectReason('') }}
                        className="flex-1 py-2.5 text-xs font-semibold text-red-600 bg-red-50 rounded-lg active:bg-red-100 transition-colors"
                      >
                        Reject
                      </button>
                    </div>
                  )
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
              className="w-full bg-slate-800 text-white rounded-lg py-2.5 text-sm font-semibold mt-2"
            >
              Got it
            </button>
          </div>
        </div>
      )}

      {/* Reject reason modal */}
      {rejectTarget && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={function () { setRejectTarget(null) }}>
          <div className="bg-white rounded-xl w-full max-w-sm shadow-xl" onClick={function (e) { e.stopPropagation() }}>
            <div className="px-5 py-4 border-b border-gray-100">
              <h3 className="text-sm font-bold text-gray-900">Reject Claim</h3>
              <p className="text-xs text-gray-500">{rejectTarget.employee_name} · {rejectTarget.attendance_date}</p>
            </div>
            <div className="px-5 py-4 space-y-3">
              <div>
                <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1">Reason for rejection *</label>
                <textarea value={rejectReason} onChange={function (e) { setRejectReason(e.target.value) }}
                  rows={3} maxLength={500} placeholder="Why is this claim being rejected?"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-700 resize-none"
                  autoFocus />
              </div>
              <div className="flex gap-2">
                <button onClick={function () { setRejectTarget(null) }}
                  className="flex-1 py-2.5 text-sm text-gray-600 bg-gray-100 rounded-lg active:bg-gray-200 transition-colors">Cancel</button>
                <button onClick={handleReject} disabled={saving || !rejectReason.trim()}
                  className="flex-1 py-2.5 text-sm text-white bg-red-600 rounded-lg active:bg-red-700 disabled:opacity-40 transition-colors font-medium">
                  {saving ? 'Rejecting…' : 'Reject'}
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

function formatDateTime(isoString) {
  if (!isoString) return ''
  var d = new Date(isoString)
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) + ' ' +
    d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })
}
