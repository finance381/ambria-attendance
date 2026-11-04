import { useState, useCallback } from 'react'
import { useLanguage } from '../../lib/i18n'
import SalariedPunch from './SalariedPunch'
import CasualTokenPunch from './CasualTokenPunch'

export default function PunchForTeam() {
  var [punchMode, setPunchMode] = useState('casual')
  var [toast, setToast] = useState('')
  var { t } = useLanguage()

  var showToast = useCallback(function (msg) {
    setToast(msg)
    setTimeout(function () { setToast('') }, 2500)
  }, [])

  return (
    <div>
      <h2 className="text-[22px] font-bold text-slate-900 tracking-tight leading-tight">{t('team_title')}</h2>
      <p className="text-[13px] text-slate-500 mt-1 mb-4">{t('team_subtitle')}</p>

      {/* Salaried Staff vs Casual Workers mode */}
      <div className="flex gap-1 neu rounded-2xl p-1.5 mb-5">
        <button
          onClick={function () { setPunchMode('salaried') }}
          className={'flex-1 py-2 text-xs font-semibold rounded-xl transition-colors ' +
            (punchMode === 'salaried' ? 'neu-on text-blue-600' : 'text-gray-600')}
        >
          {t('team_mode_salaried')}
        </button>
        <button
          onClick={function () { setPunchMode('casual') }}
          className={'flex-1 py-2 text-xs font-semibold rounded-xl transition-colors ' +
            (punchMode === 'casual' ? 'neu-on text-blue-600' : 'text-gray-600')}
        >
          {t('team_mode_casual')}
        </button>
      </div>

      {punchMode === 'salaried' && <SalariedPunch showToast={showToast} />}
      {punchMode === 'casual' && <CasualTokenPunch showToast={showToast} />}

      {toast && (
        <div className="fixed bottom-20 left-4 right-4 bg-slate-800 text-white px-5 py-3 rounded-xl text-sm shadow-lg z-50 text-center">
          {toast}
        </div>
      )}
    </div>
  )
}
