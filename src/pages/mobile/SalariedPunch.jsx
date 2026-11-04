import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { captureProxyPhoto } from '../../lib/camera'
import { getLocation } from '../../lib/gps'
import { useLanguage } from '../../lib/i18n'
import { useSpeechSearch } from '../../lib/useSpeechSearch'

// Guard punch for salaried staff — dept grid (or cross-department search when
// the guard isn't sure which department someone is in) → employee list →
// photo capture + GPS + proxy_punch, same mechanics the casual-worker flow
// already uses. Only employees in a department the admin tagged "Guard Punch"
// in Departments show up here at all (enforced both here and in the RPCs).
export default function SalariedPunch({ showToast }) {
  var { t } = useLanguage()
  var [depts, setDepts] = useState([])
  var [deptsLoading, setDeptsLoading] = useState(true)
  var [deptId, setDeptId] = useState(null)
  var [roster, setRoster] = useState([])
  var [rosterLoading, setRosterLoading] = useState(false)
  var [query, setQuery] = useState('')
  var [globalQuery, setGlobalQuery] = useState('')
  var [globalResults, setGlobalResults] = useState([])
  var [globalSearching, setGlobalSearching] = useState(false)
  var [punchingId, setPunchingId] = useState(null)
  var [punchStep, setPunchStep] = useState('')

  var loadDepts = useCallback(async function () {
    var { data, error } = await supabase.rpc('guard_punch_departments')
    if (error || (data && data.error)) {
      showToast((data && data.error) || error.message)
      setDepts([])
    } else {
      setDepts(Array.isArray(data) ? data : [])
    }
    setDeptsLoading(false)
  }, [showToast])

  useEffect(function () { loadDepts() }, [loadDepts])

  var loadRoster = useCallback(async function (id) {
    setRosterLoading(true)
    var { data, error } = await supabase.rpc('guard_punch_roster', { p_department_id: id })
    if (error || (data && data.error)) {
      showToast((data && data.error) || error.message)
      setRoster([])
    } else {
      setRoster(Array.isArray(data) ? data : [])
    }
    setRosterLoading(false)
  }, [showToast])

  // A guard's phone can sleep mid-shift — refresh the open roster on return
  // so punch buttons never act on a stale in/out state.
  useEffect(function () {
    function onVis() {
      if (document.visibilityState === 'visible' && deptId) loadRoster(deptId)
    }
    document.addEventListener('visibilitychange', onVis)
    return function () { document.removeEventListener('visibilitychange', onVis) }
  }, [deptId, loadRoster])

  useEffect(function () {
    var q = globalQuery.trim()
    if (q.length < 2) { setGlobalResults([]); setGlobalSearching(false); return }
    setGlobalSearching(true)
    var active = true
    var handle = setTimeout(function () {
      supabase.rpc('guard_punch_search', { p_query: q }).then(function (res) {
        if (!active) return
        setGlobalResults(Array.isArray(res.data) ? res.data : [])
        setGlobalSearching(false)
      })
    }, 300)
    return function () { active = false; clearTimeout(handle) }
  }, [globalQuery])

  var globalSpeech = useSpeechSearch(function (text) { setGlobalQuery(text) })
  var listSpeech = useSpeechSearch(function (text) { setQuery(text) })

  function openDept(d) {
    setDeptId(d.id)
    setQuery('')
    loadRoster(d.id)
  }

  function backToDepts() {
    setDeptId(null)
    setQuery('')
    loadDepts()
  }

  async function doPunch(emp, punchType) {
    setPunchingId(emp.id)
    setPunchStep('camera')

    var photo
    try {
      photo = await captureProxyPhoto(emp.name + ' · ' + emp.emp_code)
    } catch (err) {
      if (err.message !== 'Cancelled') showToast('Camera error: ' + err.message)
      setPunchingId(null); setPunchStep('')
      return
    }

    setPunchStep('uploading')

    try {
      // GPS can time out or be denied — punch with no location rather than
      // leaving the row stuck on "Uploading…" forever (proxy_punch accepts
      // null coordinates fine, it just skips venue matching).
      var gps
      try {
        gps = await getLocation()
      } catch {
        gps = { latitude: null, longitude: null, accuracy: null, areaName: null }
      }

      var today = new Date().toISOString().slice(0, 10)
      var filePath = emp.id + '/' + today + '_' + punchType + '_proxy_' + Date.now() + '.jpg'

      var { error: uploadError } = await supabase.storage
        .from('selfies')
        .upload(filePath, photo.blob, { contentType: 'image/jpeg', upsert: false })

      if (uploadError) {
        showToast('Upload failed: ' + uploadError.message)
        return
      }

      var { data, error } = await supabase.rpc('proxy_punch', {
        p_target_employee_id: emp.id,
        p_punch_type: punchType,
        p_selfie_path: filePath,
        p_latitude: gps.latitude,
        p_longitude: gps.longitude,
        p_gps_accuracy: gps.accuracy,
        p_device_info: navigator.userAgent,
        p_location_name: gps.areaName
      })

      if (error || (data && data.error)) {
        showToast((data && data.error) || error.message)
        return
      }

      showToast(data.target_name + ' — ' + (punchType === 'in' ? t('team_punch_in') : t('team_punch_out')))

      loadDepts()
      if (deptId) loadRoster(deptId)
      if (globalQuery.trim().length >= 2) {
        supabase.rpc('guard_punch_search', { p_query: globalQuery.trim() }).then(function (res) {
          setGlobalResults(Array.isArray(res.data) ? res.data : [])
        })
      }
    } finally {
      setPunchingId(null); setPunchStep('')
    }
  }

  function renderRow(e, extraMeta) {
    var inNow = !!e.is_in
    var isPunching = punchingId === e.id
    return (
      <div key={e.id} className="neu rounded-2xl px-4 py-3 flex items-center justify-between">
        <div className="min-w-0">
          <p className="text-sm font-medium text-gray-900 truncate">{e.name}</p>
          <p className="text-[11px] text-slate-500 truncate">
            {e.emp_code}{extraMeta}{e.designation ? ' · ' + e.designation : ''}
          </p>
          <span className={'inline-block mt-1 text-[10px] font-bold px-2 py-0.5 rounded-full ' +
            (inNow ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200/70 text-slate-600')}>
            {inNow ? t('team_in_since', { time: fmtTime(e.in_since) }) : t('team_not_in')}
          </span>
        </div>
        {isPunching ? (
          <span className="text-xs text-slate-500 shrink-0 ml-2">
            {punchStep === 'camera' ? t('team_camera') : t('team_uploading')}
          </span>
        ) : (
          <button
            onClick={function () { doPunch(e, inNow ? 'out' : 'in') }}
            className={'shrink-0 ml-2 px-3 py-1.5 text-xs font-semibold text-white rounded-lg shadow-md transition-colors ' +
              (inNow ? 'bg-red-500 shadow-red-500/30 hover:bg-red-600' : 'bg-emerald-600 shadow-emerald-600/30 hover:bg-emerald-700')}
          >
            {inNow ? t('team_punch_out') : t('team_punch_in')}
          </button>
        )}
      </div>
    )
  }

  // ---------- department employee list ----------
  if (deptId) {
    var dept = depts.find(function (d) { return d.id === deptId })
    var q = query.trim().toLowerCase()
    var filtered = roster.filter(function (e) {
      if (!q) return true
      return e.name.toLowerCase().indexOf(q) >= 0 || (e.emp_code || '').toLowerCase().indexOf(q) >= 0
    })

    return (
      <div>
        <button onClick={backToDepts} className="text-sm font-semibold text-blue-600 mb-2">
          &larr; {t('team_back_to_depts')}
        </button>
        <h3 className="text-base font-bold text-gray-900 mb-3">{dept ? dept.name : ''}</h3>

        <div className="flex items-center gap-2 mb-2">
          <input
            type="text"
            value={query}
            onChange={function (e) { setQuery(e.target.value) }}
            placeholder={t('team_search_ph')}
            className="flex-1 px-3 py-2 border-0 neu-inset rounded-xl text-sm text-gray-900 outline-none focus:outline-2 focus:outline-blue-400/60"
          />
          {listSpeech.supported && (
            <button
              type="button"
              onClick={listSpeech.listening ? listSpeech.stop : listSpeech.start}
              aria-label="Voice search"
              className={'w-10 h-10 shrink-0 flex items-center justify-center rounded-xl text-base ' +
                (listSpeech.listening ? 'bg-red-500 text-white' : 'neu-press text-slate-700')}
            >
              🎤
            </button>
          )}
        </div>
        {listSpeech.listening && <p className="text-xs font-semibold text-red-600 mb-3">🎙️ {t('team_listening')}</p>}

        {rosterLoading ? (
          <p className="text-sm text-slate-500 text-center py-8">{t('loading')}</p>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-slate-500 text-center py-8">{t('team_no_match', { q: query })}</p>
        ) : (
          <div className="space-y-2">
            {filtered.map(function (e) { return renderRow(e, '') })}
          </div>
        )}
      </div>
    )
  }

  // ---------- department grid + cross-department search ----------
  var showGlobalResults = globalQuery.trim().length >= 2

  return (
    <div>
      <div className="mb-4">
        <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5">{t('team_unsure_dept')}</p>
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={globalQuery}
            onChange={function (e) { setGlobalQuery(e.target.value) }}
            placeholder={t('team_global_search_ph')}
            className="flex-1 px-3 py-2 border-0 neu-inset rounded-xl text-sm text-gray-900 outline-none focus:outline-2 focus:outline-blue-400/60"
          />
          {globalSpeech.supported && (
            <button
              type="button"
              onClick={globalSpeech.listening ? globalSpeech.stop : globalSpeech.start}
              aria-label="Voice search"
              className={'w-10 h-10 shrink-0 flex items-center justify-center rounded-xl text-base ' +
                (globalSpeech.listening ? 'bg-red-500 text-white' : 'neu-press text-slate-700')}
            >
              🎤
            </button>
          )}
        </div>
        {globalSpeech.listening && <p className="text-xs font-semibold text-red-600 mt-2">🎙️ {t('team_listening')}</p>}
      </div>

      {showGlobalResults ? (
        globalSearching ? (
          <p className="text-sm text-slate-500 text-center py-6">{t('loading')}</p>
        ) : globalResults.length === 0 ? (
          <p className="text-sm text-slate-500 text-center py-6">{t('team_no_match', { q: globalQuery })}</p>
        ) : (
          <div className="space-y-2">
            {globalResults.map(function (e) {
              return renderRow(e, ' · ' + e.department_name)
            })}
          </div>
        )
      ) : deptsLoading ? (
        <p className="text-sm text-slate-500 text-center py-8">{t('loading')}</p>
      ) : depts.length === 0 ? (
        <p className="text-sm text-slate-500 text-center py-8">{t('team_no_guard_depts')}</p>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {depts.map(function (d) {
            var hasStaff = d.staff_count > 0
            return (
              <button
                key={d.id}
                onClick={function () { if (hasStaff) openDept(d) }}
                disabled={!hasStaff}
                className={'text-left neu rounded-2xl p-4 flex flex-col gap-2 min-h-[100px] ' + (!hasStaff ? 'opacity-50' : '')}
              >
                <span className="text-sm font-bold text-gray-900">{d.name}</span>
                {hasStaff ? (
                  <span className="text-[11px] text-slate-500">{d.staff_count} {t('team_staff_label')} · {d.in_count} {t('team_in_label')}</span>
                ) : (
                  <span className="text-[11px] text-slate-400 font-semibold">{t('team_no_staff_tagged')}</span>
                )}
              </button>
            )
          })}
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
