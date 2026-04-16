import { useState } from 'react'
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

  async function handlePunch() {
    setError('')

    // Quick DAR reminder on punch-in
    // DAR reminder popup on punch-in — blocks until user dismisses
    if (punchType === 'in') {
      await new Promise(function (resolve) {
        var overlay = document.createElement('div')
        overlay.style.cssText = 'position:fixed;inset:0;z-index:9997;background:rgba(0,0,0,0.4);display:flex;align-items:center;justify-content:center;padding:16px'
        var card = document.createElement('div')
        card.style.cssText = 'background:#fff;border-radius:16px;padding:24px;max-width:300px;width:100%;box-shadow:0 8px 30px rgba(0,0,0,0.25);text-align:center'
        card.innerHTML = '<div style="width:48px;height:48px;background:#fef3c7;border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 12px"><span style="font-size:24px">📝</span></div>'
          + '<p style="font-size:15px;font-weight:700;color:#92400e;margin:0 0 6px">' + (t('dar_reminder_title') || 'DAR Reminder') + '</p>'
          + '<p style="font-size:13px;color:#78716c;margin:0 0 20px">' + (t('dar_reminder') || 'Remember to write your DAR in the group!') + '</p>'
        var btn = document.createElement('button')
        btn.textContent = t('dar_ok') || 'OK, Got it'
        btn.style.cssText = 'width:100%;padding:12px;font-size:14px;font-weight:700;color:#fff;background:#f59e0b;border:none;border-radius:10px;cursor:pointer'
        card.appendChild(btn)
        overlay.appendChild(card)
        document.body.appendChild(overlay)
        btn.addEventListener('click', function () {
          document.body.removeChild(overlay)
          resolve()
        })
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
    var gps = await gpsPromise

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
          deviceInfo: navigator.userAgent,
          clientTimestamp: new Date().toISOString()
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

    if (uploadError) {
      setError('Upload failed: ' + uploadError.message)
      setStep('error')
      return
    }

    // Step 4: Call punch RPC
    var { data, error: rpcError } = await supabase.rpc('punch', {
      p_punch_type: punchType,
      p_selfie_path: filePath,
      p_latitude: gps.latitude,
      p_longitude: gps.longitude,
      p_gps_accuracy: gps.accuracy,
      p_device_info: navigator.userAgent
    })

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

  if (step === 'ready') {
    return (
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
  }

  if (step === 'dar') {
    return (
      <div className="text-center py-6">
        <div className="w-12 h-12 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-3">
          <span className="text-2xl">📝</span>
        </div>
        <p className="text-sm font-semibold text-amber-700">{t('dar_reminder') || 'Remember to write your DAR in the group!'}</p>
      </div>
    )
  }

  if (step === 'capturing') {
    return (
      <div className="text-center py-6">
        <div className="w-8 h-8 border-2 border-slate-700 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
        <p className="text-sm text-gray-500">{t('punch_opening_camera')}</p>
      </div>
    )
  }

  if (step === 'uploading') {
    return (
      <div className="text-center py-6">
        {preview && (
          <img src={preview} alt="Selfie" className="w-24 h-24 rounded-full object-cover mx-auto mb-3 border-2 border-slate-200" />
        )}
        <div className="w-8 h-8 border-2 border-slate-700 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
        <p className="text-sm text-gray-500">{t('punch_recording')}</p>
      </div>
    )
  }

  if (step === 'done') {
    return (
      <div className="text-center py-6">
        {preview && (
          <img src={preview} alt="Selfie" className="w-24 h-24 rounded-full object-cover mx-auto mb-3 border-2 border-emerald-300" />
        )}
        <div className="w-12 h-12 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-3">
          <span className="text-2xl">✓</span>
        </div>
        <p className="text-sm font-semibold text-emerald-700">
          {punchType === 'in' ? t('punch_done_in') : t('punch_done_out')}
        </p>
      </div>
    )
  }

  if (step === 'queued') {
    return (
      <div className="text-center py-6">
        {preview && (
          <img src={preview} alt="Selfie" className="w-24 h-24 rounded-full object-cover mx-auto mb-3 border-2 border-amber-300" />
        )}
        <div className="w-12 h-12 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-3">
          <span className="text-2xl">📶</span>
        </div>
        <p className="text-sm font-semibold text-amber-700">
          {t('punch_queued') || 'Punch saved offline'}
        </p>
        <p className="text-[11px] text-amber-500 mt-1">
          {t('punch_queued_desc') || 'Will sync automatically when back online'}
        </p>
      </div>
    )
  }

  if (step === 'error') {
    return (
      <div className="text-center py-6">
        <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-3">
          <span className="text-2xl">✕</span>
        </div>
        <p className="text-sm text-red-600 mb-3">{error}</p>
        <button
          onClick={function () { setStep('ready'); setError(''); setPreview(null) }}
          className="px-4 py-2 text-sm text-slate-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
        >
          {t('punch_try_again')}
        </button>
      </div>
    )
  }

  return null
}