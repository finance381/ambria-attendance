// src/lib/offlineQueue.js — IndexedDB queue for offline punches

var DB_NAME = 'ambria-offline'
var DB_VERSION = 1
var STORE_NAME = 'punch_queue'

function openDB() {
  return new Promise(function (resolve, reject) {
    var req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = function (e) {
      var db = e.target.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true })
      }
    }
    req.onsuccess = function () { resolve(req.result) }
    req.onerror = function () { reject(req.error) }
  })
}

export async function queuePunch(data) {
  // data: { punchType, selfieBlob, selfieDataUrl, latitude, longitude, gpsAccuracy, deviceInfo, clientTimestamp }
  var db = await openDB()
  return new Promise(function (resolve, reject) {
    var tx = db.transaction(STORE_NAME, 'readwrite')
    tx.objectStore(STORE_NAME).add(data)
    tx.oncomplete = function () { resolve() }
    tx.onerror = function () { reject(tx.error) }
  })
}

export async function getPendingPunches() {
  var db = await openDB()
  return new Promise(function (resolve, reject) {
    var tx = db.transaction(STORE_NAME, 'readonly')
    var req = tx.objectStore(STORE_NAME).getAll()
    req.onsuccess = function () { resolve(req.result || []) }
    req.onerror = function () { reject(req.error) }
  })
}

export async function removePunch(id) {
  var db = await openDB()
  return new Promise(function (resolve, reject) {
    var tx = db.transaction(STORE_NAME, 'readwrite')
    tx.objectStore(STORE_NAME).delete(id)
    tx.oncomplete = function () { resolve() }
    tx.onerror = function () { reject(tx.error) }
  })
}

export async function getPendingCount() {
  var items = await getPendingPunches()
  return items.length
}

// Background sync registration
export async function registerBackgroundSync() {
  if ('serviceWorker' in navigator && 'SyncManager' in window) {
    try {
      var reg = await navigator.serviceWorker.ready
      await reg.sync.register('sync-punches')
    } catch (e) {
      // Background sync not supported or failed — manual sync will handle it
    }
  }
}