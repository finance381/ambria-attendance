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
      .select('id, emp_code, name, phone, department_id, role, designation, is_casual, active')
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
          fetchEmployee(s.user.id)
        } else {
          setEmployee(null)
        }
      }
    )

    return function () { subscription.unsubscribe() }
  }, [fetchEmployee])

  async function login(phone, password) {
    var email = phoneToEmail(phone)
    var { data, error } = await supabase.auth.signInWithPassword({
      email: email,
      password: password
    })
    if (error) return { error: error }
    return { data: data }
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