import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../../lib/useAuth'
//import AdminAnalysis from './pages/admin/AdminAnalysis'

var NAV_ITEMS = [
  { to: '/admin', label: 'Overview', icon: '📊', tabKey: 'home' },
  { to: '/admin/attendance', label: 'Attendance', icon: '📋', tabKey: 'attendance' },
  { to: '/admin/people', label: 'People', icon: '👥', tabKey: 'team' },
  { to: '/admin/requests', label: 'Requests', icon: '📝', tabKey: 'claims' },
  { to: '/admin/config', label: 'Config', icon: '⚙️', roles: ['admin'] },
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
    <div className="min-h-screen bg-gray-50">
      <header className="bg-slate-800 text-white">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-white/10 rounded-lg flex items-center justify-center">
              <span className="text-sm font-bold">A</span>
            </div>
            <div>
              <h1 className="text-sm font-semibold leading-tight">Ambria Attendance — Admin</h1>
              <p className="text-[10px] text-white/50">{employee.name} · {employee.role}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <a href="/"
              className="px-2 py-1 rounded-lg border border-white/10 text-white/50 text-xs font-semibold no-underline hover:text-white transition-colors"
            >⌂ Hub</a>
            <button
              onClick={function () { navigate('/') }}
              className="text-xs text-white/60 hover:text-white transition-colors px-2 py-1"
            >
              ← Back to App
            </button>
            <button
              onClick={handleLogout}
              className="text-xs text-white/60 hover:text-white transition-colors px-2 py-1"
            >
              Sign Out
            </button>
          </div>
        </div>
      </header>

      <nav className="bg-white border-b border-gray-200 overflow-x-auto">
        <div className="max-w-5xl mx-auto px-4 flex">
          {NAV_ITEMS.filter(function (item) {
             if (item.roles && !item.roles.includes(employee.role)) return false
             if (item.empCodes && !item.empCodes.includes(employee.emp_code)) return false
             if (item.tabKey) {
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
                  return 'flex items-center gap-1.5 px-4 py-3 text-xs font-medium border-b-2 whitespace-nowrap transition-colors ' +
                    (isActive
                      ? 'border-slate-800 text-slate-800'
                      : 'border-transparent text-gray-500 hover:text-gray-700')
                }}
              >
                <span>{item.icon}</span>
                {item.label}
              </NavLink>
            )
          })}
        </div>
      </nav>

      <main className="max-w-5xl mx-auto px-4 py-5">
        <Outlet />
      </main>
    </div>
  )
}