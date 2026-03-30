import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/useAuth'
import PunchCapture from '../components/PunchCapture'

export default function Dashboard() {
  var { employee } = useAuth()
  var [status, setStatus] = useState(null)
  var [punches, setPunches] = useState([])
  var [loading, setLoading] = useState(true)
  var [stats, setStats] = useState({ employees: 0, departments: 0, casuals: 0 })

  var loadStatus = useCallback(async function () {
    var [statusRes, punchesRes] = await Promise.all([
      supabase.rpc('my_punch_status'),
      supabase.rpc('my_punches_today')
    ])

    if (statusRes.data) setStatus(statusRes.data)
    if (punchesRes.data) setPunches(punchesRes.data)
    setLoading(false)
  }, [])

  var loadAdminStats = useCallback(async function () {
    if (employee.role !== 'admin') return

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
  }, [employee.role])

  useEffect(function () {
    loadStatus()
    loadAdminStats()
  }, [loadStatus, loadAdminStats])

  function handlePunchComplete(result) {
    // Refresh status after a short delay for animation
    setTimeout(function () { loadStatus() }, 1500)
  }

  if (loading) {
    return <p className="text-sm text-gray-400 text-center py-12">Loading…</p>
  }

  var isPunchedIn = status && status.is_punched_in
  var punchType = isPunchedIn ? 'out' : 'in'

  return (
    <div>
      {/* Greeting */}
      <h2 className="text-lg font-bold text-gray-900 mb-1">
        Welcome, {employee.name}
      </h2>
      <p className="text-sm text-gray-500 mb-5">
        {employee.designation || employee.role}
      </p>

      {/* Admin stats */}
      {employee.role === 'admin' && (
        <div className="grid grid-cols-3 gap-3 mb-5">
          <StatCard label="Staff" value={stats.employees} color="text-slate-700" />
          <StatCard label="Departments" value={stats.departments} color="text-emerald-600" />
          <StatCard label="Casuals" value={stats.casuals} color="text-amber-600" />
        </div>
      )}

      {/* Current status banner */}
      <div className={'rounded-xl px-4 py-3 mb-4 border ' + (isPunchedIn
        ? 'bg-emerald-50 border-emerald-200'
        : 'bg-gray-50 border-gray-200'
      )}>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-0.5">Current Status</p>
            <p className={'text-sm font-bold ' + (isPunchedIn ? 'text-emerald-700' : 'text-gray-500')}>
              {isPunchedIn ? '🟢 Punched In' : '⚪ Not Punched In'}
            </p>
          </div>
          {status && status.last_in && (
            <div className="text-right">
              <p className="text-[10px] text-gray-400">Last in</p>
              <p className="text-xs font-mono text-gray-600">
                {formatTime(status.last_in)}
              </p>
            </div>
          )}
        </div>
        {status && status.sessions_today > 0 && (
          <p className="text-[11px] text-gray-400 mt-1">
            {status.sessions_today} session{status.sessions_today > 1 ? 's' : ''} today
          </p>
        )}
      </div>

      {/* Punch button */}
      <div className="mb-5">
        <PunchCapture
          punchType={punchType}
          onComplete={handlePunchComplete}
        />
      </div>

      {/* Today's punches */}
      {punches.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
          <div className="px-4 py-3 border-b border-gray-100">
            <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider">Today's Punches</h3>
          </div>
          <div className="divide-y divide-gray-100">
            {punches.map(function (p) {
              return (
                <div key={p.id} className="px-4 py-3 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={'w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ' +
                      (p.punch_type === 'in'
                        ? 'bg-emerald-100 text-emerald-700'
                        : 'bg-red-100 text-red-600')
                    }>
                      {p.punch_type === 'in' ? 'IN' : 'OUT'}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-800">
                        Punch {p.punch_type === 'in' ? 'In' : 'Out'}
                      </p>
                      <p className="text-[11px] text-gray-400">{p.nearest_venue || ''}</p>
                    </div>
                  </div>
                  <p className="text-sm font-mono text-gray-600">
                    {formatTime(p.punched_at)}
                  </p>
                </div>
              )
            })}
          </div>
        </div>
      )}
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

function formatTime(isoString) {
  if (!isoString) return '—'
  var d = new Date(isoString)
  return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })
}