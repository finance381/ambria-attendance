/**
 * Get current GPS position.
 * Returns { latitude, longitude, accuracy } or throws.
 */
export function getLocation() {
  return new Promise(function (resolve, reject) {
    if (!navigator.geolocation) {
      reject(new Error('Geolocation not supported'))
      return
    }

    navigator.geolocation.getCurrentPosition(
      function (pos) {
        resolve({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: pos.coords.accuracy
        })
      },
      function (err) {
        // Don't block punch on GPS failure — return nulls
        if (err.code === 1) {
          // Permission denied — still allow punch, just no GPS
          resolve({ latitude: null, longitude: null, accuracy: null })
        } else {
          resolve({ latitude: null, longitude: null, accuracy: null })
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 30000
      }
    )
  })
}