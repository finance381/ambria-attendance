import { supabase } from './supabase'

function urlBase64ToUint8Array(base64String) {
  var padding = '='.repeat((4 - base64String.length % 4) % 4)
  var base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  var rawData = window.atob(base64)
  var outputArray = new Uint8Array(rawData.length)
  for (var i = 0; i < rawData.length; i++) {
    outputArray[i] = rawData.charCodeAt(i)
  }
  return outputArray
}

var REFRESH_INTERVAL_MS = 14 * 24 * 60 * 60 * 1000

export async function refreshPushSubscription(employeeId) {
  if (!employeeId) return
  if (!('serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window)) return
  if (Notification.permission !== 'granted') return

  try {
    var reg = await navigator.serviceWorker.ready
    var sub = await reg.pushManager.getSubscription()

    // A subscription can silently die server-side (push service expiry,
    // token rotation) with no client-visible signal, so periodically force
    // a fresh one instead of trusting an existing one forever.
    var lastRefreshKey = 'push_last_refresh_' + employeeId
    var lastRefresh = Number(localStorage.getItem(lastRefreshKey) || 0)
    var isStale = Date.now() - lastRefresh > REFRESH_INTERVAL_MS

    if (sub && isStale) {
      await sub.unsubscribe()
      sub = null
    }

    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(import.meta.env.VITE_VAPID_PUBLIC_KEY)
      })
    }

    localStorage.setItem(lastRefreshKey, String(Date.now()))

    var subJson = sub.toJSON()

    await supabase.from('push_subscriptions').upsert({
      employee_id: employeeId,
      endpoint: subJson.endpoint,
      p256dh: subJson.keys.p256dh,
      auth: subJson.keys.auth
    }, { onConflict: 'employee_id,endpoint' })
  } catch (e) {
    // Silent fail — don't break app load
  }
}