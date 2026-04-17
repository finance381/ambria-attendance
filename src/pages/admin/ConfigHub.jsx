import { useState } from 'react'
import AppConfig from './AppConfig'
import Departments from './Departments'
import Venues from './Venues'

var TABS = [
  { id: 'config', label: 'Settings', icon: '⚙️' },
  { id: 'departments', label: 'Departments', icon: '🏢' },
  { id: 'venues', label: 'Venues', icon: '📍' }
]

export default function ConfigHub() {
  var [tab, setTab] = useState('config')

  return (
    <div>
      <div className="flex gap-1 mb-5 bg-white border border-gray-200 rounded-xl p-1 w-fit">
        {TABS.map(function (t) {
          var isActive = tab === t.id
          return (
            <button
              key={t.id}
              onClick={function () { setTab(t.id) }}
              className={'px-4 py-2 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 ' +
                (isActive ? 'bg-slate-800 text-white' : 'text-gray-600 hover:bg-gray-100')}
            >
              <span>{t.icon}</span>
              {t.label}
            </button>
          )
        })}
      </div>

      {tab === 'config' && <AppConfig />}
      {tab === 'departments' && <Departments />}
      {tab === 'venues' && <Venues />}
    </div>
  )
}