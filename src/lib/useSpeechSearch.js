import { useCallback, useEffect, useRef, useState } from 'react'

// Voice "speak a name to search" helper. Feature-detects the Web Speech API
// (solid on Android Chrome, flaky-to-absent on iOS Safari) and self-disables
// for the rest of the session on any error that signals it won't work here —
// the caller's text search always stays available as the fallback either way.
export function useSpeechSearch(onResult) {
  var [available, setAvailable] = useState(function () {
    return typeof window !== 'undefined' && !!(window.SpeechRecognition || window.webkitSpeechRecognition)
  })
  var [listening, setListening] = useState(false)
  var recogRef = useRef(null)
  var stopTimerRef = useRef(null)
  var onResultRef = useRef(onResult)
  onResultRef.current = onResult

  var stop = useCallback(function () {
    if (stopTimerRef.current) { clearTimeout(stopTimerRef.current); stopTimerRef.current = null }
    if (recogRef.current) {
      try { recogRef.current.stop() } catch { /* already stopped */ }
      recogRef.current = null
    }
    setListening(false)
  }, [])

  var start = useCallback(function () {
    if (!available || listening) return
    var SR = window.SpeechRecognition || window.webkitSpeechRecognition
    var recog = new SR()
    recog.lang = 'en-IN' // names are stored in Latin script regardless of UI language
    recog.interimResults = true
    recog.maxAlternatives = 5
    recog.continuous = false

    recog.onresult = function (e) {
      if (recogRef.current !== recog) return // a later session's late event
      var transcript = ''
      for (var i = 0; i < e.results.length; i++) transcript += e.results[i][0].transcript
      onResultRef.current(transcript)
    }
    recog.onerror = function (e) {
      if (recogRef.current !== recog) return
      if (['not-allowed', 'service-not-allowed', 'audio-capture', 'network'].indexOf(e.error) >= 0) {
        setAvailable(false)
      }
    }
    recog.onend = function () {
      if (recogRef.current !== recog) return // already superseded by a newer session
      stop()
    }

    recogRef.current = recog
    setListening(true)
    try {
      recog.start()
      stopTimerRef.current = setTimeout(stop, 6000)
    } catch {
      stop()
    }
  }, [available, listening, stop])

  useEffect(function () { return stop }, [stop])

  return { supported: available, listening: listening, start: start, stop: stop }
}
