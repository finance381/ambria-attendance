import { useState, useEffect, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'

var STATUS_COLORS = {
  Present: 'bg-emerald-50 text-emerald-700',
  Absent: 'bg-red-50 text-red-600',
  Incomplete: 'bg-amber-50 text-amber-700',
  'Half Day': 'bg-orange-50 text-orange-600'
}


export default function DailyAttendance() {
  var today = new Date().toISOString().slice(0, 10)
  var [searchParams, setSearchParams] = useSearchParams()

  var [date, setDate] = useState(searchParams.get('date') || today)
  var [deptFilter, setDeptFilter] = useState('')
  var [statusFilter, setStatusFilter] = useState(searchParams.get('status') || '')
  var [search, setSearch] = useState('')
  var [records, setRecords] = useState([])
  var [departments, setDepartments] = useState([])
  var [loading, setLoading] = useState(true)
  var [toast, setToast] = useState('')

  // Override modal state
  var [overrideTarget, setOverrideTarget] = useState(null)
  var [overrideType, setOverrideType] = useState('punch_out')
  var [overrideValue, setOverrideValue] = useState('')
  var [overrideReason, setOverrideReason] = useState('')
  var [overrideError, setOverrideError] = useState('')
  var [saving, setSaving] = useState(false)

  // Detail panel
  var [detailTarget, setDetailTarget] = useState(null)

  var showToast = useCallback(function (msg) {
    setToast(msg)
    setTimeout(function () { setToast('') }, 2500)
  }, [])

  var loadData = useCallback(async function () {
    setLoading(true)
    var [attRes, deptRes] = await Promise.all([
      supabase.rpc('admin_daily_attendance', { p_date: date }),
      supabase.from('departments').select('id, name').eq('active', true).order('name')
    ])

    setRecords(attRes.data || [])
    setDepartments(deptRes.data || [])
    setLoading(false)
  }, [date])

  useEffect(function () { loadData() }, [loadData])

  // Filters
  var filtered = records.filter(function (r) {
    if (deptFilter && String(r.department_id) !== deptFilter) return false
    if (statusFilter && r.status !== statusFilter) return false
    if (search) {
      var q = search.toLowerCase()
      if (!r.name.toLowerCase().includes(q) && !r.emp_code.toLowerCase().includes(q)) return false
    }
    return true
  })

  // Stats
  var stats = { total: filtered.length, Present: 0, Absent: 0, Incomplete: 0, 'Half Day': 0 }
  filtered.forEach(function (r) {
    if (stats[r.status] !== undefined) stats[r.status]++
  })

  // Override submit
  async function handleOverride(e) {
    e.preventDefault()
    setOverrideError('')

    if (!overrideValue.trim()) return setOverrideError('Enter a value')
    if (!overrideReason.trim()) return setOverrideError('Reason is required')

    setSaving(true)

    var { data, error } = await supabase.rpc('add_override', {
      p_employee_id: overrideTarget.employee_id,
      p_attendance_date: date,
      p_override_type: overrideType,
      p_override_value: overrideValue.trim(),
      p_reason: overrideReason.trim()
    })

    setSaving(false)

    if (error || (data && data.error)) {
      setOverrideError((data && data.error) || error.message)
      return
    }

    showToast('Override saved for ' + overrideTarget.name)
    setOverrideTarget(null)
    setOverrideType('punch_out')
    setOverrideValue('')
    setOverrideReason('')
    loadData()
  }

  return (
    <div>
      <h2 className="text-lg font-bold text-gray-900 mb-1">Daily Attendance</h2>
      <p className="text-xs text-gray-500 mb-4">View and manage attendance records</p>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-4">
        <div>
          <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1">Date</label>
          <input type="date" value={date} onChange={function (e) { setDate(e.target.value) }}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-700" />
        </div>
        <div>
          <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1">Department</label>
          <select value={deptFilter} onChange={function (e) { setDeptFilter(e.target.value) }}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-700">
            <option value="">All</option>
            {departments.map(function (d) { return <option key={d.id} value={d.id}>{d.name}</option> })}
          </select>
        </div>
        <div>
          <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1">Status</label>
          <select value={statusFilter} onChange={function (e) { setStatusFilter(e.target.value) }}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-700">
            <option value="">All</option>
            <option value="Present">Present</option>
            <option value="Absent">Absent</option>
            <option value="Incomplete">Incomplete</option>
            <option value="Half Day">Half Day</option>
          </select>
        </div>
        <div>
          <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1">Search</label>
          <input type="text" value={search} onChange={function (e) { setSearch(e.target.value) }}
            placeholder="Name or code…"
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-700" />
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-5 gap-2 mb-4">
        <MiniStat label="Total" value={stats.total} color="text-slate-700" />
        <MiniStat label="Present" value={stats.Present} color="text-emerald-600" />
        <MiniStat label="Absent" value={stats.Absent} color="text-red-600" />
        <MiniStat label="Incomplete" value={stats.Incomplete} color="text-amber-600" />
        <MiniStat label="Half Day" value={stats['Half Day']} color="text-orange-600" />
      </div>

      {/* Table */}
      {loading ? (
        <p className="text-sm text-gray-400 text-center py-12">Loading…</p>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-x-auto shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-3 py-2.5 text-[10px] font-bold text-gray-500 uppercase tracking-wider">Code</th>
                <th className="text-left px-3 py-2.5 text-[10px] font-bold text-gray-500 uppercase tracking-wider">Selfie</th>
                <th className="text-left px-3 py-2.5 text-[10px] font-bold text-gray-500 uppercase tracking-wider">Name</th>
                <th className="text-left px-3 py-2.5 text-[10px] font-bold text-gray-500 uppercase tracking-wider">Department</th>
                <th className="text-left px-3 py-2.5 text-[10px] font-bold text-gray-500 uppercase tracking-wider">In</th>
                <th className="text-left px-3 py-2.5 text-[10px] font-bold text-gray-500 uppercase tracking-wider">Out</th>
                <th className="text-left px-3 py-2.5 text-[10px] font-bold text-gray-500 uppercase tracking-wider">Sessions</th>
                <th className="text-left px-3 py-2.5 text-[10px] font-bold text-gray-500 uppercase tracking-wider">Status</th>
                <th className="text-left px-3 py-2.5 text-[10px] font-bold text-gray-500 uppercase tracking-wider">Venue</th>
                <th className="px-3 py-2.5 text-[10px] font-bold text-gray-500 uppercase tracking-wider text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={10} className="text-center py-8 text-sm text-gray-400 italic">No records for this date</td>
                </tr>
              ) : filtered.map(function (r) {
                var isIncomplete = r.status === 'Incomplete'
                return (
                  <tr key={r.employee_id}
                    className={'border-b border-gray-100 hover:bg-gray-50 cursor-pointer' + (isIncomplete ? ' bg-amber-50/50' : '')}
                    onClick={function () { setDetailTarget(r) }}>
                    <td className="px-3 py-2 text-xs text-gray-400 font-mono">{r.emp_code}</td>
                    <td className="px-3 py-2">
                      <SelfieThumb punches={r.punches} onClick={function (e) { e.stopPropagation() }} />
                    </td>
                    <td className="px-3 py-2 font-medium text-gray-900">
                      {r.name}
                      {r.is_casual && <span className="ml-1 text-[9px] text-gray-400 bg-gray-100 px-1 rounded">casual</span>}
                    </td>
                    <td className="px-3 py-2 text-xs text-gray-500">{r.department_name || '—'}</td>
                    <td className="px-3 py-2 text-xs font-mono text-gray-600">{formatTime(r.first_in)}</td>
                    <td className="px-3 py-2 text-xs font-mono text-gray-600">{formatTime(r.last_out)}</td>
                    <td className="px-3 py-2 text-xs text-gray-500">{r.in_count || 0}</td>
                    <td className="px-3 py-2">
                      <span className={'text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ' + (STATUS_COLORS[r.status] || 'bg-gray-100 text-gray-500')}>
                        {r.status}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-xs">
                      <VenueFlag punches={r.punches} status={r.status} />
                      {r.has_override && <span className="text-blue-500 ml-1" title="Has override">✏️</span>}
                    </td>
                    <td className="px-3 py-2 text-right" onClick={function (e) { e.stopPropagation() }}>
                      {(r.status === 'Incomplete' || r.status === 'Absent') && (
                        <button
                          onClick={function () {
                            setOverrideTarget(r)
                            setOverrideType(r.status === 'Incomplete' ? 'punch_out' : 'full_day_override')
                            setOverrideValue(r.status === 'Incomplete' ? '' : 'P')
                            setOverrideReason('')
                            setOverrideError('')
                          }}
                          className="px-2 py-1 text-xs text-blue-600 hover:bg-blue-50 rounded transition-colors"
                        >
                          Override
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* DETAIL PANEL */}
      {detailTarget && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={function () { setDetailTarget(null) }}>
          <div className="bg-white rounded-xl w-full max-w-lg shadow-xl max-h-[80vh] overflow-y-auto" onClick={function (e) { e.stopPropagation() }}>
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-gray-900">{detailTarget.name}</h3>
                <p className="text-xs text-gray-500">{detailTarget.emp_code} · {detailTarget.department_name} · {date}</p>
              </div>
              <button onClick={function () { setDetailTarget(null) }} className="text-gray-400 hover:text-gray-600 text-lg">✕</button>
            </div>
            <div className="px-5 py-4">
              {/* Status */}
              <div className="flex items-center justify-between mb-4">
                <span className={'text-xs font-bold uppercase px-2.5 py-1 rounded-full ' + (STATUS_COLORS[detailTarget.status] || 'bg-gray-100 text-gray-500')}>
                  {detailTarget.status}
                </span>
                {detailTarget.gps_suspicious && (
                  <span className="text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">⚠️ GPS accuracy low</span>
                )}
              </div>

              {/* Punches */}
              <h4 className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-2">Punches</h4>
              {detailTarget.punches.length === 0 ? (
                <p className="text-xs text-gray-400 italic mb-4">No punches recorded</p>
              ) : (
                <div className="space-y-2 mb-4">
                  {detailTarget.punches.map(function (p) {
                    return (
                      <div key={p.punch_id} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2">
                        <div className="flex items-center gap-2">
                          {p.selfie_path && (
                            <SelfieImg path={p.selfie_path} size="w-9 h-9" rounded="rounded-lg" />
                          )}
                          <div>
                            <div className="flex items-center gap-2">
                              <span className={'text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ' +
                                (p.punch_type === 'in' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-600')}>
                                {p.punch_type}
                              </span>
                              <span className="text-xs font-mono text-gray-700">{formatTime(p.punched_at)}</span>
                            </div>
                            {p.venue && <span className="text-[10px] text-gray-400">{p.venue}</span>}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {p.is_proxy && <span className="text-[9px] text-amber-600 bg-amber-50 px-1.5 rounded">proxy</span>}
                          {p.gps_accuracy && p.gps_accuracy > 100 && (
                            <span className="text-[9px] text-amber-500">{Math.round(p.gps_accuracy)}m</span>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}

              {/* Overrides */}
              {detailTarget.has_override && (
                <>
                  <h4 className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-2">Overrides</h4>
                  <div className="space-y-2 mb-4">
                    {Object.keys(detailTarget.overrides).map(function (key) {
                      var ov = detailTarget.overrides[key]
                      return (
                        <div key={key} className="bg-blue-50 rounded-lg px-3 py-2">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-bold text-blue-700 uppercase">{key.replace('_', ' ')}</span>
                            <span className="text-xs font-mono text-blue-800">{ov.value}</span>
                          </div>
                          <p className="text-[10px] text-blue-600 mt-0.5">Reason: {ov.reason}</p>
                        </div>
                      )
                    })}
                  </div>
                </>
              )}

              {/* Quick override button */}
              <button
                onClick={function () {
                  setDetailTarget(null)
                  setOverrideTarget(detailTarget)
                  setOverrideType('punch_out')
                  setOverrideValue('')
                  setOverrideReason('')
                  setOverrideError('')
                }}
                className="w-full py-2 text-sm text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors font-medium"
              >
                + Add Override
              </button>
            </div>
          </div>
        </div>
      )}

      {/* OVERRIDE MODAL */}
      {overrideTarget && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={function () { setOverrideTarget(null) }}>
          <div className="bg-white rounded-xl w-full max-w-md shadow-xl" onClick={function (e) { e.stopPropagation() }}>
            <div className="px-5 py-4 border-b border-gray-100">
              <h3 className="text-sm font-bold text-gray-900">Override for {overrideTarget.name}</h3>
              <p className="text-xs text-gray-500">{overrideTarget.emp_code} · {date}</p>
            </div>
            <form onSubmit={handleOverride} className="px-5 py-4 space-y-3">
              <div>
                <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1">Override Type</label>
                <select value={overrideType} onChange={function (e) { setOverrideType(e.target.value) }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-700">
                  <option value="punch_in">Punch In Time</option>
                  <option value="punch_out">Punch Out Time</option>
                  <option value="status">Status</option>
                  <option value="full_day_override">Full Day Override</option>
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1">
                  {overrideType === 'punch_in' || overrideType === 'punch_out' ? 'Time (HH:MM)' :
                   'Status (P / A / H)'}
                </label>
                {overrideType === 'punch_in' || overrideType === 'punch_out' ? (
                  <input type="time" value={overrideValue} onChange={function (e) { setOverrideValue(e.target.value) }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-700" />
                ) : (
                  <select value={overrideValue} onChange={function (e) { setOverrideValue(e.target.value) }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-700">
                    <option value="">— Select —</option>
                    <option value="P">Present (P)</option>
                    <option value="A">Absent (A)</option>
                    <option value="H">Half Day (H)</option>
                  </select>
                )}
              </div>

              <div>
                <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1">Reason *</label>
                <textarea value={overrideReason} onChange={function (e) { setOverrideReason(e.target.value) }}
                  rows={2} placeholder="Why are you overriding this record?"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-700 resize-none" maxLength={500}/>
              </div>

              {overrideError && (
                <div className="px-3 py-2 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-xs text-red-600">{overrideError}</p>
                </div>
              )}

              <p className="text-[10px] text-gray-400">
                This override will be logged with your name and reason. It cannot be deleted.
              </p>

              <div className="flex justify-end gap-2 pt-1">
                <button type="button" onClick={function () { setOverrideTarget(null) }}
                  className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">Cancel</button>
                <button type="submit" disabled={saving}
                  className="px-4 py-2 text-sm text-white bg-slate-800 rounded-lg hover:bg-slate-900 disabled:opacity-40 transition-colors font-medium">
                  {saving ? 'Saving…' : 'Save Override'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 right-6 bg-slate-800 text-white px-5 py-3 rounded-xl text-sm shadow-lg z-50">
          {toast}
        </div>
      )}
    </div>
  )
}

function MiniStat({ label, value, color }) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg px-3 py-2 text-center">
      <p className="text-[9px] font-semibold text-gray-400 uppercase tracking-wider">{label}</p>
      <p className={'text-xl font-bold ' + (color || 'text-gray-900')}>{value}</p>
    </div>
  )
}

function formatTime(isoString) {
  if (!isoString) return '—'
  var d = new Date(isoString)
  return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })
}

var SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL

function selfieUrl(path) {
  if (!path) return null
  return SUPABASE_URL + '/storage/v1/object/public/selfies/' + path
}

function SelfieImg({ path, size, rounded }) {
  var [open, setOpen] = useState(false)
  var url = selfieUrl(path)
  if (!url) return null

  return (
    <>
      <img
        src={url}
        alt="Selfie"
        className={'object-cover cursor-pointer border border-gray-200 hover:border-slate-400 transition-colors ' + (size || 'w-8 h-8') + ' ' + (rounded || 'rounded-full')}
        onClick={function (e) { e.stopPropagation(); setOpen(true) }}
        loading="lazy"
      />
      {open && (
        <div className="fixed inset-0 bg-black/80 z-[60] flex items-center justify-center p-4"
          onClick={function () { setOpen(false) }}>
          <div className="relative max-w-md w-full">
            <img src={url} alt="Selfie" className="w-full rounded-xl shadow-2xl" />
            <button onClick={function () { setOpen(false) }}
              className="absolute -top-3 -right-3 w-8 h-8 bg-white rounded-full flex items-center justify-center text-gray-600 shadow-lg hover:bg-gray-100 text-sm font-bold">
              ✕
            </button>
          </div>
        </div>
      )}
    </>
  )
}

function VenueFlag({ punches, status }) {
  if (!punches || punches.length === 0 || status === 'Absent') return null

  // Get venue from first punch-in, fallback to any punch with a venue
  var venuePunch = punches.find(function (p) { return p.punch_type === 'in' && p.venue })
  if (!venuePunch) {
    venuePunch = punches.find(function (p) { return p.venue })
  }

  if (venuePunch && venuePunch.venue) {
    return (
      <span className="text-[10px] font-medium text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded" title={venuePunch.venue}>
        {venuePunch.venue.length > 18 ? venuePunch.venue.slice(0, 18) + '…' : venuePunch.venue}
      </span>
    )
  }

  // Has punches but no venue match
  return (
    <span className="text-[10px] font-bold text-red-600 bg-red-50 px-1.5 py-0.5 rounded">
      Not in Venue
    </span>
  )
}

function SelfieThumb({ punches }) {
  if (!punches || punches.length === 0) return <span className="text-[10px] text-gray-300">—</span>

  var inPunch = punches.find(function (p) { return p.punch_type === 'in' && p.selfie_path })
  var outPunch = punches.find(function (p) { return p.punch_type === 'out' && p.selfie_path })

  if (!inPunch && !outPunch) return <span className="text-[10px] text-gray-300">—</span>

  return (
    <div className="flex items-center gap-1">
      {inPunch && <SelfieImg path={inPunch.selfie_path} size="w-7 h-7" rounded="rounded-full" />}
      {outPunch && <SelfieImg path={outPunch.selfie_path} size="w-7 h-7" rounded="rounded-full" />}
    </div>
  )
}