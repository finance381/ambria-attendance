var modelsLoaded = false
var modelLoading = false
var faceapi = null

async function loadModels() {
  if (modelsLoaded) return
  if (modelLoading) {
    while (!modelsLoaded && modelLoading) await new Promise(function (r) { setTimeout(r, 100) })
    return
  }
  modelLoading = true
  try {
    // Dynamic import — face-api.js (and its model files) only download for
    // users who actually open the punch camera, instead of every login
    // eagerly shipping this to people who never touch it (e.g. desktop-only admins).
    if (!faceapi) faceapi = await import('face-api.js')
    var base = window.location.origin + '/ambria-attendance/models'
    await faceapi.nets.tinyFaceDetector.loadFromUri(base)
    modelsLoaded = true
  } catch (e) {
    console.warn('face-api model load failed, using fallback:', e)
  } finally {
    modelLoading = false
  }
}

// The detector's first run sets up the GPU (compiles its shaders), which
// blocks the page for about a second. Done once per session on a blank
// frame while the camera is starting, so it never freezes the live preview.
var warmedUp = false
var warming = null
function warmUpDetector() {
  if (warmedUp) return Promise.resolve()
  if (warming) return warming
  warming = (async function () {
    // Models normally preloaded after login; if not, wait for them, but
    // never hold the camera back more than 1.5s on a slow network
    if (!modelsLoaded) {
      await Promise.race([loadModels(), new Promise(function (r) { setTimeout(r, 1500) })])
      if (!modelsLoaded) { warming = null; return }
    }
    try {
      var c = document.createElement('canvas')
      c.width = 160
      c.height = 160
      var ctx = c.getContext('2d')
      ctx.fillStyle = '#888'
      ctx.fillRect(0, 0, 160, 160)
      await faceapi.detectSingleFace(c, new faceapi.TinyFaceDetectorOptions({ inputSize: 160, scoreThreshold: 0.2 }))
    } catch { /* a failed warm-up just means the first real run is slower */ }
    warmedUp = true
  })()
  return warming
}

// Preload — call from App after login so the camera opens instantly first time.
// Deferred to browser idle time so it never competes with the initial page's
// own critical-path network/CPU work, especially on slow connections.
export function preloadFaceModels() {
  function start() { loadModels().catch(function () {}) }
  if ('requestIdleCallback' in window) {
    window.requestIdleCallback(start, { timeout: 5000 })
  } else {
    setTimeout(start, 2000)
  }
}

// iPhone/iPad (iPadOS reports itself as a Mac with touch)
var IS_IOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)

// How the live camera is shown differs by platform.
// Android: the <video> itself is the preview, as it was before the iPhone
// fix below. Painting every frame onto a canvas (the iPhone fix) while face
// detection reads the same video was too much work for phones and made the
// punch screen freeze, and Android never had the iPhone layout bug.
// iPhone: Safari draws a visible <video> on its own layer and sometimes
// places that layer wrong (shifted by the page scroll, not stretched to
// cover), which left the feed as a small rectangle in one corner over a
// black screen. There, every frame is painted onto a normal full-screen
// <canvas> stacked on top, which iOS lays out like any other element.
// Mirroring is done in the canvas drawing, or with CSS on Android.
function createHiddenVideo(mirror) {
  var video = document.createElement('video')
  video.setAttribute('playsinline', '')
  video.setAttribute('autoplay', '')
  video.setAttribute('muted', '')
  video.muted = true
  // Full-size and fully opaque, just underneath the canvas (z 9998). It must
  // not be tiny or transparent: iOS Safari pauses muted videos it considers
  // invisible, which froze the preview on iPhones (the canvas kept
  // repainting the last frame).
  video.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;object-fit:cover;z-index:9997;pointer-events:none;background:#000' +
    (!IS_IOS && mirror ? ';transform:scaleX(-1)' : '')
  // If iOS pauses it anyway (e.g. the app was briefly backgrounded), restart
  // it while the camera is still open.
  video.addEventListener('pause', function () {
    if (video.isConnected && video.srcObject) video.play().catch(function () {})
  })
  return video
}

