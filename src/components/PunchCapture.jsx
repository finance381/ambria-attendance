import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '../lib/supabase'
import { capturePhoto } from '../lib/camera'
import { getLocation } from '../lib/gps'
import { useLanguage } from '../lib/i18n'
import MiniIcon from './MiniIcon'
import { queuePunch, registerBackgroundSync } from '../lib/offlineQueue'

// Network steps get a time limit. On a weak signal an upload or the punch
// call could hang with no error, leaving the "Recording punch" spinner up
// forever (looked like a frozen screen). Past the limit we treat it as a
// network failure and save the punch to the offline queue; if the slow call
// did reach the server after all, the queued copy is rejected there as a
// duplicate when it syncs.
var NETWORK_TIMEOUT_MS = 20000
var GPS_TIMEOUT_MS = 20000
var SESSION_TIMEOUT_MS = 8000
var STORAGE_TIMEOUT_MS = 8000

function withTimeout(promise, ms) {
  return new Promise(function (resolve, reject) {
    var timer = setTimeout(function () { reject(new Error('Network timeout')) }, ms)
    promise.then(
      function (v) { clearTimeout(timer); resolve(v) },
      function (e) { clearTimeout(timer); reject(e) }
    )
  })
}

export default function PunchCapture({ punchType, onComplete, onCancel }) {
  var [step, setStep] = useState('ready')
  var [preview, setPreview] = useState(null)
  var [error, setError] = useState('')
  var { t } = useLanguage()
  var [showDarReminder, setShowDarReminder] = useState(false)
  var [showGpsPrompt, setShowGpsPrompt] = useState(false)
  var modalResolve = useRef(null)

  useEffect(function () {
    setStep('ready')
    setPreview(null)
    setError('')
  }, [punchType])

  async function handlePunch() {
    setError('')
    var clientPunchId = (crypto && crypto.randomUUID) ? crypto.randomUUID() :
      (Date.now() + '_' + Math.random().toString(36).slice(2))

    // DAR reminder popup on punch-in — blocks until user dismisses
    if (punchType === 'in') {
      await new Promise(function (resolve) {
        modalResolve.current = resolve
        setShowDarReminder(true)
      })
    }

    // Start GPS request immediately (runs in parallel with camera). Hard
    // limit on top of the GPS timeout: on some phones getCurrentPosition
    // never calls back at all, which left the punch spinning forever.
    var gpsPromise = withTimeout(getLocation(), GPS_TIMEOUT_MS)
    gpsPromise.catch(function () {})

    // Step 1: Capture selfie
    setStep('capturing')
    var photo
    try {
      photo = await capturePhoto()
    } catch (err) {
      if (err.message === 'Cancelled') {
        setStep('ready')
        if (onCancel) onCancel()
        return
      }
      setError('Camera error: ' + err.message)
      setStep('error')
      return
    }

    setPreview(photo.dataUrl)
    setStep('uploading')

    // GPS should be ready by now (started before camera)
    var gps
    try {
      gps = await gpsPromise
    } catch {
      var proceed = await new Promise(function (resolve) {
        modalResolve.current = resolve
        setShowGpsPrompt(true)
      })
      if (!proceed) {
        setStep('ready')
        if (onCancel) onCancel()
        return
      }
      gps = { latitude: null, longitude: null, accuracy: null, areaName: null }
    }

    // Save the punch on the phone to send later. Every step has a limit:
    // the phone's storage or the service worker can fail to answer, and an
    // unanswered await here used to leave the spinner up until the app was
    // closed and reopened.
    async function saveOffline() {
      try {
        await withTimeout(queuePunch({
          punchType: punchType,
          selfieBlob: photo.blob,
          selfieDataUrl: photo.dataUrl,
          latitude: gps.latitude,
          longitude: gps.longitude,
          gpsAccuracy: gps.accuracy,
          areaName: gps.areaName || null,
          deviceInfo: navigator.userAgent,
          clientTimestamp: new Date().toISOString(),
          clientPunchId: clientPunchId
        }), STORAGE_TIMEOUT_MS)
      } catch {
        setError(t('punch_failed_retry'))
        setStep('error')
        return
      }
      // Background sync is a bonus; never wait long on it
      withTimeout(registerBackgroundSync(), STORAGE_TIMEOUT_MS).catch(function () {})
      setStep('queued')
      if (onComplete) onComplete({ queued: true })
    }

    // Offline detection — queue locally if no network
    if (!navigator.onLine) {
      await saveOffline()
      return
    }

    // Step 3: Upload selfie to storage
    var timestamp = Date.now()
    // getSession reads the saved login on the phone (no network round trip,
    // unlike getUser); the server still checks the token on upload / punch.
    // It can hang (Supabase's auth lock, e.g. right after the app comes back
    // from the background), so it gets a limit too; then the punch is saved
    // offline and sent later.
    var user = null
    try {
      var sessionRes = await withTimeout(supabase.auth.getSession(), SESSION_TIMEOUT_MS)
      user = sessionRes.data.session && sessionRes.data.session.user
    } catch {
      await saveOffline()
      return
    }
    if (!user) {
      setError('Not authenticated')
      setStep('error')
      return
    }

    var today = new Date().toISOString().slice(0, 10)
    var filePath = user.id + '/' + today + '_' + punchType + '_' + timestamp + '.jpg'

    var uploadError = null
    try {
      var uploadRes = await withTimeout(supabase.storage
        .from('selfies')
        .upload(filePath, photo.blob, {
          contentType: 'image/jpeg',
          upsert: false
        }), NETWORK_TIMEOUT_MS)
      uploadError = uploadRes.error
    } catch (upErr) {
      uploadError = upErr
    }

    // If upload fails (network issue), queue for offline sync
    if (uploadError) {
      await saveOffline()
      return
    }

    // Step 4: Call punch RPC
    var rpcResult
    try {
      rpcResult = await withTimeout(supabase.rpc('punch', {
        p_punch_type: punchType,
        p_selfie_path: filePath,
        p_latitude: gps.latitude,
        p_longitude: gps.longitude,
        p_gps_accuracy: gps.accuracy,
        p_device_info: navigator.userAgent,
        p_client_punch_id: clientPunchId,
        p_location_name: gps.areaName
      }), NETWORK_TIMEOUT_MS)
    } catch {
      // Network threw (or timed out) before reaching the server — queue it
      await saveOffline()
      return
    }

    var data = rpcResult.data
    var rpcError = rpcResult.error

    if (rpcError) {
      setError('Punch failed: ' + rpcError.message)
      setStep('error')
      return
    }

    if (data && data.error) {
      setError(data.error)
      setStep('error')
      return
    }

    setStep('done')
    if (onComplete) onComplete(data)
  }

  var stepContent = null

  if (step === 'ready') {
    stepContent = (
      <button
        onClick={handlePunch}
        className={'w-full h-[60px] rounded-2xl text-[17px] font-semibold tracking-tight text-white inline-flex items-center justify-center gap-2.5 transition-all active:scale-[0.98] ' +
          (punchType === 'in'
            ? 'bg-emerald-600 hover:bg-emerald-700 shadow-[0_10px_24px_-8px] shadow-emerald-700/50'
            : 'bg-rose-700 hover:bg-rose-800 shadow-[0_10px_24px_-8px] shadow-rose-800/50')
        }
      >
        <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
          strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          {punchType === 'in'
            ? <><path d="M10 17l5-5-5-5M15 12H3" /><path d="M14 3h5a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-5" /></>
            : <><path d="M14 17l5-5-5-5M19 12H8" /><path d="M10 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h5" /></>}
        </svg>
        {punchType === 'in' ? t('punch_btn_in') : t('punch_btn_out')}
      </button>
    )
  } else if (step === 'capturing') {
    stepContent = (
      <div className="neu rounded-2xl text-center py-6 px-4">
        <div className="w-8 h-8 border-2 border-slate-700 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
        <p className="text-sm text-gray-500">{t('punch_opening_camera')}</p>
      </div>
    )
  } else if (step === 'uploading') {
    stepContent = (
      <div className="neu rounded-2xl text-center py-6 px-4">
        {preview && <img src={preview} alt="Selfie" className="w-24 h-24 rounded-full object-cover mx-auto mb-3 border-2 border-slate-200" />}
        <div className="w-8 h-8 border-2 border-slate-700 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
        <p className="text-sm text-gray-500">{t('punch_recording')}</p>
      </div>
    )
  } else if (step === 'done') {
    stepContent = (
      <div className="neu rounded-2xl text-center py-6 px-4">
        {preview && <img src={preview} alt="Selfie" className="w-24 h-24 rounded-full object-cover mx-auto mb-3 border-2 border-emerald-300" />}
        <div className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-3">
          <MiniIcon name="check" className="w-6 h-6" />
        </div>
        <p className="text-sm font-semibold text-emerald-700">
          {punchType === 'in' ? t('punch_done_in') : t('punch_done_out')}
        </p>
      </div>
    )
  } else if (step === 'queued') {
    stepContent = (
      <div className="neu rounded-2xl text-center py-6 px-4">
        {preview && <img src={preview} alt="Selfie" className="w-24 h-24 rounded-full object-cover mx-auto mb-3 border-2 border-amber-300" />}
        <div className="w-12 h-12 bg-amber-100 text-amber-600 rounded-full flex items-center justify-center mx-auto mb-3">
          <MiniIcon name="offline" className="w-6 h-6" />
        </div>
        <p className="text-sm font-semibold text-amber-700">{t('punch_queued')}</p>
        <p className="text-[11px] text-amber-500 mt-1">{t('punch_queued_desc')}</p>
      </div>
    )
  } else if (step === 'error') {
    stepContent = (
      <div className="neu rounded-2xl text-center py-6 px-4">
        <div className="w-12 h-12 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-3">
          <MiniIcon name="x" className="w-6 h-6" />
        </div>
        <p className="text-sm text-red-600 mb-3">{error}</p>
        <button onClick={function () { setStep('ready'); setError(''); setPreview(null) }}
          className="neu-press px-4 py-2 text-sm font-semibold text-slate-700 rounded-xl">
          {t('punch_try_again')}
        </button>
      </div>
    )
  }

  return (
    <>
      {stepContent}

      {showDarReminder && createPortal(
        <div className="fixed inset-0 z-[9997] bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 max-w-[300px] w-full shadow-xl text-center">
            <div className="w-12 h-12 bg-amber-100 text-amber-600 rounded-full flex items-center justify-center mx-auto mb-3">
              <MiniIcon name="note" className="w-6 h-6" />
            </div>
            <p className="text-[15px] font-bold text-amber-800 mb-1.5">{t('dar_reminder_title') || 'DAR Reminder'}</p>
            <p className="text-[13px] text-stone-500 mb-5">{t('dar_reminder') || 'Remember to write your DAR in the group!'}</p>
            <button onClick={function () { setShowDarReminder(false); if (modalResolve.current) modalResolve.current() }}
              className="w-full py-3 text-sm font-bold text-white bg-amber-500 rounded-xl active:scale-95 transition-transform">
              {t('dar_ok') || 'OK, Got it'}
            </button>
          </div>
        </div>,
        document.body
      )}

      {showGpsPrompt && createPortal(
        <div className="fixed inset-0 z-[9997] bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 max-w-[300px] w-full shadow-xl text-center">
            <div className="w-12 h-12 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-3">
              <MiniIcon name="pin" className="w-6 h-6" />
            </div>
            <p className="text-[15px] font-bold text-red-600 mb-1.5">GPS Unavailable</p>
            <p className="text-[13px] text-stone-500 mb-5">Your location could not be detected. Punch will be recorded without venue info and flagged for review.</p>
            <div className="flex gap-2.5">
              <button onClick={function () { setShowGpsPrompt(false); if (modalResolve.current) modalResolve.current(false) }}
                className="flex-1 py-3 text-sm font-semibold text-slate-500 bg-slate-100 rounded-xl active:scale-95 transition-transform">
                Cancel
              </button>
              <button onClick={function () { setShowGpsPrompt(false); if (modalResolve.current) modalResolve.current(true) }}
                className="flex-1 py-3 text-sm font-bold text-white bg-red-600 rounded-xl active:scale-95 transition-transform">
                Punch Anyway
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  )

}