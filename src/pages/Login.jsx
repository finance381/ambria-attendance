import { useState } from 'react'
import { useAuth } from '../lib/useAuth'
import { useLanguage, LanguageToggle } from '../lib/i18n'

export default function Login() {
  var [phone, setPhone] = useState('')
  var [password, setPassword] = useState('')
  var [showPassword, setShowPassword] = useState(false)
  var [error, setError] = useState('')
  var [loading, setLoading] = useState(false)
  var { login } = useAuth()
  var { t } = useLanguage()

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')

    var cleaned = phone.replace(/[^0-9]/g, '')
    if (cleaned.length < 10) {
      setError(t('login_err_phone'))
      return
    }
    if (!password) {
      setError(t('login_err_password'))
      return
    }


    setLoading(true)
    var result = await login(phone, password)
    setLoading(false)

    if (result.error) {
      setError(result.error.message || t('login_err_invalid'))
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="flex justify-end mb-4">
          <div className="bg-slate-800 rounded-lg">
            <LanguageToggle />
          </div>
        </div>
        <div className="text-center mb-8">
          <div className="w-14 h-14 bg-slate-800 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <span className="text-white text-xl font-bold">A</span>
          </div>
          <h1 className="text-xl font-bold text-gray-900">{t('login_title')}</h1>
          <p className="text-sm text-gray-500 mt-1">{t('login_subtitle')}</p>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
          <form onSubmit={handleSubmit}>
            <div className="mb-4">
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                {t('login_phone_label')}
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
                  placeholder={t('login_phone_placeholder')}
                  className="flex-1 px-3 py-2.5 border border-gray-300 rounded-r-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-700 focus:border-transparent"
                  autoComplete="tel"
                  autoFocus
                />
              </div>
            </div>

            <div className="mb-5">
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                {t('login_password_label')}
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={function (e) { setPassword(e.target.value) }}
                  placeholder={t('login_password_placeholder')}
                  className="w-full pl-3 pr-11 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-700 focus:border-transparent"
                  autoComplete="current-password"
                />
                {/* Eye toggle. The icon shows the current state: slashed eye while
                    hidden, open eye while visible. */}
                <button type="button" onClick={function () { setShowPassword(!showPassword) }}
                  aria-label={showPassword ? t('login_hide_password') : t('login_show_password')}
                  className="absolute inset-y-0 right-0 w-11 inline-flex items-center justify-center text-gray-400 hover:text-gray-700">
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    {!showPassword
                      ? <><path d="M3 3l18 18" /><path d="M10.6 10.6a2 2 0 0 0 2.8 2.8" /><path d="M9.9 5.1A9.8 9.8 0 0 1 12 5c5 0 9 4.5 10 7a12.7 12.7 0 0 1-2.9 3.9M6.6 6.6C4.3 8 2.7 10.1 2 12c1 2.5 5 7 10 7a9.6 9.6 0 0 0 5.4-1.6" /></>
                      : <><path d="M2 12c1-2.5 5-7 10-7s9 4.5 10 7c-1 2.5-5 7-10 7S3 14.5 2 12z" /><circle cx="12" cy="12" r="3" /></>}
                  </svg>
                </button>
              </div>
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
              {loading ? t('login_submitting') : t('login_submit')}
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-gray-400 mt-6">
          {t('login_admin_help')}
        </p>
      </div>
    </div>
  )
}