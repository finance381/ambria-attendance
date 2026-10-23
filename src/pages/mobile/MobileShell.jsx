// MobileShell.jsx
// Frame around every mobile screen: warm cream background, a soft-UI header
// card (avatar, settings, Hub, language), the page, and a soft-UI tab bar
// (active tab in a pressed-in well, indigo). Tabs shown come from the
// employee's visible_tabs, or their role's defaults.
// The root's .mobile-theme class switches on the mobile palette in index.css
// (blue -> indigo accent, gray/slate -> warm stone).
// Header, page and tab bar share one phone-width column (max-w-lg), so on a
// laptop the app stays a centred phone-sized layout instead of stretching.

import { useEffect } from 'react'
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../../lib/useAuth'
import { refreshPushSubscription } from '../../lib/pushRefresh'
import { useLanguage, LanguageToggle } from '../../lib/i18n'
import PullToRefresh from '../../components/PullToRefresh'

var ALL_TABS = [
  { to: '/', key: 'tab_home', tabId: 'home' },
  { to: '/attendance', key: 'tab_attendance', tabId: 'attendance' },
  { to: '/claims', key: 'tab_claims', tabId: 'claims' },
  { to: '/claims-approval', key: 'tab_claims_approve', tabId: 'claims_approve' },
  { to: '/team', key: 'tab_team', tabId: 'team' },
  { to: '/dept', key: 'tab_dept', tabId: 'dept' },
  { to: '/dar', key: 'tab_dar', tabId: 'dar' },
  { to: '/analysis', key: 'tab_analysis', tabId: 'analysis' },
  { to: '/leave-override', key: 'tab_leave_override', tabId: 'leave_override' },
  { to: '/my-tasks', key: 'tab_tasks', tabId: 'tasks' },
]

var DEFAULT_TABS = {
  staff: ['home', 'attendance', 'claims'],
  supervisor: ['home', 'attendance', 'claims', 'team'],
  manager: ['home', 'attendance', 'claims', 'team', 'dept', 'analysis'],
  admin: ['home', 'attendance', 'claims', 'team', 'dept', 'analysis'],
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

  var allowed = employee.visible_tabs || DEFAULT_TABS[employee.role] || DEFAULT_TABS.staff
  var tabs = ALL_TABS.filter(function (tab) { return allowed.includes(tab.tabId) })

  return (
    <div className="mobile-theme relative min-h-screen pb-[calc(6.5rem+env(safe-area-inset-bottom))]">
      {/* Warm cream background with soft corner washes (fixed so it doesn't scroll) */}
      <div aria-hidden="true" className="app-gradient fixed inset-0 z-0 pointer-events-none" />

      {/* Header: a raised neumorphic bar */}
      <header className="sticky top-0 z-30 px-3 pt-[calc(0.5rem+env(safe-area-inset-top))]">
        <div className="neu max-w-lg mx-auto flex items-center justify-between gap-3 rounded-2xl text-slate-800 px-3 py-2.5">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-full bg-linear-to-br from-blue-500 to-blue-700 text-white flex items-center justify-center shrink-0 shadow-md shadow-blue-700/25">
              <span className="text-sm font-bold">A</span>
            </div>
            <div className="min-w-0">
              <h1 className="text-[15px] font-semibold leading-tight truncate">{t('app_name')}</h1>
              <p className="text-[11px] text-slate-500 truncate">{employee.name} · {employee.designation || employee.role}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <NavLink to="/settings" aria-label={t('settings_title')}
              className="neu-press w-8 h-8 inline-flex items-center justify-center rounded-lg text-slate-600 hover:text-blue-600">
              <TabIcon name="settings" className="w-4 h-4" />
            </NavLink>
            <a href="/"
              className="neu-press h-8 px-2 inline-flex items-center gap-1 rounded-lg text-slate-600 text-xs font-semibold no-underline hover:text-blue-600">
              <TabIcon name="home" className="w-3.5 h-3.5" />
              Hub
            </a>
            <LanguageToggle className="neu-press h-8 px-2.5 text-xs font-bold rounded-lg text-slate-600 hover:text-blue-600 tracking-wide" />
          </div>
        </div>
      </header>

      {/* Page content */}
      <main className="relative z-10 px-4 py-5 max-w-lg mx-auto">
        <PullToRefresh>
          <Outlet />
        </PullToRefresh>
      </main>

      {/* Bottom tabs: a raised neumorphic bar; the active tab's icon sits in a
          pressed-in well, in blue */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 px-3 pb-[calc(0.5rem+env(safe-area-inset-bottom))]">
        <div className="neu flex justify-around items-stretch h-17 max-w-lg mx-auto rounded-2xl px-1">
          {tabs.map(function (tab) {
            return (
              <NavLink
                key={tab.to}
                to={tab.to}
                end={tab.to === '/'}
                className={function ({ isActive }) {
                  return 'relative flex-1 flex flex-col items-center justify-center gap-1 transition-colors ' +
                    (isActive ? 'text-blue-600' : 'text-slate-500 hover:text-slate-800')
                }}
              >
                {function ({ isActive }) {
                  return (
                    <>
                      <span className={'w-10 h-8 rounded-xl inline-flex items-center justify-center transition-all ' +
                        (isActive ? 'neu-inset' : '')}>
                        <TabIcon name={tab.tabId} className="w-5 h-5" />
                      </span>
                      <span className={'text-[11px] ' + (isActive ? 'font-semibold' : 'font-medium')}>{t(tab.key)}</span>
                    </>
                  )
                }}
              </NavLink>
            )
          })}
        </div>
      </nav>
    </div>
  )
}

// Line icons for the header and bottom tabs (24x24). `active` adds a light
// fill (not used by the tab bar now; its active tile is the highlight).
function TabIcon({ name, className, active }) {
  var tint = { fill: active ? 'currentColor' : 'none', fillOpacity: active ? 0.15 : 0 }
  var paths = {
    home: <><path d="M3 10.5L12 3l9 7.5" /><path d="M5 9.5V20a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V9.5" {...tint} /></>,
    attendance: <><rect x="3" y="5" width="18" height="16" rx="2" {...tint} /><path d="M3 10h18M8 3v4M16 3v4" /><path d="M8 14h.01M12 14h.01M16 14h.01M8 17.5h.01M12 17.5h.01" /></>,
    claims: <><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" {...tint} /><path d="M14 3v6h6" /><path d="M9 15.5l1.5 1.5 4-4" /></>,
    claims_approve: <><rect x="4" y="4" width="16" height="16" rx="3" {...tint} /><path d="M8.5 12l2.5 2.5 4.5-5" /></>,
    team: <><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0" /><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14a6.5 6.5 0 0 1 3.5 6" /></>,
    dept: <><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" {...tint} /><rect x="9" y="3" width="6" height="4" rx="1" /><path d="M9 12h6M9 16h4" /></>,
    dar: <><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" {...tint} /><path d="M14 3v6h6M8 13h8M8 17h5" /></>,
    analysis: <path d="M5 20V13M12 20V6M19 20v-9" />,
    leave_override: <><rect x="3" y="5" width="18" height="16" rx="2" {...tint} /><path d="M3 10h18M8 3v4M16 3v4M10 14l4 4M14 14l-4 4" /></>,
    tasks: <><rect x="4" y="4" width="16" height="16" rx="3" {...tint} /><path d="M8 9h8M8 13h8M8 17h5" /></>,
    settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></>
  }
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>
  )
}
