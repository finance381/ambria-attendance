import { useState, useEffect, useCallback, createContext, useContext } from 'react'
import { supabase } from './supabase'

const AuthContext = createContext(null)

function normalizePhone(raw) {
  var digits = raw.replace(/[^0-9]/g, '')
  if (digits.startsWith('91') && digits.length === 12) return digits
  if (digits.startsWith('0')) digits = digits.slice(1)
  if (digits.length === 10) return '91' + digits
  return digits
}

function phoneToEmail(phone) {
  return normalizePhone(phone) + '@att.ambria.local'
}

export function AuthProvider({ children }) {
  var [session, setSession] = useState(null)
  var [employee, setEmployee] = useState(null)
  var [loading, setLoading] = useState(true)

  var fetchEmployee = useCallback(async function (userId) {
    var { data, error } = await supabase
      .from('employees')
      .select('id, emp_code, name, phone, department_id, role, designation, is_casual, active, visible_tabs, leave_scheme, monthly_leave_cap, expected_hours')
      .eq('id', userId)
      .eq('active', true)
      .maybeSingle()

    if (error || !data) {
      setEmployee(null)
      return null
    }
    setEmployee(data)
    return data
  }, [])

  useEffect(function () {
    supabase.auth.getSession().then(function ({ data: { session: s } }) {
      setSession(s)
      if (s?.user) {
        fetchEmployee(s.user.id).then(function () { setLoading(false) })
      } else {
        setLoading(false)
      }
    })

    var { data: { subscription } } = supabase.auth.onAuthStateChange(
      function (_event, s) {
        setSession(s)
        if (s?.user) {
          setLoading(true)
          fetchEmployee(s.user.id).then(function () { setLoading(false) })
        } else {
          setEmployee(null)
          setLoading(false)
        }
      }
    )

    return function () { subscription.unsubscribe() }
  }, [fetchEmployee])

  async function login(phone, password) {
    try {
      var res = await fetch(
        import.meta.env.VITE_SUPABASE_URL + '/functions/v1/login',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone: phone, password: password }),
        }
      )
      var body = await res.json()
      if (res.status === 429) return { error: { message: body.error, status: 429 } }
      if (!res.ok) return { error: { message: body.error || 'Login failed' } }
      var { error } = await supabase.auth.setSession({
        access_token: body.access_token,
        refresh_token: body.refresh_token,
      })
      if (error) return { error: error }
      return { data: body }
    } catch (e) {
      return { error: { message: 'Network error' } }
    }
  }

  async function logout() {
    await supabase.auth.signOut()
    setSession(null)
    setEmployee(null)
  }

  async function changePassword(newPassword) {
    var { error } = await supabase.auth.updateUser({ password: newPassword })
    return { error: error }
  }

  var value = {
    session: session,
    employee: employee,
    loading: loading,
    login: login,
    logout: logout,
    changePassword: changePassword,
    refetchEmployee: function () {
      if (session?.user) return fetchEmployee(session.user.id)
    }
  }

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  var ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}

export { normalizePhone, phoneToEmail }