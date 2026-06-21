import { useEffect } from 'react'
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../../lib/useAuth'
import { refreshPushSubscription } from '../../lib/pushRefresh'
import { useLanguage, LanguageToggle } from '../../lib/i18n'

var ALL_TABS = [
  { to: '/', key: 'tab_home', icon: '🏠', tabId: 'home' },
  { to: '/attendance', key: 'tab_attendance', icon: '📅', tabId: 'attendance' },
  { to: '/claims', key: 'tab_claims', icon: '📝', tabId: 'claims' },
  { to: '/team', key: 'tab_team', icon: '👥', tabId: 'team' },
  { to: '/dept', key: 'tab_dept', icon: '📋', tabId: 'dept' },
  { to: '/dar', key: 'tab_dar', icon: '📝', tabId: 'dar' },
  { to: '/analysis', key: 'tab_analysis', icon: '📊', tabId: 'analysis' },
  { to: '/leave-override', key: 'tab_leave_override', icon: '📋', tabId: 'leave_override' },
]

var DEFAULT_TABS = {
  staff: ['home', 'attendance', 'claims'],
  supervisor: ['home', 'attendance', 'claims', 'team'],
  manager: ['home', 'attendance', 'claims', 'team', 'dept', 'analysis'],
  admin: ['home', 'attendance', 'claims', 'team', 'dept', 'dar', 'analysis'],
}
export default function MobileShell() {
  var { employee } = useAuth()
  var { t } = useLanguage()

  useEffect(function () {
    if (employee) refreshPushSubscription(employee.id)
  }, [employee])

  var navigate = useNavigate()
  var location = useLocation()

  useEffect(function () {
    window.history.pushState({ ambria: true }, '')

    function onPopState() {
      if (location.pathname === '/') {
        window.history.pushState({ ambria: true }, '')
      } else {
        navigate('/', { replace: true })
      }
    }

    window.addEventListener('popstate', onPopState)
    return function () {
      window.removeEventListener('popstate', onPopState)
    }
  }, [location.pathname, navigate])

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
            <NavLink to="/settings" className="text-white/50 hover:text-white transition-colors text-lg">⚙️</NavLink>
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
          {ALL_TABS.filter(function (tab) {
            var allowed = employee.visible_tabs || DEFAULT_TABS[employee.role] || DEFAULT_TABS.staff
            return allowed.includes(tab.tabId)
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