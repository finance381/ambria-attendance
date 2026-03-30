import { Outlet, NavLink } from 'react-router-dom'
import { useAuth } from '../../lib/useAuth'

var TABS = [
  { to: '/', label: 'Home', icon: '🏠' },
  { to: '/attendance', label: 'Attendance', icon: '📅' },
  { to: '/settings', label: 'Settings', icon: '⚙️' },
]

export default function MobileShell() {
  var { employee } = useAuth()

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* Header */}
      <header className="bg-slate-800 text-white px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-white/10 rounded-lg flex items-center justify-center">
            <span className="text-sm font-bold">A</span>
          </div>
          <div>
            <h1 className="text-sm font-semibold leading-tight">Ambria Attendance</h1>
            <p className="text-[10px] text-white/50">{employee.name} · {employee.designation || employee.role}</p>
          </div>
        </div>
      </header>

      {/* Page content */}
      <main className="px-4 py-4">
        <Outlet />
      </main>

      {/* Bottom tab bar */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-40">
        <div className="flex justify-around items-center h-16 max-w-lg mx-auto">
          {TABS.map(function (tab) {
            return (
              <NavLink
                key={tab.to}
                to={tab.to}
                end={tab.to === '/'}
                className={function ({ isActive }) {
                  return 'flex flex-col items-center gap-0.5 px-3 py-1 rounded-lg transition-colors ' +
                    (isActive
                      ? 'text-slate-800'
                      : 'text-gray-400')
                }}
              >
                <span className="text-xl leading-none">{tab.icon}</span>
                <span className="text-[10px] font-semibold">{tab.label}</span>
              </NavLink>
            )
          })}
        </div>
      </nav>
    </div>
  )
}