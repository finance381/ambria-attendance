import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'

export default function AdminDashboard() {
  var [data, setData] = useState(null)
  var [loading, setLoading] = useState(true)
  var navigate = useNavigate()

  var loadData = useCallback(async function () {
    var { data: res, error } = await supabase.rpc('admin_overview')
    if (res && !res.error) setData(res)
    setLoading(false)
  }, [])

  useEffect(function () {
    loadData()
    // Auto-refresh every 30 seconds
    var interval = setInterval(loadData, 30000)
    return function () { clearInterval(interval) }
  }, [loadData])

  if (loading) {
    return <p className="text-sm text-gray-400 text-center py-12">Loading…</p>
  }

  if (!data) {
    return <p className="text-sm text-red-500 text-center py-12">Failed to load overview</p>
  }

  var hasIssues = data.pending_claims > 0 || data.open_punches_past > 0

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-lg font-bold text-gray-900">Dashboard</h2>
        <p className="text-[10px] text-gray-400">
          {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          <span className="ml-2">Auto-refreshes every 30s</span>
        </p>
      </div>
      <p className="text-xs text-gray-500 mb-5">Live overview of today's attendance</p>

      {/* Today's numbers */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <StatCard
          label="Present Today"
          value={data.present_today}
          sub={'of ' + data.total_permanent + ' staff'}
          color="text-emerald-600"
          bg="bg-emerald-50"
        />
        <StatCard
          label="Absent Today"
          value={data.absent_today}
          sub="no punch recorded"
          color="text-red-600"
          bg="bg-red-50"
        />
        <StatCard
          label="Currently In"
          value={data.currently_in}
          sub="punched in right now"
          color="text-blue-600"
          bg="bg-blue-50"
        />
        <StatCard
          label="Casuals Active"
          value={data.total_casual}
          sub="registered casuals"
          color="text-amber-600"
          bg="bg-amber-50"
        />
      </div>

      {/* Action items */}
      {hasIssues && (
        <div className="mb-5">
          <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Needs Attention</h3>
          <div className="space-y-2">
            {data.pending_claims > 0 && (
              <button
                onClick={function () { navigate('/admin/claims') }}
                className="w-full flex items-center justify-between bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 hover:bg-amber-100 transition-colors text-left"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-amber-100 rounded-full flex items-center justify-center">
                    <span className="text-lg">📝</span>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-amber-800">
                      {data.pending_claims} Pending Claim{data.pending_claims > 1 ? 's' : ''}
                    </p>
                    <p className="text-[11px] text-amber-600">Missed punch claims awaiting review</p>
                  </div>
                </div>
                <span className="text-amber-400 text-lg">→</span>
              </button>
            )}

            {data.open_punches_past > 0 && (
              <button
                onClick={function () { navigate('/admin/attendance') }}
                className="w-full flex items-center justify-between bg-red-50 border border-red-200 rounded-xl px-4 py-3 hover:bg-red-100 transition-colors text-left"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center">
                    <span className="text-lg">⚠️</span>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-red-800">
                      {data.open_punches_past} Unresolved Punch-In{data.open_punches_past > 1 ? 's' : ''}
                    </p>
                    <p className="text-[11px] text-red-600">From previous days — no punch-out recorded</p>
                  </div>
                </div>
                <span className="text-red-400 text-lg">→</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Incomplete today */}
      {data.incomplete_today > 0 && (
        <div className="mb-5">
          <button
            onClick={function () { navigate('/admin/attendance') }}
            className="w-full flex items-center justify-between bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 hover:bg-gray-100 transition-colors text-left"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center">
                <span className="text-lg">🕐</span>
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-800">
                  {data.incomplete_today} Still Punched In
                </p>
                <p className="text-[11px] text-gray-500">Haven't punched out yet today</p>
              </div>
            </div>
            <span className="text-gray-400 text-lg">→</span>
          </button>
        </div>
      )}

      {/* Recent activity feed */}
      <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Live Feed</h3>
      {data.recent_punches.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl p-6 text-center">
          <p className="text-sm text-gray-400">No punches recorded today yet</p>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="divide-y divide-gray-100">
            {data.recent_punches.map(function (p, i) {
              return (
                <div key={i} className="px-4 py-3 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={'w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-bold ' +
                      (p.punch_type === 'in'
                        ? 'bg-emerald-100 text-emerald-700'
                        : 'bg-red-100 text-red-600')
                    }>
                      {p.punch_type === 'in' ? 'IN' : 'OUT'}
                    </div>
                    <div>
                      <p className="text-sm text-gray-800">
                        <span className="font-medium">{p.name}</span>
                        {p.is_proxy && <span className="ml-1 text-[9px] text-amber-600 bg-amber-50 px-1 rounded">proxy</span>}
                      </p>
                      <p className="text-[10px] text-gray-400">{p.venue || ''}</p>
                    </div>
                  </div>
                  <p className="text-xs font-mono text-gray-500">{formatTime(p.punched_at)}</p>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Quick nav */}
      <div className="grid grid-cols-2 gap-3 mt-5">
        <QuickLink label="Daily Attendance" icon="📋" onClick={function () { navigate('/admin/attendance') }} />
        <QuickLink label="Monthly Report" icon="📊" onClick={function () { navigate('/admin/monthly') }} />
        <QuickLink label="Manage Employees" icon="👥" onClick={function () { navigate('/admin/employees') }} />
        <QuickLink label="Manage Venues" icon="📍" onClick={function () { navigate('/admin/venues') }} />
      </div>
    </div>
  )
}

function StatCard({ label, value, sub, color, bg }) {
  return (
    <div className={'border rounded-xl px-4 py-3 ' + (bg || 'bg-white') + ' border-gray-200'}>
      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-0.5">{label}</p>
      <p className={'text-2xl font-bold ' + (color || 'text-gray-900')}>{value}</p>
      {sub && <p className="text-[10px] text-gray-400 mt-0.5">{sub}</p>}
    </div>
  )
}

function QuickLink({ label, icon, onClick }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-2 bg-white border border-gray-200 rounded-xl px-4 py-3 hover:bg-gray-50 transition-colors text-left"
    >
      <span className="text-lg">{icon}</span>
      <span className="text-sm font-medium text-gray-700">{label}</span>
    </button>
  )
}

function formatTime(isoString) {
  if (!isoString) return '—'
  var d = new Date(isoString)
  return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })
}