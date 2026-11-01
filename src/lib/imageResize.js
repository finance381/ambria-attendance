// Downscale + re-encode an arbitrary picked image (camera or gallery, which
// can be several MB straight off a phone sensor) to a small JPEG before
// upload, the same way the punch camera already keeps selfie uploads cheap.
export function resizeImageFile(file, maxDim, quality) {
  maxDim = maxDim || 1280
  quality = quality || 0.7
  return new Promise(function (resolve, reject) {
    var img = new Image()
    var objectUrl = URL.createObjectURL(file)
    img.onload = function () {
      URL.revokeObjectURL(objectUrl)
      var w = img.naturalWidth, h = img.naturalHeight
      var scale = Math.min(1, maxDim / Math.max(w, h))
      var outW = Math.round(w * scale), outH = Math.round(h * scale)
      var canvas = document.createElement('canvas')
      canvas.width = outW
      canvas.height = outH
      var ctx = canvas.getContext('2d')
      ctx.drawImage(img, 0, 0, outW, outH)
      canvas.toBlob(function (blob) {
        if (!blob) return reject(new Error('Could not process image'))
        resolve({ blob: blob, dataUrl: canvas.toDataURL('image/jpeg', quality) })
      }, 'image/jpeg', quality)
    }
    img.onerror = function () {
      URL.revokeObjectURL(objectUrl)
      reject(new Error('Could not read image'))
    }
    img.src = objectUrl
  })
}
