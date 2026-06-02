import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '../lib/supabase'
import { capturePhoto } from '../lib/camera'
import { getLocation } from '../lib/gps'
import { useLanguage } from '../lib/i18n'
import { queuePunch, registerBackgroundSync } from '../lib/offlineQueue'

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

    // Start GPS request immediately (runs in parallel with camera)

    // Start GPS request immediately (runs in parallel with camera)
    var gpsPromise = getLocation()

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
    } catch (gpsErr) {
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

    // Offline detection — queue locally if no network
    if (!navigator.onLine) {
      try {
        await queuePunch({
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
        })
        await registerBackgroundSync()
        setStep('queued')
        if (onComplete) onComplete({ queued: true })
        return
      } catch (qErr) {
        setError('Failed to save offline: ' + qErr.message)
        setStep('error')
        return
      }
    }

    // Step 3: Upload selfie to storage
    var timestamp = Date.now()
    var { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setError('Not authenticated')
      setStep('error')
      return
    }

    var today = new Date().toISOString().slice(0, 10)
    var filePath = user.id + '/' + today + '_' + punchType + '_' + timestamp + '.jpg'

    var { error: uploadError } = await supabase.storage
      .from('selfies')
      .upload(filePath, photo.blob, {
        contentType: 'image/jpeg',
        upsert: false
      })

    // If upload fails (network issue), queue for offline sync
    if (uploadError) {
      try {
        await queuePunch({
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
        })
        await registerBackgroundSync()
        setStep('queued')
        if (onComplete) onComplete({ queued: true })
        return
      } catch (qErr) {
        setError('Network issue — try again: ' + uploadError.message)
        setStep('error')
        return
      }
    }

    // Step 4: Call punch RPC
    var rpcResult
    try {
      rpcResult = await supabase.rpc('punch', {
        p_punch_type: punchType,
        p_selfie_path: filePath,
        p_latitude: gps.latitude,
        p_longitude: gps.longitude,
        p_gps_accuracy: gps.accuracy,
        p_device_info: navigator.userAgent,
        p_client_punch_id: clientPunchId,
        p_location_name: gps.areaName
      })
    } catch (netErr) {
      // Network threw before reaching server — queue it
      try {
        await queuePunch({
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
        })
        await registerBackgroundSync()
        setStep('queued')
        if (onComplete) onComplete({ queued: true })
        return
      } catch (qErr) {
        setError('Network issue — try again')
        setStep('error')
        return
      }
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
        className={'w-full py-4 rounded-2xl text-lg font-bold text-white transition-all active:scale-95 ' +
          (punchType === 'in'
            ? 'bg-emerald-600 hover:bg-emerald-700 shadow-lg shadow-emerald-200'
            : 'bg-red-500 hover:bg-red-600 shadow-lg shadow-red-200')
        }
      >
        {'📸 ' + (punchType === 'in' ? t('punch_btn_in') : t('punch_btn_out'))}
      </button>
    )
  } else if (step === 'capturing') {
    stepContent = (
      <div className="text-center py-6">
        <div className="w-8 h-8 border-2 border-slate-700 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
        <p className="text-sm text-gray-500">{t('punch_opening_camera')}</p>
      </div>
    )
  } else if (step === 'uploading') {
    stepContent = (
      <div className="text-center py-6">
        {preview && <img src={preview} alt="Selfie" className="w-24 h-24 rounded-full object-cover mx-auto mb-3 border-2 border-slate-200" />}
        <div className="w-8 h-8 border-2 border-slate-700 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
        <p className="text-sm text-gray-500">{t('punch_recording')}</p>
      </div>
    )
  } else if (step === 'done') {
    stepContent = (
      <div className="text-center py-6">
        {preview && <img src={preview} alt="Selfie" className="w-24 h-24 rounded-full object-cover mx-auto mb-3 border-2 border-emerald-300" />}
        <div className="w-12 h-12 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-3">
          <span className="text-2xl">✓</span>
        </div>
        <p className="text-sm font-semibold text-emerald-700">
          {punchType === 'in' ? t('punch_done_in') : t('punch_done_out')}
        </p>
      </div>
    )
  } else if (step === 'queued') {
    stepContent = (
      <div className="text-center py-6">
        {preview && <img src={preview} alt="Selfie" className="w-24 h-24 rounded-full object-cover mx-auto mb-3 border-2 border-amber-300" />}
        <div className="w-12 h-12 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-3">
          <span className="text-2xl">📶</span>
        </div>
        <p className="text-sm font-semibold text-amber-700">{t('punch_queued') || 'Punch saved offline'}</p>
        <p className="text-[11px] text-amber-500 mt-1">{t('punch_queued_desc') || 'Will sync automatically when back online'}</p>
      </div>
    )
  } else if (step === 'error') {
    stepContent = (
      <div className="text-center py-6">
        <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-3">
          <span className="text-2xl">✕</span>
        </div>
        <p className="text-sm text-red-600 mb-3">{error}</p>
        <button onClick={function () { setStep('ready'); setError(''); setPreview(null) }}
          className="px-4 py-2 text-sm text-slate-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors">
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
            <div className="w-12 h-12 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-3">
              <span className="text-2xl">📝</span>
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
            <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-3">
              <span className="text-2xl">📍</span>
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