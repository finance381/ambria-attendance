import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../../lib/supabase'
import { captureProxyPhoto } from '../../lib/camera'
import { getLocation } from '../../lib/gps'
import { useLanguage } from '../../lib/i18n'
import MiniIcon from '../../components/MiniIcon'

// Day-wise, token-based casual-worker flow: guard writes a name (optional)
// and a physical token number, punches that token in/out, and can send it
// between venues where the destination guard accepts (with a confirm photo)
// or declines. Replaces the old vendor/is_casual-employee casual tabs here —
// those stay intact in the DB for CasualReports/Vendors/payroll history,
// just no longer fed from this screen.
export default function CasualTokenPunch({ showToast }) {
  var { t } = useLanguage()

  var [tab, setTab] = useState('add')
  var [depts, setDepts] = useState([])
  var [venues, setVenues] = useState([])
  var [list, setList] = useState([])
  var [listLoading, setListLoading] = useState(true)
  var [submitting, setSubmitting] = useState(false)

  // "My venue" — GPS-resolved, but always overridable (GPS can fail or be
  // denied, and that must never lock a guard out of Send/Incoming).
  var [myVenueId, setMyVenueId] = useState('')
  var venueTouchedRef = useRef(false)

  // Add Worker
  var [dept, setDept] = useState('')
  var [name, setName] = useState('')
  var [token, setToken] = useState('')
  var [addStep, setAddStep] = useState('form')
  var [lastResult, setLastResult] = useState(null)

  // Punch Out
  var [outQuery, setOutQuery] = useState('')
  var [outStep, setOutStep] = useState('list')
  var [outEntry, setOutEntry] = useState(null)
  var [outResult, setOutResult] = useState(null)

  // Transfer
  var [transferSub, setTransferSub] = useState('send')
  var [selected, setSelected] = useState({})
  var [sendDest, setSendDest] = useState('')
  var [cancelingId, setCancelingId] = useState(null)
  var [incoming, setIncoming] = useState([])
  var [decliningId, setDecliningId] = useState(null)
  var [incomingStep, setIncomingStep] = useState('list')
  var [acceptEntry, setAcceptEntry] = useState(null)
  var [acceptResult, setAcceptResult] = useState(null)

  var loadList = useCallback(async function () {
    var { data, error } = await supabase.rpc('casual_token_list')
    if (error || (data && data.error)) {
      showToast((data && data.error) || error.message)
      setList([])
    } else {
      setList(Array.isArray(data) ? data : [])
    }
    setListLoading(false)
  }, [showToast])

  var loadIncoming = useCallback(async function (venueId) {
    if (!venueId) { setIncoming([]); return }
    var { data, error } = await supabase.rpc('casual_token_incoming', { p_venue_id: venueId })
    if (error || (data && data.error)) {
      showToast((data && data.error) || error.message)
      setIncoming([])
    } else {
      setIncoming(Array.isArray(data) ? data : [])
    }
  }, [showToast])

  var refreshVenue = useCallback(async function () {
    var gps
    try { gps = await getLocation() } catch { gps = { latitude: null, longitude: null } }
    var { data, error } = await supabase.rpc('casual_token_my_venue', { p_latitude: gps.latitude, p_longitude: gps.longitude })
    if (!error && data && !data.error && !venueTouchedRef.current) {
      setMyVenueId(data.venue_id ? String(data.venue_id) : '')
    }
  }, [])

  useEffect(function () {
    (async function () {
      var [deptRes, venueRes] = await Promise.all([
        supabase.from('departments').select('id, name').eq('active', true).order('name'),
        supabase.from('venues').select('id, name').eq('active', true).order('name')
      ])
      setDepts(deptRes.data || [])
      setVenues(venueRes.data || [])
    })()
    loadList()
    refreshVenue()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Incoming is scoped to whichever venue is currently selected (GPS-resolved
  // or manually picked) — re-fetch whenever that changes, and clear it
  // outright when no venue is known rather than leaving a stale list on screen.
  useEffect(function () {
    loadIncoming(myVenueId ? Number(myVenueId) : null)
  }, [myVenueId, loadIncoming])

  // A guard's phone can sleep mid-shift — refresh on return so statuses and
  // incoming transfers never act on stale data.
  useEffect(function () {
    function onVis() {
      if (document.visibilityState === 'visible') { loadList(); refreshVenue() }
    }
    document.addEventListener('visibilitychange', onVis)
    return function () { document.removeEventListener('visibilitychange', onVis) }
  }, [loadList, refreshVenue])

  function deptName(id) {
    var d = depts.find(function (x) { return x.id === id })
    return d ? d.name : '—'
  }

  function onVenueChange(e) {
    venueTouchedRef.current = true
    setMyVenueId(e.target.value)
  }

  // ---------- Add Worker ----------
  function onSubmitAdd(e) {
    e.preventDefault()
    if (!dept) { showToast(t('team_ct_err_dept')); return }
    if (!token.trim()) { showToast(t('team_ct_err_token')); return }
    setAddStep('camera')
  }

  async function doCaptureAdd() {
    if (submitting) return
    var tok = token.trim()
    setSubmitting(true)
    try {
      var photo
      try {
        photo = await captureProxyPhoto(name.trim() || ('#' + tok))
      } catch (err) {
        if (err.message !== 'Cancelled') showToast(t('team_ct_camera_error', { msg: err.message }))
        return
      }

      var gps
      try { gps = await getLocation() } catch { gps = { latitude: null, longitude: null, accuracy: null } }

      var today = new Date().toISOString().slice(0, 10)
      var filePath = 'casual/' + today + '_' + tok.replace(/[^a-zA-Z0-9_-]/g, '_') + '_in_' + Date.now() + '.jpg'

      var { error: uploadError } = await supabase.storage
        .from('selfies')
        .upload(filePath, photo.blob, { contentType: 'image/jpeg', upsert: false })
      if (uploadError) { showToast(t('team_ct_upload_failed', { msg: uploadError.message })); return }

      var { data, error } = await supabase.rpc('casual_token_add_punch_in', {
        p_department_id: Number(dept),
        p_token: tok,
        p_name: name.trim() || null,
        p_selfie_path: filePath,
        p_latitude: gps.latitude,
        p_longitude: gps.longitude,
        p_gps_accuracy: gps.accuracy,
        p_device_info: navigator.userAgent
      })

      if (error || (data && data.error)) { showToast((data && data.error) || error.message); return }

      setLastResult(data)
      setName('')
      setToken('')
      setAddStep('done')
      loadList()
    } finally {
      setSubmitting(false)
    }
  }

  // ---------- Punch Out ----------
  function selectOut(entry) {
    setOutEntry(entry)
    setOutStep('camera')
  }

  async function doCapturePunchOut() {
    if (submitting) return
    var entry = outEntry
    setSubmitting(true)
    try {
      var photo
      try {
        photo = await captureProxyPhoto(entry.name || ('#' + entry.token))
      } catch (err) {
        if (err.message !== 'Cancelled') showToast(t('team_ct_camera_error', { msg: err.message }))
        return
      }

      var gps
      try { gps = await getLocation() } catch { gps = { latitude: null, longitude: null, accuracy: null } }

      var today = new Date().toISOString().slice(0, 10)
      var filePath = 'casual/' + today + '_' + entry.token.replace(/[^a-zA-Z0-9_-]/g, '_') + '_out_' + Date.now() + '.jpg'

      var { error: uploadError } = await supabase.storage
        .from('selfies')
        .upload(filePath, photo.blob, { contentType: 'image/jpeg', upsert: false })
      if (uploadError) { showToast(t('team_ct_upload_failed', { msg: uploadError.message })); return }

      var { data, error } = await supabase.rpc('casual_token_punch_out', {
        p_token: entry.token,
        p_selfie_path: filePath,
        p_latitude: gps.latitude,
        p_longitude: gps.longitude,
        p_gps_accuracy: gps.accuracy,
        p_device_info: navigator.userAgent
      })

      if (error || (data && data.error)) { showToast((data && data.error) || error.message); return }

      setOutResult(data)
      setOutStep('done')
      loadList()
    } finally {
      setSubmitting(false)
    }
  }

  // ---------- Transfer: Send ----------
  function toggleSelect(tok) {
    var next = Object.assign({}, selected)
    if (next[tok]) { delete next[tok] } else { next[tok] = true }
    setSelected(next)
  }

  async function doSend() {
    var tokens = Object.keys(selected)
    if (tokens.length === 0) return
    if (!sendDest) { showToast(t('team_ct_err_dest')); return }

    setSubmitting(true)
    try {
      var { data, error } = await supabase.rpc('casual_token_send_transfer', {
        p_tokens: tokens,
        p_to_venue_id: Number(sendDest)
      })
      if (error || (data && data.error)) { showToast((data && data.error) || error.message); return }

      var msg = data.transferred_count + ' → ' + data.to_venue_name
      if (data.transferred_count < tokens.length) {
        msg += ' (' + (tokens.length - data.transferred_count) + ' could not be moved)'
      }
      showToast(msg)
      setSelected({})
      setSendDest('')
      loadList()
    } finally {
      setSubmitting(false)
    }
  }

  async function doCancelTransfer(entry) {
    setCancelingId(entry.pending_transfer_id)
    try {
      var { data, error } = await supabase.rpc('casual_token_cancel_transfer', { p_transfer_id: entry.pending_transfer_id })
      if (error || (data && data.error)) {
        showToast((data && data.error) || error.message)
      } else {
        showToast((data.name || entry.token) + ' — transfer cancelled')
      }
      loadList()
    } finally {
      setCancelingId(null)
    }
  }

  // ---------- Transfer: Incoming ----------
  function selectAccept(entry) {
    setAcceptEntry(entry)
    setIncomingStep('camera')
  }

  async function doCaptureAccept() {
    if (submitting) return
    var entry = acceptEntry
    setSubmitting(true)
    try {
      var photo
      try {
        photo = await captureProxyPhoto(entry.name || ('#' + entry.token))
      } catch (err) {
        if (err.message !== 'Cancelled') showToast(t('team_ct_camera_error', { msg: err.message }))
        return
      }

      var gps
      try { gps = await getLocation() } catch { gps = { latitude: null, longitude: null, accuracy: null } }

      var today = new Date().toISOString().slice(0, 10)
      var filePath = 'casual/' + today + '_' + entry.token.replace(/[^a-zA-Z0-9_-]/g, '_') + '_transfer_' + Date.now() + '.jpg'

      var { error: uploadError } = await supabase.storage
        .from('selfies')
        .upload(filePath, photo.blob, { contentType: 'image/jpeg', upsert: false })
      if (uploadError) { showToast(t('team_ct_upload_failed', { msg: uploadError.message })); return }

      var { data, error } = await supabase.rpc('casual_token_accept_transfer', {
        p_transfer_id: entry.transfer_id,
        p_selfie_path: filePath,
        p_latitude: gps.latitude,
        p_longitude: gps.longitude,
        p_gps_accuracy: gps.accuracy,
        p_device_info: navigator.userAgent
      })

      if (error || (data && data.error)) {
        showToast((data && data.error) || error.message)
        loadIncoming(myVenueId ? Number(myVenueId) : null)
        return
      }

      setAcceptResult(data)
      setIncomingStep('done')
      loadList()
      loadIncoming(myVenueId ? Number(myVenueId) : null)
    } finally {
      setSubmitting(false)
    }
  }

  async function doDecline(entry) {
    setDecliningId(entry.transfer_id)
    try {
      var { data, error } = await supabase.rpc('casual_token_decline_transfer', { p_transfer_id: entry.transfer_id })
      if (error || (data && data.error)) {
        showToast((data && data.error) || error.message)
      } else {
        showToast((data.name || entry.token) + ' ' + t('team_ct_declined'))
      }
      loadList()
      loadIncoming(myVenueId ? Number(myVenueId) : null)
    } finally {
      setDecliningId(null)
    }
  }

  // ---------- derived ----------
  var myVenueName = (venues.find(function (v) { return String(v.id) === myVenueId }) || {}).name || ''

  var outList = list.filter(function (w) { return w.status === 'in' })
    .filter(function (w) {
      if (!outQuery.trim()) return true
      var q = outQuery.trim().toLowerCase()
      return w.token.toLowerCase().indexOf(q) === 0 || (w.name || '').toLowerCase().indexOf(q) >= 0
    })

  var sendableList = list.filter(function (w) { return w.status === 'in' && myVenueId && w.venue_id === Number(myVenueId) })
  var selectedCount = Object.keys(selected).length
  var pendingOutList = list.filter(function (w) { return w.status === 'transit' })
  var destOptions = venues.filter(function (v) { return String(v.id) !== myVenueId })

  if (listLoading) {
    return <p className="text-sm text-slate-500 text-center py-12">{t('loading')}</p>
  }

  return (
    <div>
      <div className="flex items-center gap-1.5 mb-3">
        <MiniIcon name="pin" className="w-3.5 h-3.5 text-slate-500 shrink-0" />
        <select
          value={myVenueId}
          onChange={onVenueChange}
          className="flex-1 min-w-0 text-xs text-slate-600 border-0 bg-transparent outline-none font-semibold"
        >
          <option value="">{t('team_ct_select_venue')}</option>
          {venues.map(function (v) { return <option key={v.id} value={v.id}>{v.name}</option> })}
        </select>
      </div>

      <div className="flex gap-1 neu rounded-2xl p-1.5 mb-5">
        <button onClick={function () { setTab('add') }}
          className={'flex-1 py-2 text-xs font-semibold rounded-xl transition-colors ' + (tab === 'add' ? 'neu-on text-blue-600' : 'text-gray-600')}>
          {t('team_ct_tab_add')}
        </button>
        <button onClick={function () { setTab('out') }}
          className={'flex-1 py-2 text-xs font-semibold rounded-xl transition-colors ' + (tab === 'out' ? 'neu-on text-blue-600' : 'text-gray-600')}>
          {t('team_ct_tab_out')}
        </button>
        <button onClick={function () { setTab('transfer') }}
          className={'flex-1 py-2 text-xs font-semibold rounded-xl transition-colors ' + (tab === 'transfer' ? 'neu-on text-blue-600' : 'text-gray-600')}>
          {t('team_ct_tab_transfer')}
          {incoming.length > 0 && (
            <span className="ml-1 text-[10px] px-1.5 py-0.5 rounded-full bg-red-500 text-white">{incoming.length}</span>
          )}
        </button>
      </div>

      {/* ===================== ADD WORKER ===================== */}
      {tab === 'add' && (
        <div>
          {addStep === 'form' && (
            <form onSubmit={onSubmitAdd} className="neu rounded-2xl p-4 space-y-3 mb-5">
              <div>
                <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1">{t('team_ct_department')} *</label>
                <select value={dept} onChange={function (e) { setDept(e.target.value) }}
                  className="w-full px-3 py-2 border-0 neu-inset rounded-xl text-sm text-gray-900 outline-none focus:outline-2 focus:outline-blue-400/60">
                  <option value="">{t('team_ct_select_dept')}</option>
                  {depts.map(function (d) { return <option key={d.id} value={d.id}>{d.name}</option> })}
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1">{t('team_ct_worker_name')}</label>
                <input type="text" value={name} onChange={function (e) { setName(e.target.value) }}
                  placeholder={t('team_ct_name_ph')}
                  className="w-full px-3 py-2 border-0 neu-inset rounded-xl text-sm text-gray-900 outline-none focus:outline-2 focus:outline-blue-400/60" />
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1">{t('team_ct_token')} *</label>
                <input type="text" inputMode="numeric" value={token} onChange={function (e) { setToken(e.target.value) }}
                  placeholder={t('team_ct_token_ph')}
                  className="w-full px-3 py-2 border-0 neu-inset rounded-xl text-base font-semibold text-gray-900 outline-none focus:outline-2 focus:outline-blue-400/60" />
              </div>
              <button type="submit"
                className="w-full py-2.5 text-sm text-white bg-slate-800 rounded-lg shadow-md shadow-slate-800/30 hover:bg-slate-900 transition-colors font-medium">
                {t('team_ct_add_btn')}
              </button>
            </form>
          )}

          {addStep === 'camera' && (
            <div className="neu rounded-2xl p-4 mb-5">
              <p className="text-sm font-bold text-gray-900 mb-1">{t('team_ct_take_photo_in')}</p>
              <p className="text-xs text-slate-500 mb-3">
                {(name.trim() || t('team_ct_worker_name')) + ' · ' + deptName(Number(dept)) + ' · #' + token.trim()}
                <br />{t('team_ct_punching_in_at', { venue: myVenueName || '…' })}
              </p>
              <div className="h-44 rounded-xl border-2 border-dashed border-gray-300 bg-gray-50 flex items-center justify-center mb-3">
                <MiniIcon name="camera" className="w-10 h-10 text-gray-400" />
              </div>
              <button onClick={doCaptureAdd} disabled={submitting}
                className="w-full py-2.5 text-sm text-white bg-slate-800 rounded-lg shadow-md shadow-slate-800/30 hover:bg-slate-900 disabled:opacity-40 transition-colors font-medium mb-2">
                {submitting ? t('team_uploading') : t('team_ct_capture')}
              </button>
              <button onClick={function () { setAddStep('form') }} disabled={submitting}
                className="w-full py-2 text-sm text-slate-500 font-medium">
                {t('cancel')}
              </button>
            </div>
          )}

          {addStep === 'done' && lastResult && (
            <div className="neu rounded-2xl p-6 mb-5 flex flex-col items-center text-center">
              <MiniIcon name="checkCircle" className="w-11 h-11 text-emerald-500 mb-3" />
              <p className="text-base font-bold text-gray-900 mb-1">{t('team_ct_punched_in', { name: lastResult.name || ('#' + lastResult.token) })}</p>
              <p className="text-xs text-slate-500 mb-4">#{lastResult.token}{lastResult.venue_name ? ' · ' + lastResult.venue_name : ''}</p>
              <button onClick={function () { setAddStep('form') }}
                className="w-full py-2.5 text-sm text-white bg-slate-800 rounded-lg shadow-md shadow-slate-800/30 hover:bg-slate-900 transition-colors font-medium">
                {t('team_ct_add_another')}
              </button>
            </div>
          )}

          <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-2">{t('team_ct_today')} · {list.length}</p>
          <div className="space-y-2">
            {list.map(function (w) {
              var pillLabel = w.status === 'in' ? t('team_ct_pill_in') : w.status === 'transit' ? t('team_ct_pending') : t('team_ct_pill_out')
              var pillClass = w.status === 'in' ? 'bg-emerald-100 text-emerald-700'
                : w.status === 'transit' ? 'bg-amber-100 text-amber-700'
                : 'bg-slate-200/70 text-slate-600'
              var venueLine = w.status === 'transit' && w.pending_to_venue_name
                ? (w.venue_name || '—') + ' → ' + w.pending_to_venue_name
                : (w.venue_name || '—')
              return (
                <div key={w.id} className="neu rounded-2xl px-4 py-3 flex items-center justify-between">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{w.name || '—'} <span className="text-slate-400 font-normal">· {w.department_name}</span></p>
                    <p className="text-[11px] text-slate-500 truncate">
                      <span className="neu-inset rounded px-1 py-0.5 mr-1 font-semibold text-slate-700">#{w.token}</span>{venueLine}
                    </p>
                  </div>
                  <span className={'ml-2 shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full ' + pillClass}>{pillLabel}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ===================== PUNCH OUT ===================== */}
      {tab === 'out' && (
        <div>
          {outStep === 'list' && (
            <>
              <input
                type="text"
                value={outQuery}
                onChange={function (e) { setOutQuery(e.target.value) }}
                placeholder={t('team_ct_search_out_ph')}
                className="w-full px-3 py-2 border-0 neu-inset rounded-xl text-sm text-gray-900 outline-none focus:outline-2 focus:outline-blue-400/60 mb-4"
              />
              <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-2">
                {outQuery.trim() ? t('team_ct_results') : t('team_ct_currently_in', { n: outList.length })}
              </p>
              {outList.length === 0 ? (
                <p className="text-sm text-slate-500 text-center py-8">{t('team_ct_no_match_out', { q: outQuery })}</p>
              ) : (
                <div className="space-y-2">
                  {outList.map(function (w) {
                    return (
                      <div key={w.id} className="neu rounded-2xl px-4 py-3 flex items-center justify-between">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">{w.name || '—'} <span className="text-slate-400 font-normal">· {w.department_name}</span></p>
                          <p className="text-[11px] text-slate-500 truncate">
                            <span className="neu-inset rounded px-1 py-0.5 mr-1 font-semibold text-slate-700">#{w.token}</span>{t('team_ct_in_since', { time: fmtTime(w.punched_in_at) })}
                          </p>
                        </div>
                        <button onClick={function () { selectOut(w) }}
                          className="ml-2 shrink-0 px-3 py-1.5 text-xs font-semibold text-white bg-red-500 rounded-lg shadow-md shadow-red-500/30 hover:bg-red-600 transition-colors">
                          {t('team_ct_tab_out')}
                        </button>
                      </div>
                    )
                  })}
                </div>
              )}
            </>
          )}

          {outStep === 'camera' && outEntry && (
            <div className="neu rounded-2xl p-4">
              <p className="text-sm font-bold text-gray-900 mb-1">{t('team_ct_take_photo_out')}</p>
              <p className="text-xs text-slate-500 mb-3">{(outEntry.name || '—') + ' · ' + outEntry.department_name + ' · #' + outEntry.token}</p>
              <div className="h-44 rounded-xl border-2 border-dashed border-gray-300 bg-gray-50 flex items-center justify-center mb-3">
                <MiniIcon name="camera" className="w-10 h-10 text-gray-400" />
              </div>
              <button onClick={doCapturePunchOut} disabled={submitting}
                className="w-full py-2.5 text-sm text-white bg-slate-800 rounded-lg shadow-md shadow-slate-800/30 hover:bg-slate-900 disabled:opacity-40 transition-colors font-medium mb-2">
                {submitting ? t('team_uploading') : t('team_ct_capture')}
              </button>
              <button onClick={function () { setOutStep('list'); setOutEntry(null) }} disabled={submitting}
                className="w-full py-2 text-sm text-slate-500 font-medium">
                {t('cancel')}
              </button>
            </div>
          )}

          {outStep === 'done' && outResult && (
            <div className="neu rounded-2xl p-6 flex flex-col items-center text-center">
              <MiniIcon name="checkCircle" className="w-11 h-11 text-emerald-500 mb-3" />
              <p className="text-base font-bold text-gray-900 mb-1">{t('team_ct_punched_out', { name: outResult.name || ('#' + outResult.token) })}</p>
              <p className="text-xs text-slate-500 mb-4">#{outResult.token}</p>
              <button onClick={function () { setOutStep('list'); setOutEntry(null); setOutQuery('') }}
                className="w-full py-2.5 text-sm text-white bg-slate-800 rounded-lg shadow-md shadow-slate-800/30 hover:bg-slate-900 transition-colors font-medium">
                {t('team_ct_back_to_search')}
              </button>
            </div>
          )}
        </div>
      )}

      {/* ===================== TRANSFER ===================== */}
      {tab === 'transfer' && (
        <div>
          <div className="flex gap-1 neu-inset rounded-xl p-1 mb-4">
            <button onClick={function () { setTransferSub('send') }}
              className={'flex-1 py-1.5 text-xs font-semibold rounded-lg transition-colors ' + (transferSub === 'send' ? 'neu-on text-blue-600' : 'text-gray-600')}>
              {t('team_ct_send_sub')}
            </button>
            <button onClick={function () { setTransferSub('incoming') }}
              className={'flex-1 py-1.5 text-xs font-semibold rounded-lg transition-colors ' + (transferSub === 'incoming' ? 'neu-on text-blue-600' : 'text-gray-600')}>
              {t('team_ct_incoming_sub')}
              {incoming.length > 0 && (
                <span className="ml-1 text-[10px] px-1.5 py-0.5 rounded-full bg-red-500 text-white">{incoming.length}</span>
              )}
            </button>
          </div>

          {transferSub === 'send' && (
            <div>
              <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-2">{t('team_ct_select_to_move', { n: sendableList.length })}</p>
              {sendableList.length === 0 ? (
                <p className="text-sm text-slate-500 text-center py-6">{t('team_ct_no_sendable')}</p>
              ) : (
                <div className="space-y-2 mb-4">
                  {sendableList.map(function (w) {
                    return (
                      <div key={w.id} onClick={function () { toggleSelect(w.token) }}
                        className={'neu rounded-2xl px-4 py-3 flex items-center gap-3 cursor-pointer ' + (selected[w.token] ? 'outline-2 outline-blue-400/70' : '')}>
                        <input type="checkbox" checked={!!selected[w.token]} readOnly
                          className="w-4 h-4 rounded border-gray-300 text-blue-600 shrink-0" />
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">{w.name || '—'} <span className="text-slate-400 font-normal">· {w.department_name}</span></p>
                          <p className="text-[11px] text-slate-500 truncate">
                            <span className="neu-inset rounded px-1 py-0.5 mr-1 font-semibold text-slate-700">#{w.token}</span>{w.venue_name}
                          </p>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}

              {selectedCount > 0 && (
                <div className="neu rounded-2xl p-4 mb-4 space-y-3">
                  <div>
                    <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1">{t('team_ct_move_to', { n: selectedCount })} *</label>
                    <select value={sendDest} onChange={function (e) { setSendDest(e.target.value) }}
                      className="w-full px-3 py-2 border-0 neu-inset rounded-xl text-sm text-gray-900 outline-none focus:outline-2 focus:outline-blue-400/60">
                      <option value="">{t('team_ct_select_venue')}</option>
                      {destOptions.map(function (v) { return <option key={v.id} value={v.id}>{v.name}</option> })}
                    </select>
                  </div>
                  <button onClick={doSend} disabled={!sendDest || submitting}
                    className="w-full py-2.5 text-sm text-white bg-slate-800 rounded-lg shadow-md shadow-slate-800/30 hover:bg-slate-900 disabled:opacity-40 transition-colors font-medium">
                    {submitting ? t('team_ct_sending') : t('team_ct_send_transfer')}
                  </button>
                </div>
              )}

              {pendingOutList.length > 0 && (
                <>
                  <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-2">{t('team_ct_pending_count', { n: pendingOutList.length })}</p>
                  <div className="space-y-2">
                    {pendingOutList.map(function (w) {
                      var isCanceling = cancelingId === w.pending_transfer_id
                      return (
                        <div key={w.id} className="rounded-2xl px-4 py-3 bg-amber-50 border border-amber-200 flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-gray-900 truncate">{w.name || '—'} <span className="text-slate-400 font-normal">· #{w.token}</span></p>
                            <p className="text-[11px] text-amber-700 truncate">{t('team_ct_pending_to', { venue: w.pending_to_venue_name || '—', time: fmtTime(w.pending_sent_at) })}</p>
                          </div>
                          <button onClick={function () { doCancelTransfer(w) }} disabled={isCanceling}
                            className="shrink-0 px-2.5 py-1 text-[11px] font-semibold text-amber-800 bg-amber-100 hover:bg-amber-200 rounded-lg disabled:opacity-40 transition-colors">
                            {isCanceling ? t('team_ct_sending') : t('cancel')}
                          </button>
                        </div>
                      )
                    })}
                  </div>
                </>
              )}
            </div>
          )}

          {transferSub === 'incoming' && (
            <div>
              {incomingStep === 'list' && (
                <>
                  <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-2">
                    {t('team_ct_incoming_to', { venue: myVenueName || '…', n: incoming.length })}
                  </p>
                  {incoming.length === 0 ? (
                    <p className="text-sm text-slate-500 text-center py-8">{t('team_ct_no_incoming')}</p>
                  ) : (
                    <div className="space-y-2">
                      {incoming.map(function (tr) {
                        var isDeclining = decliningId === tr.transfer_id
                        return (
                          <div key={tr.transfer_id} className="neu rounded-2xl px-4 py-3">
                            <p className="text-sm font-medium text-gray-900 mb-0.5">{tr.name || '—'} <span className="text-slate-400 font-normal">· {tr.department_name}</span></p>
                            <p className="text-[11px] text-slate-500 mb-2">
                              <span className="neu-inset rounded px-1 py-0.5 mr-1 font-semibold text-slate-700">#{tr.token}</span>{t('team_ct_from_venue', { venue: tr.from_venue_name || '—', time: fmtTime(tr.sent_at) })}
                            </p>
                            <div className="flex gap-2">
                              <button onClick={function () { selectAccept(tr) }} disabled={isDeclining}
                                className="flex-1 py-1.5 text-xs font-semibold text-white bg-emerald-600 rounded-lg shadow-md shadow-emerald-600/30 hover:bg-emerald-700 disabled:opacity-40 transition-colors">
                                {t('team_ct_accept')}
                              </button>
                              <button onClick={function () { doDecline(tr) }} disabled={isDeclining}
                                className="flex-1 py-1.5 text-xs font-semibold text-slate-700 neu-press rounded-lg disabled:opacity-40">
                                {isDeclining ? t('team_ct_sending') : t('team_ct_decline')}
                              </button>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </>
              )}

              {incomingStep === 'camera' && acceptEntry && (
                <div className="neu rounded-2xl p-4">
                  <p className="text-sm font-bold text-gray-900 mb-1">{t('team_ct_confirm_arrival')}</p>
                  <p className="text-xs text-slate-500 mb-3">{t('team_ct_take_photo_arrival', { name: acceptEntry.name || ('#' + acceptEntry.token), venue: myVenueName || '…' })}</p>
                  <div className="h-44 rounded-xl border-2 border-dashed border-gray-300 bg-gray-50 flex items-center justify-center mb-3">
                    <MiniIcon name="camera" className="w-10 h-10 text-gray-400" />
                  </div>
                  <button onClick={doCaptureAccept} disabled={submitting}
                    className="w-full py-2.5 text-sm text-white bg-slate-800 rounded-lg shadow-md shadow-slate-800/30 hover:bg-slate-900 disabled:opacity-40 transition-colors font-medium mb-2">
                    {submitting ? t('team_uploading') : t('team_ct_capture')}
                  </button>
                  <button onClick={function () { setIncomingStep('list'); setAcceptEntry(null) }} disabled={submitting}
                    className="w-full py-2 text-sm text-slate-500 font-medium">
                    {t('cancel')}
                  </button>
                </div>
              )}

              {incomingStep === 'done' && acceptResult && (
                <div className="neu rounded-2xl p-6 flex flex-col items-center text-center">
                  <MiniIcon name="checkCircle" className="w-11 h-11 text-emerald-500 mb-3" />
                  <p className="text-base font-bold text-gray-900 mb-1">{t('team_ct_now_at', { name: acceptResult.name || ('#' + acceptResult.token), venue: acceptResult.venue_name || myVenueName })}</p>
                  <p className="text-xs text-slate-500 mb-4">#{acceptResult.token}</p>
                  <button onClick={function () { setIncomingStep('list'); setAcceptEntry(null) }}
                    className="w-full py-2.5 text-sm text-white bg-slate-800 rounded-lg shadow-md shadow-slate-800/30 hover:bg-slate-900 transition-colors font-medium">
                    {t('team_ct_back_to_incoming')}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function fmtTime(isoString) {
  if (!isoString) return ''
  var d = new Date(isoString)
  return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })
}
