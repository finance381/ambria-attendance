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

export async function refreshPushSubscription(employeeId) {
  if (!employeeId) return
  if (!('serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window)) return
  if (Notification.permission !== 'granted') return

  try {
    var reg = await navigator.serviceWorker.ready
    var sub = await reg.pushManager.getSubscription()

    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(import.meta.env.VITE_VAPID_PUBLIC_KEY)
      })
    }

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