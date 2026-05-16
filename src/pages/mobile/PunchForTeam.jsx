import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { captureProxyPhoto } from '../../lib/camera'
import { getLocation } from '../../lib/gps'
import { useLanguage } from '../../lib/i18n'

export default function PunchForTeam() {
  var [departments, setDepartments] = useState([])
  var [casuals, setCasuals] = useState([])
  var [openPunches, setOpenPunches] = useState([])
  var [loading, setLoading] = useState(true)
  var [tab, setTab] = useState('punch')
  var [toast, setToast] = useState('')

  var [newDept, setNewDept] = useState('')
  var [addError, setAddError] = useState('')
  var [addSaving, setAddSaving] = useState(false)
  var [confirmExisting, setConfirmExisting] = useState(null)

  var [punchingId, setPunchingId] = useState(null)
  var [punchStep, setPunchStep] = useState('')
  var [punchSearch, setPunchSearch] = useState('')
  var [vendors, setVendors] = useState([])
  var [vendorId, setVendorId] = useState('')
  var [newVendorName, setNewVendorName] = useState('')
  var [newVendorPhone, setNewVendorPhone] = useState('')
  var [newVendorContact, setNewVendorContact] = useState('')
  var [removeTarget, setRemoveTarget] = useState(null)
  var [batchNames, setBatchNames] = useState([''])
  var [selectedIds, setSelectedIds] = useState({})
  var [showTransfer, setShowTransfer] = useState(false)
  var [transferVenue, setTransferVenue] = useState('')
  var [transferring, setTransferring] = useState(false)
  var [venues, setVenues] = useState([])
  var [incoming, setIncoming] = useState([])
  var [receivingId, setReceivingId] = useState(null)

  var [retroTarget, setRetroTarget] = useState(null)
  var [retroTime, setRetroTime] = useState('')
  var [retroSaving, setRetroSaving] = useState(false)
  var [retroError, setRetroError] = useState('')

  var { t } = useLanguage()

  var showToast = useCallback(function (msg) {
    setToast(msg)
    setTimeout(function () { setToast('') }, 2500)
  }, [])

  var loadAll = useCallback(async function () {
    var [deptRes, casualRes, openRes, vendorRes, venueRes, incomingRes] = await Promise.all([
      supabase.from('departments').select('id, name').eq('active', true).order('name'),
      supabase.rpc('casual_list'),
      supabase.rpc('open_punches'),
      supabase.from('vendors').select('id, name').eq('active', true).order('name'),
      supabase.from('venues').select('id, name').eq('active', true).order('name'),
      supabase.rpc('incoming_transfers')
    ])

    setDepartments(deptRes.data || [])
    setCasuals(Array.isArray(casualRes.data) ? casualRes.data : [])
    setOpenPunches(Array.isArray(openRes.data) ? openRes.data : [])
    setVendors(vendorRes.data || [])
    setVenues(venueRes.data || [])
    setIncoming(Array.isArray(incomingRes.data) ? incomingRes.data : [])
    setLoading(false)
  }, [])

  useEffect(function () { loadAll() }, [loadAll])

  function deptName(id) {
    var d = departments.find(function (d) { return d.id === id })
    return d ? d.name : '—'
  }

  async function handleBatchAdd(e) {
    e.preventDefault()
    setAddError('')

    var names = batchNames.map(function (n) { return n.trim() }).filter(function (n) { return n !== '' })
    if (names.length === 0) return setAddError('Add at least one name')
    if (!newDept) return setAddError(t('team_err_dept'))

    setAddSaving(true)

    // Create vendor inline if needed
    var finalVendorId = null
    if (vendorId === 'new') {
      if (!newVendorName.trim()) { setAddError('Vendor name is required'); setAddSaving(false); return }
      var { data: vData, error: vErr } = await supabase
        .from('vendors')
        .insert({ name: newVendorName.trim() })
        .select('id')
        .single()
      if (vErr) { setAddError('Vendor creation failed: ' + vErr.message); setAddSaving(false); return }
      finalVendorId = vData.id
    } else if (vendorId) {
      finalVendorId = Number(vendorId)
    }

    if (names.length === 1) {
      // Single add — use original RPC for duplicate detection
      var { data, error } = await supabase.rpc('add_casual', {
        p_name: names[0],
        p_department_id: Number(newDept),
        p_vendor_id: finalVendorId
      })

      setAddSaving(false)
      if (error) { setAddError(error.message); return }
      if (data && data.error) { setAddError(data.error); return }
      if (data && data.existing) { setConfirmExisting(data); return }

      showToast(data.name + ' (' + data.emp_code + ')')
    } else {
      // Batch add
      var { data, error } = await supabase.rpc('batch_add_casuals', {
        p_names: names,
        p_department_id: Number(newDept),
        p_vendor_id: finalVendorId
      })

      setAddSaving(false)
      if (error || (data && data.error)) { setAddError((data && data.error) || error.message); return }

      var msg = data.created_count + ' added'
      if (data.skipped_count > 0) msg += ', ' + data.skipped_count + ' skipped (duplicates)'
      showToast(msg)
    }

    setBatchNames([''])
    setNewDept('')
    setVendorId('')
    setNewVendorName('')
    loadAll()
  }

  async function handleForceCreate() {
    setAddSaving(true)
    var finalVendorId = vendorId && vendorId !== 'new' ? Number(vendorId) : null
    var { data, error } = await supabase.rpc('add_casual_force', {
      p_name: batchNames[0].trim(),
      p_department_id: Number(newDept),
      p_vendor_id: finalVendorId
    })

    setAddSaving(false)
    setConfirmExisting(null)

    if (error || (data && data.error)) {
      setAddError((data && data.error) || error.message)
      return
    }

    showToast(data.name + ' (' + data.emp_code + ')')
    setBatchNames([''])
    setNewDept('')
    setVendorId('')
    setNewVendorName('')
    loadAll()
  }

  function handleReuseExisting() {
    showToast(confirmExisting.name)
    setConfirmExisting(null)
    setBatchNames([''])
    setNewDept('')
    loadAll()
  }

  async function handleDeactivateCasual() {
    if (!removeTarget) return
    var { data, error } = await supabase.rpc('deactivate_casual', { p_employee_id: removeTarget.id })
    setRemoveTarget(null)
    if (error || (data && data.error)) {
      showToast((data && data.error) || error.message)
      return
    }
    showToast(data.name + ' removed')
    loadAll()
  }

  function toggleSelect(id) {
    var next = Object.assign({}, selectedIds)
    if (next[id]) { delete next[id] } else { next[id] = true }
    setSelectedIds(next)
  }

  var selectedCount = Object.keys(selectedIds).length

  async function handleTransfer() {
    if (!transferVenue) return
    setTransferring(true)

    var gps = await getLocation()

    var { data, error } = await supabase.rpc('initiate_transfer', {
      p_employee_ids: Object.keys(selectedIds),
      p_to_venue_id: Number(transferVenue),
      p_latitude: gps.latitude,
      p_longitude: gps.longitude,
      p_gps_accuracy: gps.accuracy,
      p_location_name: gps.areaName
    })

    setTransferring(false)
    setShowTransfer(false)
    setSelectedIds({})
    setTransferVenue('')

    if (error || (data && data.error)) {
      showToast((data && data.error) || error.message)
      return
    }

    var msg = data.transferred_count + ' transferred → ' + data.to_venue
    showToast(msg)

    // Fire push notification to all guards (async, non-blocking)
    supabase.rpc('notify_transfer', {
      p_to_venue: data.to_venue,
      p_count: data.transferred_count
    }).catch(function () {})

    loadAll()
  }

  async function handleReceive(mov) {
    setReceivingId(mov.movement_id)

    var photo
    try {
      photo = await captureProxyPhoto()
    } catch (err) {
      if (err.message === 'Cancelled') { setReceivingId(null); return }
      showToast('Camera error: ' + err.message)
      setReceivingId(null)
      return
    }

    var gps = await getLocation()

    var today = new Date().toISOString().slice(0, 10)
    var filePath = mov.employee_id + '/' + today + '_in_transfer_' + Date.now() + '.jpg'

    var { error: uploadError } = await supabase.storage
      .from('selfies')
      .upload(filePath, photo.blob, { contentType: 'image/jpeg', upsert: false })

    if (uploadError) {
      showToast('Upload failed: ' + uploadError.message)
      setReceivingId(null)
      return
    }

    var { data, error } = await supabase.rpc('receive_transfer', {
      p_movement_id: mov.movement_id,
      p_selfie_path: filePath,
      p_latitude: gps.latitude,
      p_longitude: gps.longitude,
      p_gps_accuracy: gps.accuracy,
      p_device_info: navigator.userAgent,
      p_location_name: gps.areaName
    })

    setReceivingId(null)

    if (error || (data && data.error)) {
      showToast((data && data.error) || error.message)
      return
    }

    showToast(data.name + ' received ✓')
    loadAll()
  }

  async function handleCancelTransfer(mov) {
    var { data, error } = await supabase.rpc('cancel_transfer', { p_movement_id: mov.movement_id })
    if (error || (data && data.error)) {
      showToast((data && data.error) || error.message)
      return
    }
    showToast(data.name + ' transfer cancelled')
    loadAll()
  }

  async function handleBulkReceive() {
    setReceivingId('bulk')

    var photo
    try {
      photo = await captureProxyPhoto()
    } catch (err) {
      if (err.message === 'Cancelled') { setReceivingId(null); return }
      showToast('Camera error: ' + err.message)
      setReceivingId(null)
      return
    }

    var gps = await getLocation()

    var today = new Date().toISOString().slice(0, 10)
    var filePath = 'bulk_receive/' + today + '_' + Date.now() + '.jpg'

    var { error: uploadError } = await supabase.storage
      .from('selfies')
      .upload(filePath, photo.blob, { contentType: 'image/jpeg', upsert: false })

    if (uploadError) {
      showToast('Upload failed: ' + uploadError.message)
      setReceivingId(null)
      return
    }

    var movIds = incoming.map(function (m) { return m.movement_id })

    var { data, error } = await supabase.rpc('bulk_receive_transfers', {
      p_movement_ids: movIds,
      p_selfie_path: filePath,
      p_latitude: gps.latitude,
      p_longitude: gps.longitude,
      p_gps_accuracy: gps.accuracy,
      p_device_info: navigator.userAgent,
      p_location_name: gps.areaName
    })

    setReceivingId(null)

    if (error || (data && data.error)) {
      showToast((data && data.error) || error.message)
      return
    }

    showToast(data.received_count + ' workers received ✓')
    loadAll()
  }

  async function handleProxyPunch(employee, punchType) {
    setPunchingId(employee.id)
    setPunchStep('camera')

    var photo
    try {
      photo = await captureProxyPhoto()
    } catch (err) {
      if (err.message === 'Cancelled') { setPunchingId(null); setPunchStep(''); return }
      showToast('Camera error: ' + err.message)
      setPunchingId(null); setPunchStep('')
      return
    }

    setPunchStep('uploading')

    var gps = await getLocation()

    var today = new Date().toISOString().slice(0, 10)
    var filePath = employee.id + '/' + today + '_' + punchType + '_proxy_' + Date.now() + '.jpg'

    var { error: uploadError } = await supabase.storage
      .from('selfies')
      .upload(filePath, photo.blob, { contentType: 'image/jpeg', upsert: false })

    if (uploadError) {
      showToast('Upload failed: ' + uploadError.message)
      setPunchingId(null); setPunchStep('')
      return
    }

    var { data, error } = await supabase.rpc('proxy_punch', {
      p_target_employee_id: employee.id,
      p_punch_type: punchType,
      p_selfie_path: filePath,
      p_latitude: gps.latitude,
      p_longitude: gps.longitude,
      p_gps_accuracy: gps.accuracy,
      p_device_info: navigator.userAgent,
      p_location_name: gps.areaName
    })

    setPunchingId(null)
    setPunchStep('')

    if (error || (data && data.error)) {
      showToast((data && data.error) || error.message)
      return
    }

    showToast(data.target_name + ' — ' + (punchType === 'in' ? t('team_punch_in') : t('team_punch_out')))
    loadAll()
  }

  async function handleRetroactive(e) {
    e.preventDefault()
    setRetroError('')

    if (!retroTime) return setRetroError(t('team_err_retro_time'))

    setRetroSaving(true)

    var { data, error } = await supabase.rpc('retroactive_punch_out', {
      p_target_employee_id: retroTarget.employee_id,
      p_attendance_date: retroTarget.attendance_date,
      p_out_time: retroTime + ':00'
    })

    setRetroSaving(false)

    if (error || (data && data.error)) {
      setRetroError((data && data.error) || error.message)
      return
    }

    showToast(data.target_name)
    setRetroTarget(null)
    setRetroTime('')
    loadAll()
  }

  function renderOpenCard(op) {
    var hoursAgo = Math.round((Date.now() - new Date(op.punched_in_at).getTime()) / 3600000)
    return (
      <div key={op.punch_id} className={'bg-white border rounded-xl px-4 py-3 ' +
        (hoursAgo > 12 ? 'border-amber-300 bg-amber-50/50' : 'border-gray-200')}>
        <div className="flex items-center justify-between mb-1">
          <div>
            <p className="text-sm font-medium text-gray-900">
              {op.name}
              {op.is_casual && <span className="ml-1 text-[9px] text-gray-400 bg-gray-100 px-1 rounded">{t('team_casual_tag')}</span>}
            </p>
            <p className="text-[11px] text-gray-400">
              {op.emp_code} · {op.department_name} · {formatTime(op.punched_in_at)}
            </p>
          </div>
          <span className="text-[10px] text-amber-600 font-semibold">{t('team_hours_ago', { n: hoursAgo })}</span>
        </div>
        <div className="flex gap-2 mt-2">
          <button
            onClick={function () { handleProxyPunch({ id: op.employee_id, name: op.name }, 'out') }}
            className="flex-1 py-1.5 text-xs font-semibold text-white bg-red-500 rounded-lg hover:bg-red-600 transition-colors"
          >
            {t('team_punch_out_now')}
          </button>
          <button
            onClick={function () { setRetroTarget(op); setRetroTime(''); setRetroError('') }}
            className="flex-1 py-1.5 text-xs font-semibold text-slate-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
          >
            {t('team_enter_time')}
          </button>
        </div>
      </div>
    )
  }

  if (loading) {
    return <p className="text-sm text-gray-400 text-center py-12">{t('loading')}</p>
  }

  var openIds = {}
  openPunches.forEach(function (op) { openIds[op.employee_id] = op })

  return (
    <div>
      <h2 className="text-lg font-bold text-gray-900 mb-1">{t('team_title')}</h2>
      <p className="text-xs text-gray-400 mb-4">{t('team_subtitle')}</p>

      {/* Tab bar */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 mb-5">
        {[
          { id: 'punch', label: t('team_tab_punch'), count: casuals.length },
          { id: 'incoming', label: 'Incoming', count: incoming.length },
          { id: 'open', label: t('team_tab_open'), count: openPunches.length },
          { id: 'add', label: t('team_tab_add') }
        ].map(function (tb) {
          return (
            <button key={tb.id}
              onClick={function () { setTab(tb.id) }}
              className={'flex-1 py-2 text-xs font-semibold rounded-lg transition-colors ' +
                (tab === tb.id ? 'bg-white text-slate-800 shadow-sm' : 'text-gray-500')}
            >
              {tb.label}
              {tb.count > 0 && (
                <span className={'ml-1 text-[10px] px-1.5 py-0.5 rounded-full ' +
                  (tab === tb.id ? 'bg-slate-800 text-white' : 'bg-gray-300 text-gray-600')}>
                  {tb.count}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* PUNCH TAB */}
      {tab === 'punch' && (
        <div className="space-y-2">
          {casuals.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-sm text-gray-400 mb-2">{t('team_no_casuals')}</p>
              <button onClick={function () { setTab('add') }}
                className="text-sm text-slate-700 underline">{t('team_add_casual_link')}</button>
            </div>
          ) : (
            <>
              <input
                type="text"
                value={punchSearch}
                onChange={function (e) { setPunchSearch(e.target.value) }}
                placeholder="Search casual worker…"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-700"
              />
              {casuals.filter(function (c) {
                if (!punchSearch) return true
                var q = punchSearch.toLowerCase()
                return c.name.toLowerCase().includes(q) || c.emp_code.toLowerCase().includes(q) || (c.vendor_name && c.vendor_name.toLowerCase().includes(q))
              }).map(function (c) {
                var isOpen = openIds[c.id]
                var isPunching = punchingId === c.id

                return (
                  <div key={c.id} className={'bg-white border rounded-xl px-4 py-3 flex items-center justify-between ' +
                    (selectedIds[c.id] ? 'border-blue-400 bg-blue-50/30' : 'border-gray-200')}>
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      {openIds[c.id] && (
                        <input type="checkbox" checked={!!selectedIds[c.id]}
                          onChange={function () { toggleSelect(c.id) }}
                          className="w-4 h-4 rounded border-gray-300 text-blue-600 shrink-0" />
                      )}
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900">{c.name}</p>
                        <p className="text-[11px] text-gray-400 truncate">
                          {c.emp_code} · {c.department_name || '—'}
                          {c.vendor_name && <span className="text-blue-500"> · {c.vendor_name}</span>}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 ml-2 shrink-0">
                      {isPunching ? (
                        <span className="text-xs text-gray-400">
                          {punchStep === 'camera' ? t('team_camera') : t('team_uploading')}
                        </span>
                      ) : isOpen ? (
                        <button
                          onClick={function () { handleProxyPunch(c, 'out') }}
                          className="px-3 py-1.5 text-xs font-semibold text-white bg-red-500 rounded-lg hover:bg-red-600 transition-colors"
                        >
                          {t('team_punch_out')}
                        </button>
                      ) : (
                        <button
                          onClick={function () { handleProxyPunch(c, 'in') }}
                          className="px-3 py-1.5 text-xs font-semibold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 transition-colors"
                        >
                          {t('team_punch_in')}
                        </button>
                      )}
                      <button
                        onClick={function () { setRemoveTarget(c) }}
                        className="p-1.5 text-gray-300 hover:text-red-500 transition-colors"
                        title="Remove casual"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                )
              })}
            </>
          )}
        </div>
      )}

      {/* INCOMING TRANSFERS TAB */}
      {tab === 'incoming' && (
        <div className="space-y-2">
          {incoming.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-sm text-gray-400">No incoming transfers</p>
            </div>
          ) : (
            <>
              {incoming.length > 1 && (
                <button
                  onClick={handleBulkReceive}
                  disabled={receivingId === 'bulk'}
                  className="w-full py-2.5 text-sm font-bold text-white bg-emerald-600 rounded-xl hover:bg-emerald-700 disabled:opacity-40 transition-colors mb-3"
                >
                  {receivingId === 'bulk' ? 'Receiving…' : '📷 Receive All ' + incoming.length + ' Workers'}
                </button>
              )}
              {incoming.map(function (mov) {
            var isReceiving = receivingId === mov.movement_id
            var minsAgo = Math.round((Date.now() - new Date(mov.initiated_at).getTime()) / 60000)
            return (
              <div key={mov.movement_id} className="bg-white border border-blue-200 rounded-xl px-4 py-3 bg-blue-50/30">
                <div className="flex items-center justify-between mb-1">
                  <div>
                    <p className="text-sm font-medium text-gray-900">{mov.name}</p>
                    <p className="text-[11px] text-gray-400">
                      {mov.emp_code} · from <span className="text-amber-600 font-medium">{mov.from_venue}</span> → <span className="text-emerald-600 font-medium">{mov.to_venue}</span>
                    </p>
                  </div>
                  <span className="text-[10px] text-blue-600 font-semibold">{minsAgo}m ago</span>
                </div>
                <p className="text-[10px] text-gray-400 mb-2">Sent by {mov.initiated_by_name}</p>
                <div className="flex gap-2">
                  <button
                    onClick={function () { handleReceive(mov) }}
                    disabled={isReceiving}
                    className="flex-1 py-1.5 text-xs font-semibold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 disabled:opacity-40 transition-colors"
                  >
                    {isReceiving ? 'Receiving…' : '📷 Receive & Punch In'}
                  </button>
                  <button
                    onClick={function () { handleCancelTransfer(mov) }}
                    className="px-3 py-1.5 text-xs font-semibold text-red-600 bg-red-50 rounded-lg hover:bg-red-100 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )
          })}
            </>
          )}
        </div>
      )}

      {/* TRANSFER BAR (sticky bottom when casuals selected) */}
      {tab === 'punch' && selectedCount > 0 && (
        <div className="fixed bottom-20 left-4 right-4 z-40">
          <button onClick={function () { setShowTransfer(true); setTransferVenue('') }}
            className="w-full py-3 text-sm font-bold text-white bg-blue-600 rounded-xl shadow-lg hover:bg-blue-700 transition-colors">
            Transfer {selectedCount} worker{selectedCount > 1 ? 's' : ''} →
          </button>
        </div>
      )}

      {/* TRANSFER MODAL */}
      {showTransfer && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end justify-center p-4" onClick={function () { setShowTransfer(false) }}>
          <div className="bg-white rounded-t-2xl rounded-b-xl w-full max-w-md shadow-xl" onClick={function (e) { e.stopPropagation() }}>
            <div className="px-5 py-4 border-b border-gray-100">
              <h3 className="text-sm font-bold text-gray-900">Transfer {selectedCount} Worker{selectedCount > 1 ? 's' : ''}</h3>
              <p className="text-xs text-gray-500">Select destination venue</p>
            </div>
            <div className="px-5 py-4 space-y-3">
              <select value={transferVenue} onChange={function (e) { setTransferVenue(e.target.value) }}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="">— Select Venue —</option>
                {venues.map(function (v) { return <option key={v.id} value={v.id}>{v.name}</option> })}
              </select>
              <div className="flex gap-2">
                <button onClick={function () { setShowTransfer(false) }}
                  className="flex-1 py-2 text-sm text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors">{t('cancel')}</button>
                <button onClick={handleTransfer} disabled={!transferVenue || transferring}
                  className="flex-1 py-2 text-sm text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-40 transition-colors font-medium">
                  {transferring ? 'Transferring…' : 'Confirm Transfer'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* OPEN PUNCHES TAB */}
      {tab === 'open' && (
        <div className="space-y-2">
          {openPunches.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-sm text-gray-400">{t('team_no_open')}</p>
            </div>
          ) : (
            <>
              {openPunches.map(function (op) {
                return renderOpenCard(op)
              })}
            </>
          )}
        </div>
      )}

      {/* ADD CASUAL TAB */}
      {tab === 'add' && (
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <form onSubmit={handleBatchAdd} className="space-y-3">
            <div>
              <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1">{t('team_department')} *</label>
              <select value={newDept} onChange={function (e) { setNewDept(e.target.value) }}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-700">
                <option value="">{t('team_select_dept')}</option>
                {departments.map(function (d) { return <option key={d.id} value={d.id}>{d.name}</option> })}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1">Vendor / Agency</label>
              <select value={vendorId} onChange={function (e) {
                setVendorId(e.target.value)
                if (e.target.value !== 'new') { setNewVendorName('') }
              }}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-700">
                <option value="">— No Vendor —</option>
                {vendors.map(function (v) { return <option key={v.id} value={v.id}>{v.name}</option> })}
                <option value="new">➕ Add New Vendor</option>
              </select>
            </div>
            {vendorId === 'new' && (
              <input type="text" value={newVendorName} onChange={function (e) { setNewVendorName(e.target.value) }}
                placeholder="Vendor / Agency name *" maxLength={100}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-700" />
            )}

            <div>
              <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1">Worker Names *</label>
              <div className="space-y-2">
                {batchNames.map(function (name, i) {
                  return (
                    <div key={i} className="flex gap-2">
                      <input
                        type="text"
                        value={name}
                        onChange={function (e) {
                          var updated = batchNames.slice()
                          updated[i] = e.target.value
                          setBatchNames(updated)
                        }}
                        onKeyDown={function (e) {
                          if (e.key === 'Enter') {
                            e.preventDefault()
                            if (name.trim() && i === batchNames.length - 1) {
                              setBatchNames(batchNames.concat(['']))
                            }
                          }
                        }}
                        placeholder={'Name ' + (i + 1)}
                        maxLength={100}
                        autoFocus={i === batchNames.length - 1}
                        className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-700"
                      />
                      {batchNames.length > 1 && (
                        <button type="button" onClick={function () {
                          setBatchNames(batchNames.filter(function (_, j) { return j !== i }))
                        }} className="px-2 text-gray-300 hover:text-red-500 text-lg">✕</button>
                      )}
                    </div>
                  )
                })}
              </div>
              <button type="button" onClick={function () { setBatchNames(batchNames.concat([''])) }}
                className="mt-2 text-xs text-slate-600 hover:text-slate-800 font-medium">
                + Add another worker
              </button>
            </div>

            {addError && <p className="text-xs text-red-600">{addError}</p>}

            <button type="submit" disabled={addSaving}
              className="w-full py-2.5 text-sm text-white bg-slate-800 rounded-lg hover:bg-slate-900 disabled:opacity-40 transition-colors font-medium">
              {addSaving ? t('team_adding') : (
                batchNames.filter(function (n) { return n.trim() }).length > 1
                  ? 'Add ' + batchNames.filter(function (n) { return n.trim() }).length + ' Workers'
                  : t('team_add_casual_btn')
              )}
            </button>
          </form>

          {confirmExisting && (
            <div className="mt-4 bg-amber-50 border border-amber-200 rounded-lg p-3">
              <p className="text-sm text-amber-800 font-medium mb-2">
                {t('team_name_exists', { name: confirmExisting.name })}
              </p>
              <div className="flex gap-2">
                <button onClick={handleReuseExisting}
                  className="flex-1 py-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 rounded-lg hover:bg-emerald-100 transition-colors">
                  {t('team_yes_same')}
                </button>
                <button onClick={handleForceCreate} disabled={addSaving}
                  className="flex-1 py-1.5 text-xs font-semibold text-slate-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-40">
                  {t('team_no_create')}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* REMOVE CASUAL CONFIRM */}
      {removeTarget && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end justify-center p-4" onClick={function () { setRemoveTarget(null) }}>
          <div className="bg-white rounded-t-2xl rounded-b-xl w-full max-w-md shadow-xl p-5" onClick={function (e) { e.stopPropagation() }}>
            <h3 className="text-sm font-bold text-gray-900 mb-2">Remove Casual Worker</h3>
            <p className="text-sm text-gray-600 mb-4">
              Remove <strong>{removeTarget.name}</strong> ({removeTarget.emp_code}) from the active list? Their punch history is preserved.
            </p>
            <div className="flex gap-2">
              <button onClick={function () { setRemoveTarget(null) }}
                className="flex-1 py-2 text-sm text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors">{t('cancel')}</button>
              <button onClick={handleDeactivateCasual}
                className="flex-1 py-2 text-sm text-white bg-red-500 rounded-lg hover:bg-red-600 transition-colors font-medium">Remove</button>
            </div>
          </div>
        </div>
      )}

      {/* RETROACTIVE MODAL */}
      {retroTarget && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end justify-center p-4" onClick={function () { setRetroTarget(null) }}>
          <div className="bg-white rounded-t-2xl rounded-b-xl w-full max-w-md shadow-xl" onClick={function (e) { e.stopPropagation() }}>
            <div className="px-5 py-4 border-b border-gray-100">
              <h3 className="text-sm font-bold text-gray-900">{t('team_retro_title')}</h3>
              <p className="text-xs text-gray-500">{retroTarget.name} · {retroTarget.attendance_date}</p>
            </div>
            <form onSubmit={handleRetroactive} className="px-5 py-4 space-y-3">
              <div>
                <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1">
                  {t('team_retro_time_label')}
                </label>
                <input type="time" value={retroTime} onChange={function (e) { setRetroTime(e.target.value) }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-700"
                  autoFocus />
              </div>

              <p className="text-[10px] text-gray-400">
                {t('team_retro_help', { time: formatTime(retroTarget.punched_in_at) })}
              </p>

              {retroError && <p className="text-xs text-red-600">{retroError}</p>}

              <div className="flex gap-2">
                <button type="button" onClick={function () { setRetroTarget(null) }}
                  className="flex-1 py-2 text-sm text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors">{t('cancel')}</button>
                <button type="submit" disabled={retroSaving}
                  className="flex-1 py-2 text-sm text-white bg-slate-800 rounded-lg hover:bg-slate-900 disabled:opacity-40 transition-colors font-medium">
                  {retroSaving ? t('saving') : t('save')}
                </button>
              </div>
            </form>
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

function formatTime(isoString) {
  if (!isoString) return '—'
  var d = new Date(isoString)
  return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })
}