function startCanvasPreview(video, mirror) {
  // Android shows the video directly (see above): no canvas, no paint loop
  if (!IS_IOS) return { canvas: null, stop: function () {} }
  var canvas = document.createElement('canvas')
  canvas.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;z-index:9998;background:#000;display:block'
  var ctx = canvas.getContext('2d')
  // 1x is sharp enough for a live preview and far lighter than retina;
  // face detection runs on the same phone at the same time.
  var dpr = 1
  var rafId = null
  var lastDraw = 0

  function draw(now) {
    rafId = requestAnimationFrame(draw)
    // Cap repaints at ~25fps instead of every screen refresh. Time-based on
    // purpose: a live stream's currentTime doesn't reliably advance on every
    // iOS version, so it can't be the trigger.
    if (now - lastDraw < 40) return
    var cw = Math.round(canvas.clientWidth * dpr)
    var ch = Math.round(canvas.clientHeight * dpr)
    if (!cw || !ch) return
    if (canvas.width !== cw || canvas.height !== ch) {
      canvas.width = cw
      canvas.height = ch
    }
    var vw = video.videoWidth
    var vh = video.videoHeight
    if (video.readyState < 2 || !vw || !vh) return
    // "cover" crop: fill the whole screen, cut the overflow equally on both sides
    var scale = Math.max(cw / vw, ch / vh)
    var dw = vw * scale
    var dh = vh * scale
    ctx.setTransform(mirror ? -1 : 1, 0, 0, 1, mirror ? cw : 0, 0)
    ctx.drawImage(video, (cw - dw) / 2, (ch - dh) / 2, dw, dh)
    lastDraw = now
  }
  rafId = requestAnimationFrame(draw)

  return {
    canvas: canvas,
    stop: function () {
      if (rafId) cancelAnimationFrame(rafId)
      if (canvas.parentNode) canvas.parentNode.removeChild(canvas)
    }
  }
}

// "data:image/jpeg;base64,..." -> Blob
function dataUrlToBlob(dataUrl) {
  var parts = dataUrl.split(',')
  var bin = atob(parts[1])
  var bytes = new Uint8Array(bin.length)
  for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return new Blob([bytes], { type: 'image/jpeg' })
}

// getUserMedia with a time limit. On some phones it never answers (no
// stream, no error), which left "Opening camera" spinning until the app was
// closed. A stream that arrives after the limit is stopped straight away.
var CAMERA_OPEN_TIMEOUT_MS = 25000
function openCamera(constraints) {
  return new Promise(function (resolve, reject) {
    var done = false
    var timer = setTimeout(function () {
      done = true
      reject(new Error('camera did not start — try again'))
    }, CAMERA_OPEN_TIMEOUT_MS)
    navigator.mediaDevices.getUserMedia(constraints).then(function (s) {
      if (done) { s.getTracks().forEach(function (t) { t.stop() }); return }
      done = true
      clearTimeout(timer)
      resolve(s)
    }, function (err) {
      if (done) return
      done = true
      clearTimeout(timer)
      reject(err)
    })
  })
}

