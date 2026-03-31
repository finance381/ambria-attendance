var CACHE_NAME = 'ambria-att-v1'
var SHELL_URLS = [
  '/ambria-attendance/',
  '/ambria-attendance/index.html'
]

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      return cache.addAll(SHELL_URLS)
    })
  )
  self.skipWaiting()
})

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (names) {
      return Promise.all(
        names.filter(function (n) { return n !== CACHE_NAME })
          .map(function (n) { return caches.delete(n) })
      )
    })
  )
  self.clients.claim()
})

self.addEventListener('fetch', function (event) {
  var url = new URL(event.request.url)

  // Never cache API calls or Supabase requests
  if (url.hostname.includes('supabase')) {
    event.respondWith(fetch(event.request))
    return
  }

  // For navigation requests, try network first, fall back to cached shell
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(function () {
        return caches.match('/ambria-attendance/index.html')
      })
    )
    return
  }

  // For assets, try cache first, then network
  event.respondWith(
    caches.match(event.request).then(function (cached) {
      if (cached) return cached
      return fetch(event.request).then(function (response) {
        // Cache JS/CSS assets
        if (response.ok && (url.pathname.endsWith('.js') || url.pathname.endsWith('.css'))) {
          var clone = response.clone()
          caches.open(CACHE_NAME).then(function (cache) {
            cache.put(event.request, clone)
          })
        }
        return response
      })
    })
  )
})