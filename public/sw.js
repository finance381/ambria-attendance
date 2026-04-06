var CACHE_NAME = 'ambria-v2'
var SHELL_URLS = ['/ambria-attendance/']

// Install — cache shell
self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      return cache.addAll(SHELL_URLS)
    })
  )
  self.skipWaiting()
})

// Activate — clean old caches
self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        keys.filter(function (k) { return k !== CACHE_NAME })
          .map(function (k) { return caches.delete(k) })
      )
    })
  )
  self.clients.claim()
})

// Fetch — network first, fallback to cache for navigation
self.addEventListener('fetch', function (e) {
  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request).catch(function () {
        return caches.match('/ambria-attendance/')
      })
    )
  }
})

// Push notification handler
self.addEventListener('push', function (e) {
  var data = { title: 'Ambria Attendance', body: 'You have a notification', tag: 'ambria' }

  if (e.data) {
    try {
      data = Object.assign(data, e.data.json())
    } catch (err) {
      data.body = e.data.text()
    }
  }

  e.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/ambria-attendance/pwa-192.png',
      badge: '/ambria-attendance/pwa-192.png',
      tag: data.tag || 'ambria',
      data: { url: data.url || '/ambria-attendance/' },
      vibrate: [200, 100, 200]
    })
  )
})

// Background sync — retry offline punches
self.addEventListener('sync', function (e) {
  if (e.tag === 'sync-punches') {
    e.waitUntil(
      self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (clients) {
        for (var i = 0; i < clients.length; i++) {
          clients[i].postMessage({ type: 'sync-punches' })
          return
        }
      })
    )
  }
})

// Click notification — open the app
self.addEventListener('notificationclick', function (e) {
  e.notification.close()

  var url = (e.notification.data && e.notification.data.url) || '/ambria-attendance/'

  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (clients) {
      for (var i = 0; i < clients.length; i++) {
        if (clients[i].url.includes('/ambria-attendance') && 'focus' in clients[i]) {
          return clients[i].focus()
        }
      }
      return self.clients.openWindow(url)
    })
  )
})