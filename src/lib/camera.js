import * as faceapi from 'face-api.js'

var modelsLoaded = false
var modelLoading = false

async function loadModels() {
  if (modelsLoaded) return
  if (modelLoading) {
    while (!modelsLoaded) await new Promise(function (r) { setTimeout(r, 100) })
    return
  }
  modelLoading = true
  try {
    var base = window.location.origin + '/ambria-attendance/models'
    await faceapi.nets.tinyFaceDetector.loadFromUri(base)
    modelsLoaded = true
  } catch (e) {
    console.warn('face-api model load failed, using fallback:', e)
    modelLoading = false
  }
}

export function capturePhoto() {
  return new Promise(function (resolve, reject) {
    var video = document.createElement('video')
    video.setAttribute('playsinline', '')
    video.setAttribute('autoplay', '')
    video.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100dvh;object-fit:cover;z-index:9998;background:#000;transform:scaleX(-1)'

    var overlay = document.createElement('div')
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100dvh;z-index:9999;display:flex;flex-direction:column;align-items:center;justify-content:space-between;padding:40px 0 env(safe-area-inset-bottom,20px)'

    var guideRing = document.createElement('div')
    guideRing.style.cssText = 'width:220px;height:280px;border:3px dashed rgba(255,255,255,0.5);border-radius:50%;margin-top:40px;transition:border-color 0.3s;box-shadow:0 0 0 9999px rgba(255,255,255,0.25)'

    var faceStatus = document.createElement('div')
    faceStatus.style.cssText = 'color:#fff;font-size:14px;font-weight:600;text-align:center;padding:6px 16px;border-radius:20px;background:rgba(0,0,0,0.5);margin-top:12px'
    faceStatus.textContent = 'Loading face detection...'

    var btnWrap = document.createElement('div')
    btnWrap.style.cssText = 'display:flex;flex-direction:column;align-items:center;padding-bottom:20px'

    var captureBtn = document.createElement('button')
    captureBtn.textContent = '📸 Capture'
    captureBtn.disabled = true
    captureBtn.style.cssText = 'padding:14px 40px;font-size:16px;font-weight:700;background:#fff;color:#1e293b;border:none;border-radius:50px;cursor:pointer;box-shadow:0 4px 20px rgba(0,0,0,0.3);opacity:0.4;transition:opacity 0.3s'

    var cancelBtn = document.createElement('button')
    cancelBtn.textContent = 'Cancel'
    cancelBtn.style.cssText = 'margin-top:12px;padding:8px 24px;font-size:13px;background:transparent;color:#fff;border:1px solid rgba(255,255,255,0.4);border-radius:30px;cursor:pointer'

    var topSection = document.createElement('div')
    topSection.style.cssText = 'display:flex;flex-direction:column;align-items:center'
    topSection.appendChild(guideRing)
    topSection.appendChild(faceStatus)

    btnWrap.appendChild(captureBtn)
    btnWrap.appendChild(cancelBtn)
    overlay.appendChild(topSection)
    overlay.appendChild(btnWrap)

    var stream = null
    var autoCloseTimer = null
    var faceDetectInterval = null
    var faceDetected = false

    function cleanup() {
      if (autoCloseTimer) clearTimeout(autoCloseTimer)
      if (faceDetectInterval) clearInterval(faceDetectInterval)
      if (stream) {
        stream.getTracks().forEach(function (t) { t.stop() })
      }
      if (video.parentNode) video.parentNode.removeChild(video)
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay)
    }

    function setFaceFound(found) {
      faceDetected = found
      if (found) {
        guideRing.style.borderColor = '#22c55e'
        guideRing.style.borderStyle = 'solid'
        guideRing.style.boxShadow = '0 0 0 9999px rgba(255,255,255,0.55)'
        faceStatus.textContent = '✓ Face detected'
        faceStatus.style.background = 'rgba(22,163,74,0.7)'
        captureBtn.disabled = false
        captureBtn.style.opacity = '1'
      } else {
        guideRing.style.borderColor = 'rgba(255,255,255,0.5)'
        guideRing.style.borderStyle = 'dashed'
        guideRing.style.boxShadow = '0 0 0 9999px rgba(255,255,255,0.25)'
        faceStatus.textContent = 'Position your face in the oval'
        faceStatus.style.background = 'rgba(0,0,0,0.5)'
      }
    }

    function startFaceApiDetection() {
      faceStatus.textContent = 'Position your face in the oval'
      var options = new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.3 })
      faceDetectInterval = setInterval(async function () {
        if (video.readyState < 2) return
        try {
          var result = await faceapi.detectSingleFace(video, options)
          if (result) {
            var box = result.box
            var vw = video.videoWidth || 640
            var vh = video.videoHeight || 480
            var cx = (box.x + box.width / 2) / vw
            var cy = (box.y + box.height / 2) / vh
            var faceW = box.width / vw
            // Face center must be: horizontally centered (25-75%), upper half (5-55%), large enough (>12% of frame)
            setFaceFound(cx > 0.25 && cx < 0.75 && cy > 0.05 && cy < 0.55 && faceW > 0.12)
          } else {
            setFaceFound(false)
          }
        } catch (e) {
          // transient error, ignore
        }
      }, 600)
    }

    function startHeuristicDetection() {
      faceStatus.textContent = 'Position your face in the oval'
      var detectCanvas = document.createElement('canvas')
      detectCanvas.width = 160
      detectCanvas.height = 120
      var detectCtx = detectCanvas.getContext('2d', { willReadFrequently: true })

      faceDetectInterval = setInterval(function () {
        if (video.readyState < 2) return
        detectCtx.drawImage(video, 0, 0, 160, 120)
        var centerData = detectCtx.getImageData(40, 20, 80, 80)
        var pixels = centerData.data
        var w = 80
        var totalPixels = pixels.length / 4
        var lumValues = []
        var lumSum = 0

        for (var i = 0; i < pixels.length; i += 4) {
          var lum = pixels[i] * 0.299 + pixels[i + 1] * 0.587 + pixels[i + 2] * 0.114
          lumValues.push(lum)
          lumSum += lum
        }
        var lumMean = lumSum / totalPixels
        var isLowLight = lumMean < 60

        var skinMinR = isLowLight ? 40 : 80
        var skinMinG = isLowLight ? 25 : 50
        var skinMinB = isLowLight ? 15 : 30

        var skinCount = 0
        var midSkin = 0
        var brightCount = 0

        for (var i = 0; i < pixels.length; i += 4) {
          var r = pixels[i], g = pixels[i + 1], b = pixels[i + 2]
          var pixRow = Math.floor((i / 4) / w)

          if (r > 220 && g > 220 && b > 220) {
            brightCount++
            continue
          }

          if (r > skinMinR && g > skinMinG && b > skinMinB &&
              r > g && r > b &&
              Math.abs(r - g) > (isLowLight ? 8 : 15) &&
              r - b > (isLowLight ? 10 : 20) &&
              r - g < (isLowLight ? 100 : 80) &&
              r - b < (isLowLight ? 140 : 120)) {
            skinCount++
            if (pixRow >= 16 && pixRow < 64) midSkin++
          }
        }

        var skinRatio = skinCount / totalPixels
        var brightRatio = brightCount / totalPixels
        var midSkinRatio = skinCount > 0 ? midSkin / skinCount : 0

        var lumSqSum = 0
        for (var j = 0; j < lumValues.length; j++) {
          lumSqSum += lumValues[j] * lumValues[j]
        }
        var lumVar = (lumSqSum / lumValues.length) - (lumMean * lumMean)

        if (isLowLight) {
          setFaceFound(
            skinRatio > 0.10 &&
            midSkinRatio > 0.45 &&
            lumVar > 100
          )
        } else {
          setFaceFound(
            skinRatio > 0.22 &&
            brightRatio < 0.40 &&
            midSkinRatio > 0.55 &&
            lumVar > 400
          )
        }
      }, 500)
    }

    async function startFaceDetection() {
      await loadModels()
      if (modelsLoaded) {
        startFaceApiDetection()
      } else {
        startHeuristicDetection()
      }
    }

    navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
      audio: false
    }).then(function (s) {
      stream = s
      video.srcObject = s
      video.play()
      document.body.appendChild(video)
      document.body.appendChild(overlay)

      video.addEventListener('loadeddata', function () {
        startFaceDetection()
      })

      autoCloseTimer = setTimeout(function () {
        cleanup()
        reject(new Error('Camera timed out — try again'))
      }, 60000)
    }).catch(function (err) {
      cleanup()
      reject(new Error('Camera access denied: ' + err.message))
    })

    captureBtn.addEventListener('click', function () {
      if (!faceDetected) return
      if (autoCloseTimer) clearTimeout(autoCloseTimer)
      if (faceDetectInterval) clearInterval(faceDetectInterval)

      var flash = document.createElement('div')
      flash.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100dvh;z-index:10000;background:#fff;opacity:0;transition:opacity 0.05s'
      document.body.appendChild(flash)
      flash.offsetHeight
      flash.style.opacity = '1'

      setTimeout(function () {
        var canvas = document.createElement('canvas')
        canvas.width = Math.min(video.videoWidth, 640)
        canvas.height = Math.round(canvas.width * (video.videoHeight / video.videoWidth))
        var ctx = canvas.getContext('2d')
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height)

        canvas.toBlob(function (blob) {
          var dataUrl = canvas.toDataURL('image/jpeg', 0.6)
          if (flash.parentNode) flash.parentNode.removeChild(flash)
          cleanup()
          resolve({ blob: blob, dataUrl: dataUrl })
        }, 'image/jpeg', 0.6)
      }, 300)
    })

    cancelBtn.addEventListener('click', function () {
      cleanup()
      reject(new Error('Cancelled'))
    })
  })
}