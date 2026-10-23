// PeopleHub.jsx
// Admin → People. Tab bar (Employees, Casuals, Vendors — some admin-only)
// over the matching admin screen; ?tab= picks the tab. On phones the tab bar
// scrolls sideways inside itself.

import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAuth } from '../../lib/useAuth'
import Employees from './Employees'
import CasualReports from './CasualReports'
import Vendors from './Vendors'

var ALL_TABS = [
  { id: 'employees', label: 'Employees', icon: <><rect x="3" y="7" width="18" height="13" rx="2" /><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /><path d="M3 13h18" /></>, roles: ['admin'] },
  { id: 'casuals', label: 'Casuals', icon: <><path d="M10 10V5a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v5" /><path d="M14 6a6 6 0 0 1 6 6v3" /><path d="M4 15v-3a6 6 0 0 1 6-6" /><rect x="2" y="15" width="20" height="4" rx="1" /></> },
  { id: 'vendors', label: 'Vendors', icon: <><path d="M4 10v10h16V10" /><path d="M2.5 10L5 4h14l2.5 6z" /><path d="M10 20v-5h4v5" /></>, roles: ['admin'] },
]

export default function PeopleHub() {
  var { employee } = useAuth()
  var tabs = ALL_TABS.filter(function (t) { return !t.roles || t.roles.includes(employee.role) })
  // ?tab=employees etc. opens that tab (Dashboard shortcuts link here)
  var [params] = useSearchParams()
  var [tab, setTab] = useState(tabs.some(function (t) { return t.id === params.get('tab') }) ? params.get('tab') : (tabs[0] ? tabs[0].id : 'casuals'))

  return (
    <div>
      <div className="flex gap-1 mb-4 sm:mb-6 bg-white ring-1 ring-gray-200/70 shadow-sm rounded-xl p-1 w-fit max-w-full overflow-x-auto max-md:[scrollbar-width:none] max-md:[&::-webkit-scrollbar]:hidden">
        {tabs.map(function (t) {
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

      {tab === 'employees' && <Employees />}
      {tab === 'casuals' && <CasualReports />}
      {tab === 'vendors' && <Vendors />}
    </div>
  )
}
