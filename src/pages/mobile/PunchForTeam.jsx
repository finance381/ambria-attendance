import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { capturePhoto } from '../../lib/camera'
import { getLocation } from '../../lib/gps'
import { useLanguage } from '../../lib/i18n'

export default function PunchForTeam() {
  var [departments, setDepartments] = useState([])
  var [casuals, setCasuals] = useState([])
  var [openPunches, setOpenPunches] = useState([])
  var [loading, setLoading] = useState(true)
  var [tab, setTab] = useState('punch')
  var [toast, setToast] = useState('')

  var [newName, setNewName] = useState('')
  var [newDept, setNewDept] = useState('')
  var [addError, setAddError] = useState('')
  var [addSaving, setAddSaving] = useState(false)
  var [confirmExisting, setConfirmExisting] = useState(null)

  var [punchingId, setPunchingId] = useState(null)
  var [punchStep, setPunchStep] = useState('')

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
    var [deptRes, casualRes, openRes] = await Promise.all([
      supabase.from('departments').select('id, name').eq('active', true).order('name'),
      supabase.from('employees').select('id, emp_code, name, department_id, is_casual')
        .eq('is_casual', true).eq('active', true).order('name'),
      supabase.rpc('open_punches')
    ])

    setDepartments(deptRes.data || [])
    setCasuals(casualRes.data || [])
    setOpenPunches(openRes.data || [])
    setLoading(false)
  }, [])

  useEffect(function () { loadAll() }, [loadAll])

  function deptName(id) {
    var d = departments.find(function (d) { return d.id === id })
    return d ? d.name : '—'
  }

  async function handleAddCasual(e) {
    e.preventDefault()
    setAddError('')

    if (!newName.trim()) return setAddError(t('team_err_name'))
    if (!newDept) return setAddError(t('team_err_dept'))

    setAddSaving(true)

    var { data, error } = await supabase.rpc('add_casual', {
      p_name: newName.trim(),
      p_department_id: Number(newDept)
    })

    setAddSaving(false)

    if (error) { setAddError(error.message); return }
    if (data && data.error) { setAddError(data.error); return }

    if (data && data.existing) {
      setConfirmExisting(data)
      return
    }

    showToast(data.name + ' (' + data.emp_code + ')')
    setNewName('')
    setNewDept('')
    loadAll()
  }

  async function handleForceCreate() {
    setAddSaving(true)

    var { data, error } = await supabase.rpc('add_casual_force', {
      p_name: newName.trim(),
      p_department_id: Number(newDept)
    })

    setAddSaving(false)
    setConfirmExisting(null)

    if (error || (data && data.error)) {
      setAddError((data && data.error) || error.message)
      return
    }

    showToast(data.name + ' (' + data.emp_code + ')')
    setNewName('')
    setNewDept('')
    loadAll()
  }

  function handleReuseExisting() {
    showToast(confirmExisting.name)
    setConfirmExisting(null)
    setNewName('')
    setNewDept('')
    loadAll()
  }

  async function handleProxyPunch(employee, punchType) {
    setPunchingId(employee.id)
    setPunchStep('camera')

    var photo
    try {
      photo = await capturePhoto()
    } catch (err) {
      if (err.message === 'Cancelled') { setPunchingId(null); setPunchStep(''); return }
      showToast('Camera error: ' + err.message)
      setPunchingId(null); setPunchStep('')
      return
    }

    setPunchStep('uploading')

    var gps = await getLocation()

    var { data: { user } } = await supabase.auth.getUser()
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
      p_device_info: navigator.userAgent
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
          ) : casuals.map(function (c) {
            var isOpen = openIds[c.id]
            var isPunching = punchingId === c.id

            return (
              <div key={c.id} className="bg-white border border-gray-200 rounded-xl px-4 py-3 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-900">{c.name}</p>
                  <p className="text-[11px] text-gray-400">{c.emp_code} · {deptName(c.department_id)}</p>
                </div>
                <div>
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
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* OPEN PUNCHES TAB */}
      {tab === 'open' && (
        <div className="space-y-2">
          {openPunches.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-sm text-gray-400">{t('team_no_open')}</p>
            </div>
          ) : openPunches.map(function (op) {
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
          })}
        </div>
      )}

      {/* ADD CASUAL TAB */}
      {tab === 'add' && (
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <form onSubmit={handleAddCasual} className="space-y-3">
            <div>
              <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1">{t('team_name')} *</label>
              <input type="text" value={newName} onChange={function (e) { setNewName(e.target.value) }}
                placeholder={t('team_name_placeholder')}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-700"
                autoFocus />
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1">{t('team_department')} *</label>
              <select value={newDept} onChange={function (e) { setNewDept(e.target.value) }}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-700">
                <option value="">{t('team_select_dept')}</option>
                {departments.map(function (d) { return <option key={d.id} value={d.id}>{d.name}</option> })}
              </select>
            </div>

            {addError && <p className="text-xs text-red-600">{addError}</p>}

            <button type="submit" disabled={addSaving}
              className="w-full py-2 text-sm text-white bg-slate-800 rounded-lg hover:bg-slate-900 disabled:opacity-40 transition-colors font-medium">
              {addSaving ? t('team_adding') : t('team_add_casual_btn')}
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