export function capturePhoto() {
  return new Promise(function (resolve, reject) {
    var video = createHiddenVideo(true)
    var preview = startCanvasPreview(video, true)

    // Dim-everything-outside-the-oval effect, via mask-image rather than the
    // classic "box-shadow: 0 0 0 9999px" spotlight trick — that trick pairs a
    // huge spread radius with border-radius, which is a known iOS Safari bug
    // class causing the "hole" to render solid black instead of see-through.
    var dimLayer = document.createElement('div')
    dimLayer.style.cssText = 'position:fixed;inset:0;z-index:9999;pointer-events:none;background:rgba(255,255,255,0.25)'

    var overlay = document.createElement('div')
    overlay.style.cssText = 'position:fixed;inset:0;z-index:9999;display:flex;flex-direction:column;align-items:center;justify-content:space-between;padding:40px 0 env(safe-area-inset-bottom,20px)'

    var guideRing = document.createElement('div')
    guideRing.style.cssText = 'width:220px;height:280px;border:3px dashed rgba(255,255,255,0.5);border-radius:50%;margin-top:40px;transition:border-color 0.3s'

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
    var positionHistory = []
    var motionConfirmed = false
    var lowLightMode = false
    var fallbackTimer = null
    var stallTimer = null
    var detectionStarted = false
    var captureUnlocked = false
    var everDetected = false

    function cleanup() {
      if (autoCloseTimer) clearTimeout(autoCloseTimer)
      if (faceDetectInterval) clearInterval(faceDetectInterval)
      if (fallbackTimer) clearTimeout(fallbackTimer)
      if (stallTimer) clearInterval(stallTimer)
      if (stream) {
        stream.getTracks().forEach(function (t) { t.stop() })
      }
      video.srcObject = null
      preview.stop()
      if (video.parentNode) video.parentNode.removeChild(video)
      if (dimLayer.parentNode) dimLayer.parentNode.removeChild(dimLayer)
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay)
    }

    function setFaceFound(found) {
      faceDetected = found
      // Fill light — warm bright overlay in low light reflects onto face
      var shadowColor = lowLightMode ? '255,245,220' : '255,255,255'
      var shadowOp = lowLightMode ? (found ? 0.78 : 0.72) : (found ? 0.55 : 0.25)
      dimLayer.style.background = 'rgba(' + shadowColor + ',' + shadowOp + ')'
      if (found) {
        guideRing.style.borderColor = '#22c55e'
        guideRing.style.borderStyle = 'solid'
        faceStatus.textContent = motionConfirmed ? '✓ Face detected' : '↔ Hold still — detecting motion...'
        faceStatus.style.background = 'rgba(22,163,74,0.7)'
        captureBtn.disabled = false
        captureBtn.style.opacity = '1'
      } else {
        guideRing.style.borderColor = 'rgba(255,255,255,0.5)'
        guideRing.style.borderStyle = 'dashed'
        faceStatus.textContent = lowLightMode ? '💡 Low light — screen used as fill' : 'Position your face in the oval'
        faceStatus.style.background = 'rgba(0,0,0,0.5)'
      }
    }

    function startFaceApiDetection() {
      faceStatus.textContent = 'Position your face in the oval'
      // Adaptive detector configs — low-light uses looser confidence
      var optsNormal = new faceapi.TinyFaceDetectorOptions({ inputSize: 160, scoreThreshold: 0.2 })
      var optsLowLight = new faceapi.TinyFaceDetectorOptions({ inputSize: 160, scoreThreshold: 0.15 })
      var detectionStart = Date.now()
      var firstRun = true

      // Small canvas for cheap per-tick luminance sampling (~1ms)
      var lumCanvas = document.createElement('canvas')
      lumCanvas.width = 60
      lumCanvas.height = 45
      var lumCtx = lumCanvas.getContext('2d', { willReadFrequently: true })

      // One detection at a time. detectSingleFace can take longer than the
      // 250ms tick on slower phones; without this guard the calls stacked
      // up and froze the camera screen (Capture stopped responding).
      var detecting = false
      faceDetectInterval = setInterval(function () {
        if (detecting) return
        detecting = true
        detectTick().finally(function () { detecting = false })
      }, 250)

      // iPhone: detect on a small copy of the frame, not the video itself.
      // Handing the full video to the detector's GPU code while the canvas
      // preview also paints it every frame was too heavy and froze iPhones.
      var detCanvas = null
      var detCtx = null
      if (IS_IOS) {
        detCanvas = document.createElement('canvas')
        detCtx = detCanvas.getContext('2d')
      }

      async function detectTick() {
        if (video.readyState < 2) return

        // Fallback: no face found at all in 6s, enable capture anyway
        if (Date.now() - detectionStart > 6000 && !everDetected) {
          motionConfirmed = true
          setFaceFound(true)
          faceStatus.textContent = '✓ Ready — tap Capture'
          return
        }

        // ── Luminance sampling → toggle low-light fill light ──
        try {
          lumCtx.drawImage(video, 0, 0, 60, 45)
          var d = lumCtx.getImageData(0, 0, 60, 45).data
          var lumSum = 0
          for (var li = 0; li < d.length; li += 4) {
            lumSum += d[li] * 0.299 + d[li + 1] * 0.587 + d[li + 2] * 0.114
          }
          var meanLum = lumSum / (d.length / 4)
          var newLowLight = meanLum < 65
          if (newLowLight !== lowLightMode) {
            lowLightMode = newLowLight
            setFaceFound(faceDetected)  // refresh overlay
          }
        } catch (e) { /* ignore */ }

        try {
          var t0 = Date.now()
          var input = video
          var vw = video.videoWidth || 640
          var vh = video.videoHeight || 480
          if (detCanvas) {
            var dw = 320
            var dh = Math.round(320 * vh / vw)
            if (detCanvas.width !== dw || detCanvas.height !== dh) { detCanvas.width = dw; detCanvas.height = dh }
            detCtx.drawImage(video, 0, 0, dw, dh)
            input = detCanvas
            vw = dw
            vh = dh
          }
          var result = await faceapi.detectSingleFace(input, lowLightMode ? optsLowLight : optsNormal)
          // Too slow for this phone (each run blocks the screen): stop
          // detecting and just let them capture. The first run also sets up
          // the GPU, so it is always slow and doesn't count.
          var slow = !firstRun && Date.now() - t0 > 1000
          firstRun = false
          if (slow) {
            unlockCapture()
            return
          }
          if (result) {
            var box = result.box
            var cx = (box.x + box.width / 2) / vw
            var cy = (box.y + box.height / 2) / vh
            var faceW = box.width / vw
            // Face center must be: horizontally centered (20-80%), upper 70%, large enough (>9% of frame)
            var positionOk = cx > 0.20 && cx < 0.80 && cy > 0.05 && cy < 0.70 && faceW > 0.09
            if (positionOk) {
              everDetected = true
              positionHistory.push({ cx: cx, cy: cy, t: Date.now() })
              if (positionHistory.length > 6) positionHistory.shift()
              // Softened motion gate: any minor drift over 2 samples (500ms) confirms life
              if (positionHistory.length >= 2) {
                var dxSum = 0
                for (var k = 1; k < positionHistory.length; k++) {
                  dxSum += Math.abs(positionHistory[k].cx - positionHistory[k - 1].cx)
                       + Math.abs(positionHistory[k].cy - positionHistory[k - 1].cy)
                }
                motionConfirmed = dxSum > 0.008
              }
            } else {
              positionHistory = []
              motionConfirmed = false
            }
            setFaceFound(positionOk && motionConfirmed)
          } else {
            setFaceFound(false)
          }
        } catch (e) {
          // transient error, ignore
        }
      }
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
          var lowOk = skinRatio > 0.10 && midSkinRatio > 0.45 && lumVar > 100
          if (lowOk) everDetected = true
          setFaceFound(lowOk)
        } else {
          var heuristicOk = skinRatio > 0.22 && brightRatio < 0.40 && midSkinRatio > 0.55 && lumVar > 400
          if (heuristicOk) {
            positionHistory.push({ skin: skinRatio, lum: lumMean, t: Date.now() })
            if (positionHistory.length > 6) positionHistory.shift()
            if (positionHistory.length >= 4) {
              var variance = 0
              for (var k = 1; k < positionHistory.length; k++) {
                variance += Math.abs(positionHistory[k].skin - positionHistory[k - 1].skin)
                         + Math.abs(positionHistory[k].lum - positionHistory[k - 1].lum) / 255
              }
              motionConfirmed = variance > 0.01
            }
          } else {
            positionHistory = []
            motionConfirmed = false
          }
          if (heuristicOk) everDetected = true
          setFaceFound(heuristicOk && motionConfirmed)
        }
      }, 500)
    }

    // Capture must never stay locked. The old 8s fallback lived inside the
    // detection loop, which only runs once the video has a frame — so on an
    // iPhone whose video stalled, Capture stayed disabled for good and the
    // screen looked frozen. This timer doesn't depend on the video at all.
    function unlockCapture() {
      captureUnlocked = true
      // Stop detecting so a later "no face" tick can't lock Capture again
      if (faceDetectInterval) { clearInterval(faceDetectInterval); faceDetectInterval = null }
      if (faceDetected) return
      motionConfirmed = true
      setFaceFound(true)
      faceStatus.textContent = '✓ Ready — tap Capture'
    }

    // Stall watchdog: sample a few pixels every second. A live camera never
    // gives two identical frames, so the same pixels 3 checks running (or no
    // frame at all) means the video stopped; re-attach the stream and play.
    function startStallWatch() {
      var probe = document.createElement('canvas')
      probe.width = 8
      probe.height = 8
      var probeCtx = probe.getContext('2d', { willReadFrequently: true })
      var lastSig = ''
      var same = 0
      var restarts = 0
      stallTimer = setInterval(function () {
        var sig = ''
        if (video.readyState >= 2) {
          try {
            probeCtx.drawImage(video, 0, 0, 8, 8)
            sig = Array.prototype.join.call(probeCtx.getImageData(0, 0, 8, 8).data, ',')
          } catch (e) { sig = '' }
        }
        same = (sig === '' || sig === lastSig) ? same + 1 : 0
        lastSig = sig
        if (same >= 3 && restarts < 3 && stream) {
          restarts++
          same = 0
          video.srcObject = null
          video.srcObject = stream
          video.play().catch(function () {})
        }
      }, 1000)
    }

    async function startFaceDetection() {
      // Camera already closed (cancelled / captured) — nothing to detect
      if (detectionStarted || !video.isConnected) return
      detectionStarted = true
      await loadModels()
      // Closed while the models loaded, or they took longer than the 8s
      // unlock (Capture is already open; a detector could lock it again).
      if (captureUnlocked || !video.isConnected) return
      if (modelsLoaded) {
        startFaceApiDetection()
      } else {
        startHeuristicDetection()
      }
    }

    // The detector warm-up runs while the camera hardware starts (the
    // "Opening camera" spinner is up anyway); the preview appears after both
    Promise.all([
      openCamera({
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false
      }),
      warmUpDetector()
    ]).then(function (res) {
      var s = res[0]
      stream = s
      document.body.appendChild(video)
      if (preview.canvas) document.body.appendChild(preview.canvas)
      document.body.appendChild(dimLayer)
      document.body.appendChild(overlay)
      video.srcObject = s
      var playPromise = video.play()
      if (playPromise && playPromise.catch) playPromise.catch(function () {})

      // guideRing's position comes from flex layout, so measure its actual
      // rendered rect (now that it's in the DOM) to place the mask's hole.
      var ringRect = guideRing.getBoundingClientRect()
      var rx = ringRect.width / 2
      var ry = ringRect.height / 2
      var cx = ringRect.left + rx
      var cy = ringRect.top + ry
      var maskImg = 'radial-gradient(ellipse ' + rx + 'px ' + ry + 'px at ' + cx + 'px ' + cy + 'px, transparent 98%, black 100%)'
      dimLayer.style.setProperty('-webkit-mask-image', maskImg)
      dimLayer.style.setProperty('mask-image', maskImg)

      // loadeddata doesn't always fire for a camera stream on iOS; start on
      // whichever of these comes first (startFaceDetection runs once).
      video.addEventListener('loadeddata', startFaceDetection)
      video.addEventListener('playing', startFaceDetection)
      setTimeout(startFaceDetection, 2000)

      // Only when no face was found at all (e.g. the video stalled); while
      // the detector is seeing faces it keeps running and keeps Capture live.
      fallbackTimer = setTimeout(function () { if (!everDetected) unlockCapture() }, 6000)
      startStallWatch()

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
      // No camera frame yet: say so and kick the video instead of saving a
      // blank photo.
      if (!video.videoWidth || !video.videoHeight) {
        faceStatus.textContent = 'Camera not ready — try again in a moment'
        video.play().catch(function () {})
        return
      }
      if (autoCloseTimer) clearTimeout(autoCloseTimer)
      if (faceDetectInterval) clearInterval(faceDetectInterval)
      if (fallbackTimer) clearTimeout(fallbackTimer)
      if (stallTimer) clearInterval(stallTimer)

      var flash = document.createElement('div')
      flash.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100dvh;z-index:10000;background:#fff;opacity:0;transition:opacity 0.05s'
      document.body.appendChild(flash)
      flash.offsetHeight
      flash.style.opacity = '1'

      setTimeout(function () {
        var vw = video.videoWidth
        var vh = video.videoHeight
        var targetAspect = 3 / 4
        var srcW, srcH, srcX, srcY
        if (vw / vh > targetAspect) {
          srcH = vh; srcW = Math.round(vh * targetAspect)
          srcX = Math.round((vw - srcW) / 2); srcY = 0
        } else {
          srcW = vw; srcH = Math.round(vw / targetAspect)
          srcX = 0; srcY = Math.round((vh - srcH) / 2)
        }
        var outW = Math.min(srcW, 480)
        var outH = Math.round(outW / targetAspect)
        var canvas = document.createElement('canvas')
        canvas.width = outW; canvas.height = outH
        var ctx = canvas.getContext('2d')
        ctx.drawImage(video, srcX, srcY, srcW, srcH, 0, 0, outW, outH)

        // Built synchronously: on some phones canvas.toBlob's callback never
        // fired, leaving the white flash and camera stuck on screen.
        var dataUrl = canvas.toDataURL('image/jpeg', 0.6)
        if (flash.parentNode) flash.parentNode.removeChild(flash)
        cleanup()
        resolve({ blob: dataUrlToBlob(dataUrl), dataUrl: dataUrl })
      }, 300)
    })

    cancelBtn.addEventListener('click', function () {
      cleanup()
      reject(new Error('Cancelled'))
    })
  })
}

