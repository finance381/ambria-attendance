import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { capturePhoto } from '../lib/camera'
import { getLocation } from '../lib/gps'

export default function PunchCapture({ punchType, onComplete, onCancel }) {
  var [step, setStep] = useState('ready')  // ready | capturing | uploading | done | error
  var [preview, setPreview] = useState(null)
  var [error, setError] = useState('')

  async function handlePunch() {
    setError('')

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
        {punchType === 'in' ? '📸 Punch In' : '📸 Punch Out'}
      </button>
    )
  }

  if (step === 'capturing') {
    return (
      <div className="text-center py-6">
        <div className="w-8 h-8 border-2 border-slate-700 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
        <p className="text-sm text-gray-500">Opening camera…</p>
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
        <p className="text-sm text-gray-500">Recording attendance…</p>
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
          {punchType === 'in' ? 'Punched In!' : 'Punched Out!'}
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
          Try Again
        </button>
      </div>
    )
  }

  return null
}