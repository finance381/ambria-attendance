import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'

export default function AdminDashboard() {
  var [stats, setStats] = useState({ employees: 0, departments: 0, casuals: 0 })
  var [loading, setLoading] = useState(true)

  useEffect(function () {
    loadStats()
  }, [])

  async function loadStats() {
    var [empRes, deptRes, casualRes] = await Promise.all([
      supabase.from('employees').select('id', { count: 'exact', head: true }).eq('active', true).eq('is_casual', false),
      supabase.from('departments').select('id', { count: 'exact', head: true }).eq('active', true),
      supabase.from('employees').select('id', { count: 'exact', head: true }).eq('active', true).eq('is_casual', true)
    ])

    setStats({
      employees: empRes.count || 0,
      departments: deptRes.count || 0,
      casuals: casualRes.count || 0
    })
    setLoading(false)
  }

  if (loading) {
    return <p className="text-sm text-gray-400 text-center py-12">Loading…</p>
  }

  return (
    <div>
      <h2 className="text-lg font-bold text-gray-900 mb-1">Admin Overview</h2>
      <p className="text-xs text-gray-500 mb-5">System statistics and quick actions</p>

      <div className="grid grid-cols-3 gap-3 mb-6">
        <StatCard label="Permanent Staff" value={stats.employees} color="text-slate-700" />
        <StatCard label="Departments" value={stats.departments} color="text-emerald-600" />
        <StatCard label="Casuals" value={stats.casuals} color="text-amber-600" />
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-6 text-center">
        <p className="text-sm text-gray-500">
          Daily attendance view, reports, claims queue, and leave queue will appear here in P3–P7.
        </p>
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