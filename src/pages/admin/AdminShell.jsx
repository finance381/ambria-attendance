// AdminShell.jsx
// Frame around the desktop admin pages: dark header (avatar, title, Hub /
// Back to App / Sign Out), a white tab bar with line icons (active tab in
// blue with an underline), and the page on a soft blue-grey background, all
// at full browser width.
// Tabs are filtered by role and, for non-admins, by visible_tabs.
// Phones: header buttons show icons only, tighter padding, and the tab bar
// scrolls sideways inside itself; sm:+ restores the desktop sizes.

import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../../lib/useAuth'

var NAV_ITEMS = [
  { to: '/admin', label: 'Overview', icon: 'overview', tabKey: 'home' },
  { to: '/admin/attendance', label: 'Attendance', icon: 'attendance', tabKey: 'attendance' },
  { to: '/admin/people', label: 'People', icon: 'people', tabKey: 'team' },
  { to: '/admin/requests', label: 'Requests', icon: 'requests', tabKey: 'claims' },
  { to: '/admin/config', label: 'Config', icon: 'config', roles: ['admin'] },
  { to: '/admin/new-joiners', label: 'New Joiners', icon: 'joiners', roles: ['admin'] },
]

var DEFAULT_TABS = {
  staff: ['home', 'attendance', 'claims'],
  supervisor: ['home', 'attendance', 'claims', 'team'],
  manager: ['home', 'attendance', 'claims', 'team', 'dept', 'analysis'],
  admin: ['home', 'attendance', 'claims', 'team', 'dept', 'dar', 'analysis'],
}

export default function AdminShell() {
  var { employee, logout } = useAuth()
  var navigate = useNavigate()

  async function handleLogout() {
    await logout()
    navigate('/login')
  }

  return (
    <div className="min-h-screen bg-[#f3f6fb]">
      <header className="bg-slate-900 text-white pt-[env(safe-area-inset-top)]">
        <div className="w-full px-4 sm:px-6 lg:px-8 py-2.5 sm:py-3.5 flex items-center justify-between gap-2 sm:gap-4">
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
            <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-blue-600 flex items-center justify-center shrink-0 ring-2 ring-white/10">
              <span className="text-[13px] sm:text-[15px] font-bold">A</span>
            </div>
            <div className="min-w-0">
              <h1 className="text-[13px] sm:text-[15px] font-semibold leading-tight truncate">
                Ambria Attendance <span className="text-white/40 font-normal">·</span> <span className="text-blue-300">Admin</span>
              </h1>
              <p className="text-[11px] sm:text-xs text-white/55 truncate">{employee.name} · <span className="capitalize">{employee.role}</span></p>
            </div>
          </div>
          <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
            <a href="/" aria-label="Hub" title="Hub"
              className="h-9 w-9 sm:w-auto justify-center sm:px-3 inline-flex items-center gap-1.5 rounded-lg text-white/75 text-sm font-medium no-underline hover:text-white hover:bg-white/10 transition-colors">
              <ShellIcon name="hub" className="w-4 h-4" />
              <span className="hidden sm:inline">Hub</span>
            </a>
            <button
              onClick={function () { navigate('/') }}
              aria-label="Back to App" title="Back to App"
              className="h-9 w-9 sm:w-auto justify-center sm:px-3 inline-flex items-center gap-1.5 rounded-lg text-white/75 text-sm font-medium hover:text-white hover:bg-white/10 transition-colors"
            >
              <ShellIcon name="phone" className="w-4 h-4" />
              <span className="hidden sm:inline">Back to App</span>
            </button>
            <button
              onClick={handleLogout}
              aria-label="Sign Out" title="Sign Out"
              className="h-9 w-9 sm:w-auto justify-center sm:px-3 inline-flex items-center gap-1.5 rounded-lg bg-white/10 text-white text-sm font-medium hover:bg-white/15 transition-colors"
            >
              <ShellIcon name="logout" className="w-4 h-4" />
              <span className="hidden sm:inline">Sign Out</span>
            </button>
          </div>
        </div>
      </header>

      <nav className="bg-white border-b border-gray-200/80 shadow-[0_1px_2px_rgba(15,23,42,0.04)] overflow-x-auto max-md:[scrollbar-width:none] max-md:[&::-webkit-scrollbar]:hidden sticky top-0 z-20">
        <div className="w-max min-w-full px-4 sm:px-6 lg:px-8 flex gap-0.5 sm:gap-1">
          {NAV_ITEMS.filter(function (item) {
             if (item.roles && !item.roles.includes(employee.role)) return false
             if (item.empCodes && !item.empCodes.includes(employee.emp_code)) return false
             if (item.tabKey && employee.role !== 'admin') {
               var tabs = employee.visible_tabs || DEFAULT_TABS[employee.role] || DEFAULT_TABS.staff
               if (!tabs.includes(item.tabKey)) return false
             }
             return true
           }).map(function (item) {
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/admin'}
                className={function ({ isActive }) {
                  return 'flex items-center gap-2 px-3 sm:px-3.5 py-3 sm:py-3.5 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ' +
                    (isActive
                      ? 'border-blue-600 text-blue-700'
                      : 'border-transparent text-gray-500 hover:text-gray-800')
                }}
              >
                <ShellIcon name={item.icon} className="w-4.5 h-4.5" />
                {item.label}
              </NavLink>
            )
          })}
        </div>
      </nav>

      <main className="w-full px-4 sm:px-6 lg:px-8 py-4 sm:py-6">
        <Outlet />
      </main>
    </div>
  )
}

// Line icons for the admin header and tabs (24x24)
function ShellIcon({ name, className }) {
  var paths = {
    overview: <><rect x="3" y="3" width="7" height="9" rx="1.5" /><rect x="14" y="3" width="7" height="5" rx="1.5" /><rect x="14" y="12" width="7" height="9" rx="1.5" /><rect x="3" y="16" width="7" height="5" rx="1.5" /></>,
    attendance: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4M8.5 15l2 2 4-4" /></>,
    people: <><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0" /><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14a6.5 6.5 0 0 1 3.5 6" /></>,
    requests: <><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" /><path d="M14 3v6h6M9 15.5l1.5 1.5 4-4" /></>,
    config: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></>,
    joiners: <><circle cx="10" cy="8" r="3.5" /><path d="M3.5 20a6.5 6.5 0 0 1 11-4.7" /><path d="M18 14v6M15 17h6" /></>,
    hub: <><path d="M3 10.5L12 3l9 7.5" /><path d="M5 9.5V20a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V9.5" /></>,
    phone: <><rect x="7" y="2" width="10" height="20" rx="2" /><path d="M11 18h2" /></>,
    logout: <><path d="M14 17l5-5-5-5M19 12H8" /><path d="M10 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h5" /></>
  }
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>
  )
}
