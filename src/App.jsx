import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './lib/useAuth'
import Login from './pages/Login'
import MobileShell from './pages/mobile/MobileShell'
import Home from './pages/mobile/Home'
import MyAttendance from './pages/mobile/MyAttendance'
import Settings from './pages/mobile/Settings'
import AdminShell from './pages/admin/AdminShell'
import AdminDashboard from './pages/admin/AdminDashboard'
import Employees from './pages/admin/Employees'
import Departments from './pages/admin/Departments'
import Venues from './pages/admin/Venues'
import DailyAttendance from './pages/admin/DailyAttendance'
import MonthlyReport from './pages/admin/MonthlyReport'
import PunchForTeam from './pages/mobile/PunchForTeam'
import MyClaims from './pages/mobile/MyClaims'
import ClaimsQueue from './pages/admin/ClaimsQueue'

function ProtectedRoute({ children, roles }) {
  var { session, employee, loading } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <p className="text-sm text-gray-400">Loading…</p>
      </div>
    )
  }

  if (!session || !employee) {
    return <Navigate to="/login" replace />
  }

  if (roles && !roles.includes(employee.role)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <p className="text-sm text-red-500">Access denied — insufficient permissions</p>
      </div>
    )
  }

  return children
}

export default function App() {
  var { session, loading } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-slate-700 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-gray-400">Loading…</p>
        </div>
      </div>
    )
  }

  return (
    <Routes>
      <Route path="/login" element={
        session ? <Navigate to="/" replace /> : <Login />
      } />

      {/* Mobile PWA — all authenticated users */}
      <Route path="/" element={
        <ProtectedRoute>
          <MobileShell />
        </ProtectedRoute>
      }>
        <Route index element={<Home />} />
        <Route path="team" element={<PunchForTeam />} />
        <Route path="attendance" element={<MyAttendance />} />
        <Route path="claims" element={<MyClaims />} />
        <Route path="settings" element={<Settings />} />
      </Route>

      {/* Admin Desktop — manager + admin only */}
      <Route path="/admin" element={
        <ProtectedRoute roles={['admin', 'manager']}>
          <AdminShell />
        </ProtectedRoute>
      }>
        <Route index element={<AdminDashboard />} />
        <Route path="employees" element={
          <ProtectedRoute roles={['admin']}>
            <Employees />
          </ProtectedRoute>
        } />
        <Route path="departments" element={
          <ProtectedRoute roles={['admin']}>
            <Departments />
          </ProtectedRoute>
        } />
        <Route path="venues" element={
          <ProtectedRoute roles={['admin']}>
            <Venues />
          </ProtectedRoute>
        } />
        <Route path="attendance" element={
          <ProtectedRoute roles={['admin', 'manager']}>
            <DailyAttendance />
          </ProtectedRoute>
        } />
        <Route path="monthly" element={
          <ProtectedRoute roles={['admin', 'manager']}>
            <MonthlyReport />
          </ProtectedRoute>
        } />
        <Route path="claims" element={
          <ProtectedRoute roles={['admin', 'manager']}>
            <ClaimsQueue />
          </ProtectedRoute>
        } />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}