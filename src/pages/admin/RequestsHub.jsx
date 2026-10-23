// RequestsHub.jsx
// Admin → Requests. Tab bar (Claims, Leave Balances) over the matching admin
// screen. On phones the tab bar scrolls sideways inside itself.

import { useState } from 'react'
import ClaimsQueue from './ClaimsQueue'
import LeaveBalances from './LeaveBalances'
import { useAuth } from '../../lib/useAuth'

var TABS = [
  { id: 'claims', label: 'Claims', icon: <><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" /><path d="M14 3v6h6M9 15.5l1.5 1.5 4-4" /></> },
  { id: 'leaves', label: 'Leave Balances', icon: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></> },
]

export default function RequestsHub() {
  var [tab, setTab] = useState('claims')

  return (
    <div>
      <div className="flex gap-1 mb-4 sm:mb-6 bg-white ring-1 ring-gray-200/70 shadow-sm rounded-xl p-1 w-fit max-w-full max-md:overflow-x-auto max-md:[scrollbar-width:none] max-md:[&::-webkit-scrollbar]:hidden">
        {TABS.map(function (t) {
          var isActive = tab === t.id
          return (
            <button key={t.id} onClick={function () { setTab(t.id) }}
              className={'px-3 sm:px-4 py-2 text-sm font-semibold rounded-lg transition-colors flex items-center gap-2 whitespace-nowrap shrink-0 ' +
                (isActive ? 'bg-blue-600 text-white shadow-sm shadow-blue-600/30' : 'text-gray-600 hover:bg-gray-100')}>
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{t.icon}</svg>
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
