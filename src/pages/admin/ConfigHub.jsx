// ConfigHub.jsx
// Admin → Config. Tab bar (Settings, Departments, Venues, Leave Override,
// Company Training Docs) over the matching admin screen; ?tab= picks the tab.
// On phones the tab bar scrolls sideways inside itself.

import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import AppConfig from './AppConfig'
import Departments from './Departments'
import Venues from './Venues'
import LeaveOverride from './LeaveOverride'
import TrainingDocs from './TrainingDocs'

var TABS = [
  { id: 'config', label: 'Settings', icon: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></> },
  { id: 'departments', label: 'Departments', icon: <><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M9 7h.01M15 7h.01M9 11h.01M15 11h.01M9 15h.01M15 15h.01M10 21v-3h4v3" /></> },
  { id: 'venues', label: 'Venues', icon: <><path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z" /><circle cx="12" cy="9.5" r="2.5" /></> },
  { id: 'leave_override', label: 'Leave Override', icon: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4M9 15.5l2 2 4-4" /></> },
  { id: 'training_docs', label: 'Company Training Docs', icon: <><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5z" /><path d="M4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5" /></> }
]

export default function ConfigHub() {
  // ?tab=venues etc. opens that tab (Dashboard shortcuts link here)
  var [params] = useSearchParams()
  var [tab, setTab] = useState(TABS.some(function (t) { return t.id === params.get('tab') }) ? params.get('tab') : 'config')

  return (
    <div>
      <div className="flex gap-1 mb-4 sm:mb-6 bg-white ring-1 ring-gray-200/70 shadow-sm rounded-xl p-1 w-fit max-w-full overflow-x-auto max-md:[scrollbar-width:none] max-md:[&::-webkit-scrollbar]:hidden">
        {TABS.map(function (t) {
          var isActive = tab === t.id
          return (
            <button
              key={t.id}
              onClick={function () { setTab(t.id) }}
              className={'px-3 sm:px-4 py-2 text-sm font-semibold rounded-lg transition-colors flex items-center gap-2 whitespace-nowrap shrink-0 ' +
                (isActive ? 'bg-blue-600 text-white shadow-sm shadow-blue-600/30' : 'text-gray-600 hover:bg-gray-100')}
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{t.icon}</svg>
              {t.label}
            </button>
          )
        })}
      </div>

      {tab === 'config' && <AppConfig />}
      {tab === 'departments' && <Departments />}
      {tab === 'venues' && <Venues />}
      {tab === 'leave_override' && <LeaveOverride />}
      {tab === 'training_docs' && <TrainingDocs />}
    </div>
  )
}