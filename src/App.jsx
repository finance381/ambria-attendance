import { useEffect, lazy, Suspense } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './lib/useAuth'
import { preloadFaceModels } from './lib/camera'
import Login from './pages/Login'
import MobileShell from './pages/mobile/MobileShell'
import AdminShell from './pages/admin/AdminShell'

const Home = lazy(() => import('./pages/mobile/Home'))
const MyAttendance = lazy(() => import('./pages/mobile/MyAttendance'))
const Settings = lazy(() => import('./pages/mobile/Settings'))
const AdminDashboard = lazy(() => import('./pages/admin/AdminDashboard'))
const AttendanceHub = lazy(() => import('./pages/admin/AttendanceHub'))
const PeopleHub = lazy(() => import('./pages/admin/PeopleHub'))
const RequestsHub = lazy(() => import('./pages/admin/RequestsHub'))
const ConfigHub = lazy(() => import('./pages/admin/ConfigHub'))
const PunchForTeam = lazy(() => import('./pages/mobile/PunchForTeam'))
const DeptAttendance = lazy(() => import('./pages/mobile/DeptAttendance'))
const MyClaims = lazy(() => import('./pages/mobile/MyClaims'))
const ClaimsApproval = lazy(() => import('./pages/mobile/ClaimsApproval'))
const DARWriter = lazy(() => import('./pages/mobile/DARWriter'))
const AdminAnalysis = lazy(() => import('./pages/admin/AdminAnalysis'))
const Analysis = lazy(() => import('./pages/mobile/Analysis'))
const LeaveOverride = lazy(() => import('./pages/admin/LeaveOverride'))
const AnnualReport = lazy(() => import('./pages/admin/AnnualReport'))

function PageLoading() {
  return <p className="text-sm text-gray-400 text-center py-12">Loading…</p>
}

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

  // Preload face-detection models right after login so the punch camera opens instantly
  useEffect(function () {
    if (session) preloadFaceModels()
  }, [session])

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
    <Suspense fallback={<PageLoading />}>
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
          <Route path="team" element={
            <ProtectedRoute roles={['supervisor', 'manager', 'admin']}>
              <PunchForTeam />
            </ProtectedRoute>
          } />
          <Route path="dept" element={
            <ProtectedRoute roles={['manager', 'admin']}>
              <DeptAttendance />
            </ProtectedRoute>
          } />
          <Route path="attendance" element={<MyAttendance />} />
          <Route path="claims" element={<MyClaims />} />
          <Route path="claims-approval" element={
            <ProtectedRoute roles={['manager', 'admin']}>
              <ClaimsApproval />
            </ProtectedRoute>
          } />
          <Route path="dar" element={
             <ProtectedRoute>
               <DARWriter />
             </ProtectedRoute>
           } />
          <Route path="analysis" element={
            <ProtectedRoute roles={['manager', 'admin']}>
              <Analysis />
            </ProtectedRoute>
          } />
          <Route path="settings" element={<Settings />} />
          <Route path="leave-override" element={<LeaveOverride />} />
        </Route>

        {/* Admin Desktop — manager + admin only */}
        <Route path="/admin" element={
          <ProtectedRoute roles={['admin', 'manager']}>
            <AdminShell />
          </ProtectedRoute>
        }>
          <Route index element={<AdminDashboard />} />
          <Route path="attendance" element={
            <ProtectedRoute roles={['admin', 'manager']}>
              <AttendanceHub />
            </ProtectedRoute>
          } />
          <Route path="people" element={
            <ProtectedRoute roles={['admin', 'manager']}>
              <PeopleHub />
            </ProtectedRoute>
          } />
          <Route path="requests" element={
            <ProtectedRoute roles={['admin', 'manager']}>
              <RequestsHub />
            </ProtectedRoute>
          } />
          <Route path="config" element={
            <ProtectedRoute roles={['admin']}>
              <ConfigHub />
            </ProtectedRoute>
          } />
        </Route>


        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  )
}
