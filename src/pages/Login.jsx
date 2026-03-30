import { useState } from 'react'
import { useAuth } from '../lib/useAuth'

export default function Login() {
  var [phone, setPhone] = useState('')
  var [password, setPassword] = useState('')
  var [error, setError] = useState('')
  var [loading, setLoading] = useState(false)
  var { login } = useAuth()

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')

    var cleaned = phone.replace(/[^0-9]/g, '')
    if (cleaned.length < 10) {
      setError('Enter a valid 10-digit phone number')
      return
    }
    if (!password) {
      setError('Enter your password')
      return
    }

    setLoading(true)
    var result = await login(phone, password)
    setLoading(false)

    if (result.error) {
      setError('Invalid phone number or password')
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="w-14 h-14 bg-slate-800 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <span className="text-white text-xl font-bold">A</span>
          </div>
          <h1 className="text-xl font-bold text-gray-900">Ambria Attendance</h1>
          <p className="text-sm text-gray-500 mt-1">Sign in with your phone number</p>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
          <form onSubmit={handleSubmit}>
            <div className="mb-4">
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                Phone Number
              </label>
              <div className="flex">
                <span className="inline-flex items-center px-3 bg-gray-50 border border-r-0 border-gray-300 rounded-l-lg text-sm text-gray-500">
                  +91
                </span>
                <input
                  type="tel"
                  inputMode="numeric"
                  maxLength={10}
                  value={phone}
                  onChange={function (e) { setPhone(e.target.value.replace(/[^0-9]/g, '')) }}
                  placeholder="9876543210"
                  className="flex-1 px-3 py-2.5 border border-gray-300 rounded-r-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-700 focus:border-transparent"
                  autoComplete="tel"
                  autoFocus
                />
              </div>
            </div>

            <div className="mb-5">
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={function (e) { setPassword(e.target.value) }}
                placeholder="Enter password"
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-700 focus:border-transparent"
                autoComplete="current-password"
              />
            </div>

            {error && (
              <div className="mb-4 px-3 py-2 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-xs text-red-600">{error}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 bg-slate-800 text-white text-sm font-semibold rounded-lg hover:bg-slate-900 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {loading ? 'Signing in…' : 'Sign In'}
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-gray-400 mt-6">
          Contact your admin if you need access
        </p>
      </div>
    </div>
  )
}