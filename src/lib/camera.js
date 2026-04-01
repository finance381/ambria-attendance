export function capturePhoto() {
  return new Promise(function (resolve, reject) {
    var video = document.createElement('video')
    video.setAttribute('playsinline', '')
    video.setAttribute('autoplay', '')
    video.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;object-fit:cover;z-index:9998;background:#000;transform:scaleX(-1)'

    var overlay = document.createElement('div')
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;z-index:9999;display:flex;flex-direction:column;align-items:center;justify-content:space-between;padding:40px 0'

    // Face guide oval
    var guideRing = document.createElement('div')
    guideRing.style.cssText = 'width:220px;height:280px;border:3px dashed rgba(255,255,255,0.5);border-radius:50%;margin-top:40px;transition:border-color 0.3s'

    var faceStatus = document.createElement('div')
    faceStatus.style.cssText = 'color:#fff;font-size:14px;font-weight:600;text-align:center;padding:6px 16px;border-radius:20px;background:rgba(0,0,0,0.5);margin-top:12px'
    faceStatus.textContent = 'Position your face in the oval'

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
        faceStatus.textContent = '✓ Face detected'
        faceStatus.style.background = 'rgba(22,163,74,0.7)'
        captureBtn.disabled = false
        captureBtn.style.opacity = '1'
      } else {
        guideRing.style.borderColor = 'rgba(255,255,255,0.5)'
        guideRing.style.borderStyle = 'dashed'
        faceStatus.textContent = 'Position your face in the oval'
        faceStatus.style.background = 'rgba(0,0,0,0.5)'
        captureBtn.disabled = true
        captureBtn.style.opacity = '0.4'
      }
    }

    // Face detection using FaceDetector API (Chromium) or canvas fallback
    function startFaceDetection() {
      if (typeof FaceDetector !== 'undefined') {
        var detector = new FaceDetector({ fastMode: true, maxDetectedFaces: 1 })
        faceDetectInterval = setInterval(function () {
          if (video.readyState < 2) return
          detector.detect(video).then(function (faces) {
            setFaceFound(faces.length > 0)
          }).catch(function () {
            // Ignore transient errors
          })
        }, 500)
      } else {
        // Fallback: simple brightness/contrast heuristic for skin-tone region
        var detectCanvas = document.createElement('canvas')
        detectCanvas.width = 160
        detectCanvas.height = 120
        var detectCtx = detectCanvas.getContext('2d', { willReadFrequently: true })

        faceDetectInterval = setInterval(function () {
          if (video.readyState < 2) return
          detectCtx.drawImage(video, 0, 0, 160, 120)
          var centerData = detectCtx.getImageData(40, 20, 80, 80)
          var pixels = centerData.data
          var skinCount = 0
          var totalPixels = pixels.length / 4

          for (var i = 0; i < pixels.length; i += 4) {
            var r = pixels[i], g = pixels[i + 1], b = pixels[i + 2]
            // Skin tone detection in RGB
            if (r > 60 && g > 40 && b > 20 &&
                r > g && r > b &&
                Math.abs(r - g) > 15 &&
                r - b > 15) {
              skinCount++
            }
          }

          var skinRatio = skinCount / totalPixels
          setFaceFound(skinRatio > 0.15)
        }, 500)
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

      var canvas = document.createElement('canvas')
      canvas.width = Math.min(video.videoWidth, 640)
      canvas.height = Math.round(canvas.width * (video.videoHeight / video.videoWidth))
      var ctx = canvas.getContext('2d')

      // Draw as-is (no flip) — saved image matches real orientation
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height)

      canvas.toBlob(function (blob) {
        var dataUrl = canvas.toDataURL('image/jpeg', 0.6)
        cleanup()
        resolve({ blob: blob, dataUrl: dataUrl })
      }, 'image/jpeg', 0.6)
    })

    cancelBtn.addEventListener('click', function () {
      cleanup()
      reject(new Error('Cancelled'))
    })
  })
}