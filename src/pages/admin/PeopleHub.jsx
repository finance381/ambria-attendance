import { useState } from 'react'
import { useAuth } from '../../lib/useAuth'
import Employees from './Employees'
import CasualReports from './CasualReports'
import Vendors from './Vendors'

var ALL_TABS = [
  { id: 'employees', label: 'Employees', icon: '👨‍💼', roles: ['admin'] },
  { id: 'casuals', label: 'Casuals', icon: '👷' },
  { id: 'vendors', label: 'Vendors', icon: '🏪', roles: ['admin'] },
]

export default function PeopleHub() {
  var { employee } = useAuth()
  var tabs = ALL_TABS.filter(function (t) { return !t.roles || t.roles.includes(employee.role) })
  var [tab, setTab] = useState(tabs[0] ? tabs[0].id : 'casuals')

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

      {tab === 'employees' && <Employees />}
      {tab === 'casuals' && <CasualReports />}
      {tab === 'vendors' && <Vendors />}
    </div>
  )
}
