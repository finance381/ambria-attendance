import { useState, useEffect } from 'react'
import { useLanguage } from '../lib/i18n'

var deferredPrompt = null

export default function InstallPrompt() {
  var [mode, setMode] = useState(null)
  var [dismissed, setDismissed] = useState(false)
  var { t } = useLanguage()

  useEffect(function () {
    if (window.matchMedia('(display-mode: standalone)').matches) return
    if (navigator.standalone === true) return

    var lastDismissed = localStorage.getItem('pwa-dismissed')
    if (lastDismissed) {
      var daysSince = (Date.now() - Number(lastDismissed)) / (1000 * 60 * 60 * 24)
      if (daysSince < 7) return
    }

    var ua = navigator.userAgent
    var isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
    var isSafari = /Safari/.test(ua) && !/CriOS|FxiOS|OPiOS|EdgiOS/.test(ua)

    if (isIOS && isSafari) {
      setMode('ios')
      return
    }

    if (isIOS && !isSafari) {
      setMode('ios-other')
      return
    }

    function handleBeforeInstall(e) {
      e.preventDefault()
      deferredPrompt = e
      setMode('native')
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstall)

    return function () {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall)
    }
  }, [])

  async function handleNativeInstall() {
    if (!deferredPrompt) return
    deferredPrompt.prompt()
    var result = await deferredPrompt.userChoice
    if (result.outcome === 'accepted') {
      setMode(null)
    }
    deferredPrompt = null
  }

  function handleDismiss() {
    setMode(null)
    setDismissed(true)
    localStorage.setItem('pwa-dismissed', String(Date.now()))
  }

  if (!mode || dismissed) return null

  // ── Native install (Android/Chrome) ──────────────────────────────
  if (mode === 'native') {
    return (
      <div className="bg-slate-800 rounded-2xl px-4 py-3 mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 bg-white/10 rounded-xl flex items-center justify-center flex-shrink-0">
            <span className="text-white text-lg font-bold">A</span>
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-white">{t('install_title')}</p>
            <p className="text-[11px] text-white/50 truncate">{t('install_desc')}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button onClick={handleDismiss}
            className="text-[11px] text-white/40 hover:text-white/70 transition-colors px-1">
            {t('later')}
          </button>
          <button onClick={handleNativeInstall}
            className="px-3 py-1.5 text-xs font-semibold text-slate-800 bg-white rounded-lg hover:bg-gray-100 transition-colors">
            {t('install_btn')}
          </button>
        </div>
      </div>
    )
  }

  // ── iOS Safari — step-by-step guidance ───────────────────────────
  if (mode === 'ios') {
    return (
      <div className="bg-slate-800 rounded-2xl px-4 py-3.5 mb-4">
        <div className="flex items-start justify-between gap-3 mb-2.5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white/10 rounded-xl flex items-center justify-center flex-shrink-0">
              <span className="text-white text-lg font-bold">A</span>
            </div>
            <div>
              <p className="text-sm font-semibold text-white">{t('install_title')}</p>
              <p className="text-[11px] text-white/50">{t('install_ios_desc')}</p>
            </div>
          </div>
          <button onClick={handleDismiss}
            className="text-[11px] text-white/40 hover:text-white/70 transition-colors px-1 pt-1">
            ✕
          </button>
        </div>
        <div className="bg-white/10 rounded-xl px-3 py-2.5 space-y-2">
          <div className="flex items-center gap-2.5">
            <span className="w-5 h-5 bg-white/20 rounded-full flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0">1</span>
            <p className="text-xs text-white/80">
              {t('install_ios_step1')} <span className="inline-flex items-center align-middle mx-0.5">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-blue-400">
                  <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
                  <polyline points="16 6 12 2 8 6" />
                  <line x1="12" y1="2" x2="12" y2="15" />
                </svg>
              </span> <strong className="text-white">{t('install_ios_share')}</strong> {t('install_ios_step1_end')}
            </p>
          </div>
          <div className="flex items-center gap-2.5">
            <span className="w-5 h-5 bg-white/20 rounded-full flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0">2</span>
            <p className="text-xs text-white/80">{t('install_ios_step2')} <strong className="text-white">{t('install_ios_step2_bold')}</strong></p>
          </div>
          <div className="flex items-center gap-2.5">
            <span className="w-5 h-5 bg-white/20 rounded-full flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0">3</span>
            <p className="text-xs text-white/80">{t('install_ios_step3')} <strong className="text-white">{t('install_ios_step3_bold')}</strong> {t('install_ios_step3_end')}</p>
          </div>
        </div>
      </div>
    )
  }

  // ── iOS but not Safari ───────────────────────────────────────────
  if (mode === 'ios-other') {
    return (
      <div className="bg-slate-800 rounded-2xl px-4 py-3 mb-4 flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-white/10 rounded-xl flex items-center justify-center flex-shrink-0">
            <span className="text-white text-lg font-bold">A</span>
          </div>
          <div>
            <p className="text-sm font-semibold text-white">{t('install_title')}</p>
            <p className="text-[11px] text-white/50 leading-relaxed">
              {t('install_ios_other')} <strong className="text-white">{t('install_ios_safari')}</strong> {t('install_ios_other_end')}
            </p>
          </div>
        </div>
        <button onClick={handleDismiss}
          className="text-[11px] text-white/40 hover:text-white/70 transition-colors px-1 pt-1 flex-shrink-0">
          ✕
        </button>
      </div>
    )
  }

  return null
}