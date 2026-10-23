// autoTranslate.js
// Shows free text that people typed themselves (claim reasons etc.) in Hindi
// when the app is in Hindi. The text goes to Google's public translate
// endpoint (source language auto-detected, so Hinglish works too); results
// are cached in memory and localStorage so each sentence is fetched once.
// While loading, or if the request fails, the original text is shown.

import { useState, useEffect } from 'react'
import { useLanguage } from './i18n'

var CACHE_KEY = 'ambria-hi-cache'
var MAX_ENTRIES = 300
var memory = loadCache()
var inFlight = {}

function loadCache() {
  try { return JSON.parse(localStorage.getItem(CACHE_KEY)) || {} } catch { return {} }
}

function saveCache() {
  try {
    var keys = Object.keys(memory)
    if (keys.length > MAX_ENTRIES) keys.slice(0, keys.length - MAX_ENTRIES).forEach(function (k) { delete memory[k] })
    localStorage.setItem(CACHE_KEY, JSON.stringify(memory))
  } catch { /* storage full or blocked: memory cache still works */ }
}

function fetchHindi(text) {
  if (inFlight[text]) return inFlight[text]
  inFlight[text] = fetch('https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=hi&dt=t&q=' + encodeURIComponent(text))
    .then(function (res) { return res.json() })
    .then(function (data) {
      var out = (data && data[0] || []).map(function (part) { return part[0] }).join('')
      if (out) { memory[text] = out; saveCache() }
      return out || text
    })
    .catch(function () { return text })
    .finally(function () { delete inFlight[text] })
  return inFlight[text]
}

// The Hindi version of `text` when the app is in Hindi, else `text` itself
export function useHindiText(text) {
  var { lang } = useLanguage()
  var key = (text || '').trim()
  var [, rerender] = useState(0)

  useEffect(function () {
    if (lang !== 'hi' || !key || memory[key]) return
    var alive = true
    fetchHindi(key).then(function () { if (alive) rerender(function (n) { return n + 1 }) })
    return function () { alive = false }
  }, [lang, key])

  if (lang !== 'hi' || !key) return text
  return memory[key] || text
}
