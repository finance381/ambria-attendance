import { useState } from 'react'
import ClaimsQueue from './ClaimsQueue'
import LeaveBalances from './LeaveBalances'
import { useAuth } from '../../lib/useAuth'

var TABS = [
  { id: 'claims', label: 'Claims', icon: '📝' },
  { id: 'leaves', label: 'Leave Balances', icon: '🏖️' },
]

export default function RequestsHub() {
  var [tab, setTab] = useState('claims')

  return (
    <div>
      <div className="flex gap-1 mb-5 bg-white border border-gray-200 rounded-xl p-1 w-fit">
        {TABS.map(function (t) {
          var isActive = tab === t.id
          return (
            <button key={t.id} onClick={function () { setTab(t.id) }}
              className={'px-4 py-2 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 ' +
                (isActive ? 'bg-slate-800 text-white' : 'text-gray-600 hover:bg-gray-100')}>
              <span>{t.icon}</span>
              {t.label}
            </button>
          )
        })}
      </div>

      {tab === 'claims' && <ClaimsQueue />}
      {tab === 'leaves' && <LeaveBalances />}
    </div>
  )
}
