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
      function () {
        // Don't block punch on GPS failure — return nulls
        resolve({ latitude: null, longitude: null, accuracy: null })
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0
      }
    )
  })
}