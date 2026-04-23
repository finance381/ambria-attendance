import { Outlet, NavLink } from 'react-router-dom'
import { useAuth } from '../../lib/useAuth'
import { useLanguage, LanguageToggle } from '../../lib/i18n'

var TAB_KEYS = [
  { to: '/', key: 'tab_home', icon: '🏠', roles: null },
  { to: '/team', key: 'tab_team', icon: '👥', roles: ['supervisor', 'manager', 'admin'] },
  { to: '/claims', key: 'tab_claims', icon: '📝', roles: null },
  { to: '/dar', key: 'tab_dar', icon: '📋', roles: null, empCodes: ['AMB001'] },
  { to: '/attendance', key: 'tab_attendance', icon: '📅', roles: null },
  { to: '/settings', key: 'tab_settings', icon: '⚙️', roles: null },
]

export default function MobileShell() {
  var { employee } = useAuth()
  var { t } = useLanguage()

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* Header */}
      <header className="bg-slate-800 text-white px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-white/10 rounded-lg flex items-center justify-center">
              <span className="text-sm font-bold">A</span>
            </div>
            <div>
              <h1 className="text-sm font-semibold leading-tight">{t('app_name')}</h1>
              <p className="text-[10px] text-white/50">{employee.name} · {employee.designation || employee.role}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <a href="/"
              className="px-2 py-1 rounded-lg border border-white/10 text-white/50 text-xs font-semibold no-underline hover:text-white transition-colors"
            >⌂ Hub</a>
            <LanguageToggle />
          </div>
        </div>
      </header>

      {/* Page content */}
      <main className="px-4 py-4">
        <Outlet />
      </main>

      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-40">
        <div className="flex justify-around items-center h-16 max-w-lg mx-auto">
          {TAB_KEYS.filter(function (tab) {
            if (tab.empCodes) return tab.empCodes.includes(employee.emp_code)
            if (!tab.roles) return true
            return tab.roles.includes(employee.role)
          }).map(function (tab) {
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
                <span className="text-[10px] font-semibold">{t(tab.key)}</span>
              </NavLink>
            )
          })}
        </div>
      </nav>
    </div>
  )
}