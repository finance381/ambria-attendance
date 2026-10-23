// AttendanceHub.jsx
// Admin → Attendance. Tab bar (Daily, Monthly, Analysis, Annual) over the
// matching admin screen; ?tab= picks the tab. On phones the tab bar scrolls
// sideways inside itself instead of widening the page.

import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAuth } from '../../lib/useAuth'
import DailyAttendance from './DailyAttendance'
import MonthlyReport from './MonthlyReport'
import AdminDARs from './AdminDARs'
import AdminAnalysis from './AdminAnalysis'
import AnnualReport from './AnnualReport'

var ALL_TABS = [
  { id: 'daily', label: 'Daily', icon: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></> },
  { id: 'monthly', label: 'Monthly', icon: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4M8 14h.01M12 14h.01M16 14h.01M8 17.5h.01M12 17.5h.01" /></> },
  { id: 'analysis', label: 'Analysis', icon: <path d="M5 20V13M12 20V6M19 20v-9" /> },
  { id: 'annual', label: 'Annual', icon: <><path d="M4 20h16" /><path d="M6 16l4-5 3 3 5-7" /></> },
]

export default function AttendanceHub() {
  var { employee } = useAuth()
  var tabs = ALL_TABS.filter(function (t) { return !t.roles || t.roles.includes(employee.role) })
  // ?tab=monthly etc. opens that tab (Dashboard shortcuts link here)
  var [params] = useSearchParams()
  var [tab, setTab] = useState(tabs.some(function (t) { return t.id === params.get('tab') }) ? params.get('tab') : 'daily')

  return (
    <div>
      <div className="flex gap-1 mb-4 sm:mb-6 bg-white ring-1 ring-gray-200/70 shadow-sm rounded-xl p-1 w-fit max-w-full max-md:overflow-x-auto max-md:[scrollbar-width:none] max-md:[&::-webkit-scrollbar]:hidden">
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

      {tab === 'daily' && <DailyAttendance />}
      {tab === 'monthly' && <MonthlyReport />}
      {tab === 'dars' && <AdminDARs />}
      {tab === 'analysis' && <AdminAnalysis />}
      {tab === 'annual' && <AnnualReport />}
    </div>
  )
}
