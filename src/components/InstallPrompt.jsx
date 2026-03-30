import { useState, useEffect } from 'react'

var deferredPrompt = null

export default function InstallPrompt() {
  var [showInstall, setShowInstall] = useState(false)
  var [dismissed, setDismissed] = useState(false)

  useEffect(function () {
    // Check if already installed
    if (window.matchMedia('(display-mode: standalone)').matches) return

    // Check if previously dismissed this session
    if (sessionStorage.getItem('pwa-dismissed')) return

    function handleBeforeInstall(e) {
      e.preventDefault()
      deferredPrompt = e
      setShowInstall(true)
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstall)

    return function () {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall)
    }
  }, [])

  async function handleInstall() {
    if (!deferredPrompt) return

    deferredPrompt.prompt()
    var result = await deferredPrompt.userChoice

    if (result.outcome === 'accepted') {
      setShowInstall(false)
    }
    deferredPrompt = null
  }

  function handleDismiss() {
    setShowInstall(false)
    setDismissed(true)
    sessionStorage.setItem('pwa-dismissed', '1')
  }

  if (!showInstall || dismissed) return null

  return (
    <div className="bg-slate-800 rounded-2xl px-4 py-3 mb-4 flex items-center justify-between gap-3">
      <div className="flex items-center gap-3 min-w-0">
        <div className="w-10 h-10 bg-white/10 rounded-xl flex items-center justify-center flex-shrink-0">
          <span className="text-white text-lg font-bold">A</span>
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-white">Install App</p>
          <p className="text-[11px] text-white/50 truncate">Add to home screen for quick access</p>
        </div>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        <button
          onClick={handleDismiss}
          className="text-[11px] text-white/40 hover:text-white/70 transition-colors px-1"
        >
          Later
        </button>
        <button
          onClick={handleInstall}
          className="px-3 py-1.5 text-xs font-semibold text-slate-800 bg-white rounded-lg hover:bg-gray-100 transition-colors"
        >
          Install
        </button>
      </div>
    </div>
  )
}