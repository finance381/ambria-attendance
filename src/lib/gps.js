/**
 * Get current GPS position + reverse geocode area name.
 * Returns { latitude, longitude, accuracy, areaName }
 */
export function getLocation() {
  return new Promise(function (resolve, reject) {
    if (!navigator.geolocation) {
      reject(new Error('Geolocation not supported'))
      return
    }

    navigator.geolocation.getCurrentPosition(
      async function (pos) {
        var result = {
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          areaName: null
        }

        try {
          var controller = new AbortController()
          var timer = setTimeout(function () { controller.abort() }, 3000)
          var res = await fetch(
            'https://nominatim.openstreetmap.org/reverse?lat=' + result.latitude + '&lon=' + result.longitude + '&format=json&zoom=16&addressdetails=1&email=admin@ambria.local',
            { signal: controller.signal, headers: { 'Accept': 'application/json' } }
          )
          clearTimeout(timer)
          var geo = await res.json()
          var addr = geo.address || {}
          result.areaName = addr.neighbourhood || addr.suburb || addr.city_district || addr.village || addr.town || addr.city || null
        } catch (e) { /* silent — area name is optional */ }

        resolve(result)
      },
      function (err) {
        reject(new Error(err.message || 'Location unavailable'))
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 300000
      }
    )
  })
}