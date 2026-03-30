import { useState } from 'react'
import { useAuth } from '../../lib/useAuth'

export default function Settings() {
  var { employee, changePassword, logout } = useAuth()
  var [showChangePw, setShowChangePw] = useState(false)
  var [currentPw, setCurrentPw] = useState('')
  var [newPw, setNewPw] = useState('')
  var [confirmPw, setConfirmPw] = useState('')
  var [error, setError] = useState('')
  var [success, setSuccess] = useState('')
  var [saving, setSaving] = useState(false)

  async function handleChangePassword(e) {
    e.preventDefault()
    setError('')
    setSuccess('')

    if (newPw.length < 6) return setError('Password must be at least 6 characters')
    if (newPw !== confirmPw) return setError('Passwords do not match')

    setSaving(true)
    var result = await changePassword(newPw)
    setSaving(false)

    if (result.error) {
      setError(result.error.message)
      return
    }

    setSuccess('Password changed successfully')
    setCurrentPw('')
    setNewPw('')
    setConfirmPw('')
    setTimeout(function () { setShowChangePw(false); setSuccess('') }, 1500)
  }

  var isAdminOrManager = employee.role === 'admin' || employee.role === 'manager'

  return (
    <div>
      <h2 className="text-lg font-bold text-gray-900 mb-5">Settings</h2>

      {/* Profile info */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 mb-4">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-12 h-12 bg-slate-800 rounded-full flex items-center justify-center">
            <span className="text-white text-lg font-bold">{employee.name.charAt(0)}</span>
          </div>
          <div>
            <p className="text-sm font-bold text-gray-900">{employee.name}</p>
            <p className="text-xs text-gray-500">{employee.designation || employee.role}</p>
          </div>
        </div>
        <div className="space-y-2 text-xs">
          <div className="flex justify-between">
            <span className="text-gray-400">Employee Code</span>
            <span className="text-gray-700 font-mono">{employee.emp_code}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">Phone</span>
            <span className="text-gray-700">{employee.phone || '—'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">Role</span>
            <span className="text-gray-700 capitalize">{employee.role}</span>
          </div>
        </div>
      </div>

      {/* Change password */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden mb-4">
        <button
          onClick={function () { setShowChangePw(!showChangePw); setError(''); setSuccess('') }}
          className="w-full px-4 py-3 flex items-center justify-between text-sm text-gray-700 hover:bg-gray-50 transition-colors"
        >
          <span className="font-medium">🔒 Change Password</span>
          <span className="text-gray-400">{showChangePw ? '▲' : '▼'}</span>
        </button>

        {showChangePw && (
          <form onSubmit={handleChangePassword} className="px-4 pb-4 space-y-3 border-t border-gray-100 pt-3">
            <div>
              <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1">New Password</label>
              <input
                type="password"
                value={newPw}
                onChange={function (e) { setNewPw(e.target.value) }}
                placeholder="Min 6 characters"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-700"
              />
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1">Confirm Password</label>
              <input
                type="password"
                value={confirmPw}
                onChange={function (e) { setConfirmPw(e.target.value) }}
                placeholder="Type again"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-700"
              />
            </div>

            {error && <p className="text-xs text-red-600">{error}</p>}
            {success && <p className="text-xs text-emerald-600">{success}</p>}

            <button
              type="submit"
              disabled={saving}
              className="w-full py-2 text-sm text-white bg-slate-800 rounded-lg hover:bg-slate-900 disabled:opacity-40 transition-colors font-medium"
            >
              {saving ? 'Saving…' : 'Update Password'}
            </button>
          </form>
        )}
      </div>

      {/* Admin dashboard link */}
      {isAdminOrManager && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden mb-4">
          <button
            onClick={function () {
              window.open(window.location.origin + '/ambria-attendance/admin', '_blank')
            }}
            className="w-full px-4 py-3 flex items-center justify-between text-sm text-gray-700 hover:bg-gray-50 transition-colors"
          >
            <span className="font-medium">🖥️ Admin Dashboard</span>
            <span className="text-xs text-gray-400">Opens in new tab →</span>
          </button>
        </div>
      )}

      {/* Sign out */}
      <button
        onClick={function () { logout() }}
        className="w-full py-3 text-sm text-red-600 bg-white border border-gray-200 rounded-xl hover:bg-red-50 transition-colors font-medium"
      >
        Sign Out
      </button>
    </div>
  )
}