import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/useAuth'

export default function Dashboard() {
  var { employee } = useAuth()
  var [stats, setStats] = useState({ employees: 0, departments: 0, casuals: 0 })
  var [loading, setLoading] = useState(true)

  useEffect(function () {
    loadStats()
  }, [])

  async function loadStats() {
    var [empRes, deptRes] = await Promise.all([
      supabase.from('employees').select('id, is_casual', { count: 'exact', head: true }).eq('active', true),
      supabase.from('departments').select('id', { count: 'exact', head: true }).eq('active', true),
    ])

    var casualRes = await supabase
      .from('employees')
      .select('id', { count: 'exact', head: true })
      .eq('active', true)
      .eq('is_casual', true)

    setStats({
      employees: (empRes.count || 0) - (casualRes.count || 0),
      departments: deptRes.count || 0,
      casuals: casualRes.count || 0
    })
    setLoading(false)
  }

  if (loading) {
    return <p className="text-sm text-gray-400 text-center py-12">Loading…</p>
  }

  var isAdmin = employee.role === 'admin'

  return (
    <div>
      <h2 className="text-lg font-bold text-gray-900 mb-1">
        Welcome, {employee.name}
      </h2>
      <p className="text-sm text-gray-500 mb-6">
        {employee.designation || employee.role}
        {employee.department_id ? '' : ' · No department assigned'}
      </p>

      {isAdmin && (
        <div className="grid grid-cols-3 gap-3 mb-6">
          <StatCard label="Permanent Staff" value={stats.employees} color="text-slate-700" />
          <StatCard label="Departments" value={stats.departments} color="text-emerald-600" />
          <StatCard label="Casuals" value={stats.casuals} color="text-amber-600" />
        </div>
      )}

      <div className="bg-white border border-gray-200 rounded-xl p-8 text-center">
        <div className="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <span className="text-3xl">📷</span>
        </div>
        <p className="text-sm font-semibold text-gray-800 mb-1">Punch In / Out</p>
        <p className="text-xs text-gray-400">Coming in Phase 2 — selfie + GPS capture</p>
      </div>
    </div>
  )
}

function StatCard({ label, value, color }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl px-4 py-3">
      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">{label}</p>
      <p className={'text-2xl font-bold ' + (color || 'text-gray-900')}>{value}</p>
    </div>
  )
}