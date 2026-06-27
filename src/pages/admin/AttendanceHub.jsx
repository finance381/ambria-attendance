import { useState } from 'react'
import { useAuth } from '../../lib/useAuth'
import DailyAttendance from './DailyAttendance'
import MonthlyReport from './MonthlyReport'
import AdminDARs from './AdminDARs'
import AdminAnalysis from './AdminAnalysis'
import AnnualReport from './AnnualReport'

var ALL_TABS = [
  { id: 'daily', label: 'Daily', icon: '📋' },
  { id: 'monthly', label: 'Monthly', icon: '📊' },
  { id: 'analysis', label: 'Analysis', icon: '📈' },
  { id: 'annual', label: 'Annual', icon: '📅' },
]

export default function AttendanceHub() {
  var { employee } = useAuth()
  var tabs = ALL_TABS.filter(function (t) { return !t.roles || t.roles.includes(employee.role) })
  var [tab, setTab] = useState('daily')

  return (
    <div>
      <div className="flex gap-1 mb-5 bg-white border border-gray-200 rounded-xl p-1 w-fit">
        {tabs.map(function (t) {
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

      {tab === 'daily' && <DailyAttendance />}
      {tab === 'monthly' && <MonthlyReport />}
      {tab === 'dars' && <AdminDARs />}
      {tab === 'analysis' && <AdminAnalysis />}
      {tab === 'annual' && <AnnualReport />}
    </div>
  )
}
