export function capturePhoto() {
  return new Promise(function (resolve, reject) {
    var video = document.createElement('video')
    video.setAttribute('playsinline', '')
    video.setAttribute('autoplay', '')
    video.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;object-fit:cover;z-index:9998;background:#000'

    var overlay = document.createElement('div')
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;z-index:9999;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;padding-bottom:40px'

    var captureBtn = document.createElement('button')
    captureBtn.textContent = '📸 Capture'
    captureBtn.style.cssText = 'padding:14px 40px;font-size:16px;font-weight:700;background:#fff;color:#1e293b;border:none;border-radius:50px;cursor:pointer;box-shadow:0 4px 20px rgba(0,0,0,0.3)'

    var cancelBtn = document.createElement('button')
    cancelBtn.textContent = 'Cancel'
    cancelBtn.style.cssText = 'margin-top:12px;padding:8px 24px;font-size:13px;background:transparent;color:#fff;border:1px solid rgba(255,255,255,0.4);border-radius:30px;cursor:pointer'

    overlay.appendChild(captureBtn)
    overlay.appendChild(cancelBtn)

    var stream = null
    var autoCloseTimer = null

    function cleanup() {
      if (autoCloseTimer) clearTimeout(autoCloseTimer)
      if (stream) {
        stream.getTracks().forEach(function (t) { t.stop() })
      }
      if (video.parentNode) video.parentNode.removeChild(video)
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay)
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

      // Auto-close after 60 seconds
      autoCloseTimer = setTimeout(function () {
        cleanup()
        reject(new Error('Camera timed out — try again'))
      }, 60000)
    }).catch(function (err) {
      cleanup()
      reject(new Error('Camera access denied: ' + err.message))
    })

    captureBtn.addEventListener('click', function () {
      if (autoCloseTimer) clearTimeout(autoCloseTimer)

      var canvas = document.createElement('canvas')
      canvas.width = Math.min(video.videoWidth, 640)
      canvas.height = Math.round(canvas.width * (video.videoHeight / video.videoWidth))
      var ctx = canvas.getContext('2d')

      ctx.translate(canvas.width, 0)
      ctx.scale(-1, 1)
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