export function captureProxyPhoto() {
  return new Promise(function (resolve, reject) {
    var video = createHiddenVideo(false)
    var preview = startCanvasPreview(video, false)

    var overlay = document.createElement('div')
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100dvh;z-index:9999;display:flex;flex-direction:column;align-items:center;justify-content:space-between;padding:40px 0 env(safe-area-inset-bottom,20px)'

    var label = document.createElement('div')
    label.style.cssText = 'color:#fff;font-size:14px;font-weight:600;text-align:center;padding:8px 20px;border-radius:20px;background:rgba(0,0,0,0.5);margin-top:60px'
    label.textContent = 'Take photo of the worker'

    var btnWrap = document.createElement('div')
    btnWrap.style.cssText = 'display:flex;flex-direction:column;align-items:center;padding-bottom:20px'

    var captureBtn = document.createElement('button')
    captureBtn.textContent = '📷 Capture'
    captureBtn.style.cssText = 'padding:14px 40px;font-size:16px;font-weight:700;background:#fff;color:#1e293b;border:none;border-radius:50px;cursor:pointer;box-shadow:0 4px 20px rgba(0,0,0,0.3)'

    var cancelBtn = document.createElement('button')
    cancelBtn.textContent = 'Cancel'
    cancelBtn.style.cssText = 'margin-top:12px;padding:8px 24px;font-size:13px;background:transparent;color:#fff;border:1px solid rgba(255,255,255,0.4);border-radius:30px;cursor:pointer'

    btnWrap.appendChild(captureBtn)
    btnWrap.appendChild(cancelBtn)
    overlay.appendChild(label)
    overlay.appendChild(btnWrap)

    var stream = null
    var autoCloseTimer = null

    function cleanup() {
      if (autoCloseTimer) clearTimeout(autoCloseTimer)
      if (stream) { stream.getTracks().forEach(function (t) { t.stop() }) }
      video.srcObject = null
      preview.stop()
      if (video.parentNode) video.parentNode.removeChild(video)
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay)
    }

    openCamera({
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 640 }, height: { ideal: 480 } },
      audio: false
    }).then(function (s) {
      stream = s
      document.body.appendChild(video)
      if (preview.canvas) document.body.appendChild(preview.canvas)
      document.body.appendChild(overlay)
      video.srcObject = s
      var playPromise = video.play()
      if (playPromise && playPromise.catch) playPromise.catch(function () {})

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

      var flash = document.createElement('div')
      flash.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100dvh;z-index:10000;background:#fff;opacity:0;transition:opacity 0.05s'
      document.body.appendChild(flash)
      flash.offsetHeight
      flash.style.opacity = '1'

      setTimeout(function () {
        var vw = video.videoWidth
        var vh = video.videoHeight
        var targetAspect = 3 / 4
        var srcW, srcH, srcX, srcY
        if (vw / vh > targetAspect) {
          srcH = vh; srcW = Math.round(vh * targetAspect)
          srcX = Math.round((vw - srcW) / 2); srcY = 0
        } else {
          srcW = vw; srcH = Math.round(vw / targetAspect)
          srcX = 0; srcY = Math.round((vh - srcH) / 2)
        }
        var outW = Math.min(srcW, 480)
        var outH = Math.round(outW / targetAspect)
        var canvas = document.createElement('canvas')
        canvas.width = outW; canvas.height = outH
        var ctx = canvas.getContext('2d')
        ctx.drawImage(video, srcX, srcY, srcW, srcH, 0, 0, outW, outH)

        // Built synchronously: on some phones canvas.toBlob's callback never
        // fired, leaving the white flash and camera stuck on screen.
        var dataUrl = canvas.toDataURL('image/jpeg', 0.6)
        if (flash.parentNode) flash.parentNode.removeChild(flash)
        cleanup()
        resolve({ blob: dataUrlToBlob(dataUrl), dataUrl: dataUrl })
      }, 300)
    })

    cancelBtn.addEventListener('click', function () {
      cleanup()
      reject(new Error('Cancelled'))
    })
  })
}