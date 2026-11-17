// offlineSync.js
// Sends punches that were saved on the phone (offline, or because the
// network was too slow) to the server. Runs from the mobile shell on every
// screen: when the app opens, when the internet comes back, when the app
// returns from the background, a few seconds after a punch is saved, and
// once a minute while anything is still waiting.
// A punch the server refuses is not dropped silently: it is kept in a
// "rejected" list that the Home screen shows, so the person can file a claim.
// Screens read the live state with useOfflineSyncState().

import { useState, useEffect } from 'react'
import { supabase } from './supabase'
import { getPendingPunches, removePunch } from './offlineQueue'

var REJECTED_KEY = 'ambria-rejected-punches'
var RETRY_MS = 60000
var CALL_TIMEOUT_MS = 30000

var state = { pending: 0, syncing: false, error: '', rejected: loadRejected() }
var listeners = []
var running = false
var retryTimer = null

function loadRejected() {
  try { return JSON.parse(localStorage.getItem(REJECTED_KEY)) || [] } catch { return [] }
}

function saveRejected(list) {
  try { localStorage.setItem(REJECTED_KEY, JSON.stringify(list)) } catch { /* storage blocked */ }
}

function setState(patch) {
  state = Object.assign({}, state, patch)
  listeners.forEach(function (fn) { fn(state) })
}

function withTimeout(promise, ms) {
  return new Promise(function (resolve, reject) {
    var timer = setTimeout(function () { reject(new Error('timeout')) }, ms)
    promise.then(function (v) { clearTimeout(timer); resolve(v) }, function (e) { clearTimeout(timer); reject(e) })
  })
}

// Try again in a minute while anything is still waiting
function scheduleRetry() {
  if (retryTimer) return
  retryTimer = setTimeout(function () { retryTimer = null; syncOfflinePunches() }, RETRY_MS)
}

export async function syncOfflinePunches() {
  if (running) return
  running = true
  try {
    var pending = await getPendingPunches()
    setState({ pending: pending.length })
    if (pending.length === 0) return
    if (!navigator.onLine) { scheduleRetry(); return }

    setState({ syncing: true, error: '' })
    // The saved login on the phone: no network call, so it can't hang
    var { data: { session } } = await supabase.auth.getSession()
    var user = session && session.user
    if (!user) { scheduleRetry(); return }

    for (var i = 0; i < pending.length; i++) {
      var p = pending[i]
      try {
        var filePath = user.id + '/' + p.clientTimestamp.slice(0, 10) + '_' + p.punchType + '_' + Date.now() + '.jpg'
        var up = await withTimeout(supabase.storage.from('selfies')
          .upload(filePath, p.selfieBlob, { contentType: 'image/jpeg', upsert: false }), CALL_TIMEOUT_MS)
        if (up.error) continue // network trouble: keep it, try again later

        var res = await withTimeout(supabase.rpc('punch', {
          p_punch_type: p.punchType,
          p_selfie_path: filePath,
          p_latitude: p.latitude,
          p_longitude: p.longitude,
          p_gps_accuracy: p.gpsAccuracy,
          p_device_info: p.deviceInfo,
          p_client_timestamp: p.clientTimestamp,
          p_client_punch_id: p.clientPunchId,
          p_location_name: p.areaName || null
        }), CALL_TIMEOUT_MS)
        if (res.error) continue // network / server trouble: keep it, try again later

        if (res.data && res.data.error) {
          // The server refused it (already punched, too old, ...). Retrying
          // won't help, so take it off the queue, but tell the person.
          var msg = String(res.data.error)
          // A duplicate of a punch that did reach the server is not a problem
          if (!/duplicate|already recorded/i.test(msg)) {
            var list = state.rejected.concat([{
              punchType: p.punchType, clientTimestamp: p.clientTimestamp, reason: msg
            }])
            saveRejected(list)
            setState({ rejected: list })
          }
        }
        await removePunch(p.id)
      } catch {
        // timeout or exception: keep it, try again later
      }
    }

    var remaining = await getPendingPunches()
    setState({ pending: remaining.length })
    if (remaining.length > 0) {
      if (navigator.onLine) setState({ error: remaining.length + ' punch' + (remaining.length > 1 ? 'es' : '') + ' not sent yet — retrying automatically' })
      scheduleRetry()
    } else {
      setState({ error: '' })
      window.dispatchEvent(new Event('ambria-punches-synced'))
    }
  } catch {
    scheduleRetry()
  } finally {
    running = false
    setState({ syncing: false })
  }
}

// Clear one rejected-punch notice (the person has seen it)
export function dismissRejected(index) {
  var list = state.rejected.filter(function (_, i) { return i !== index })
  saveRejected(list)
  setState({ rejected: list })
}

// Start the triggers once; returns a stop function (used by the mobile shell)
export function startOfflineSync() {
  function onVisible() { if (document.visibilityState === 'visible') syncOfflinePunches() }
  function onSWMessage(e) { if (e.data && e.data.type === 'sync-punches') syncOfflinePunches() }
  syncOfflinePunches()
  window.addEventListener('online', syncOfflinePunches)
  document.addEventListener('visibilitychange', onVisible)
  if (navigator.serviceWorker) navigator.serviceWorker.addEventListener('message', onSWMessage)
  return function () {
    window.removeEventListener('online', syncOfflinePunches)
    document.removeEventListener('visibilitychange', onVisible)
    if (navigator.serviceWorker) navigator.serviceWorker.removeEventListener('message', onSWMessage)
  }
}

// Live { pending, syncing, error, rejected } for the Home banner
export function useOfflineSyncState() {
  var [s, setS] = useState(state)
  useEffect(function () {
    listeners.push(setS)
    setS(state)
    return function () { listeners = listeners.filter(function (fn) { return fn !== setS }) }
  }, [])
  return s
}
