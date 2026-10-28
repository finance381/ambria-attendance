// DailyAttendance.jsx
// Admin → Daily Attendance. One day's attendance for every employee from
// admin_daily_attendance(): filters, status cards (also quick filters), a
// sortable table, a punch/selfie detail panel and the override modal.
// Phones (< md) get stacked filters and a card list instead of the wide table.

import { useState, useEffect, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { fmtTime } from '../../lib/formatters'
import DeptPicker from '../../components/DeptPicker'

var STATUS_COLORS = {
  Present: 'bg-emerald-50 text-emerald-700',
  Absent: 'bg-red-50 text-red-600',
  Incomplete: 'bg-amber-50 text-amber-700',
  'Half Day': 'bg-orange-50 text-orange-600'
}

var STATUS_DOTS = {
  Present: 'bg-emerald-500',
  Absent: 'bg-red-500',
  Incomplete: 'bg-amber-500',
  'Half Day': 'bg-orange-500'
}

// Filter toolbar field style + labelled wrapper
var FIELD = 'h-10 px-3 border border-gray-200 rounded-xl bg-white text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent'

// One filter with its label. On a phone the label is hidden (the field's own
// text says what it is) and `order` places it in the 2 x 2 grid.
function FilterField({ label, grow, order, children }) {
  return (
    <div className={'min-w-0 ' + (grow ? 'sm:flex-1 sm:min-w-48 ' : '') + (order || '')}>
      <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1 px-0.5 max-sm:sr-only">{label}</label>
      {children}
    </div>
  )
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
  var [detailPunches, setDetailPunches] = useState([])
  var [detailPunchLoading, setDetailPunchLoading] = useState(false)
  var [sortCol, setSortCol] = useState('name')
  var [sortDir, setSortDir] = useState('asc')

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

  // People per department for the day (shown in the department picker)
  var deptCounts = {}
  records.forEach(function (r) { deptCounts[r.department_id] = (deptCounts[r.department_id] || 0) + 1 })

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

  // Sort
  function handleSort(col) {
    if (sortCol === col) { setSortDir(sortDir === 'asc' ? 'desc' : 'asc') }
    else { setSortCol(col); setSortDir('asc') }
  }
  filtered.sort(function (a, b) {
    var va, vb
    switch (sortCol) {
      case 'emp_code': va = a.emp_code; vb = b.emp_code; break
      case 'name': va = a.name; vb = b.name; break
      case 'department_name': va = a.department_name || ''; vb = b.department_name || ''; break
      case 'first_in': va = a.first_in || ''; vb = b.first_in || ''; break
      case 'last_out': va = a.last_out || ''; vb = b.last_out || ''; break
      case 'in_count': va = a.in_count || 0; vb = b.in_count || 0; break
      case 'status': va = a.status || ''; vb = b.status || ''; break
      case 'hours': va = dailyHours(a); vb = dailyHours(b); break
      default: va = a.name; vb = b.name
    }
    if (typeof va === 'string') {
      var cmp = va.localeCompare(vb)
      return sortDir === 'asc' ? cmp : -cmp
    }
    return sortDir === 'asc' ? va - vb : vb - va
  })

  async function openDetailPanel(r) {
    setDetailTarget(r)
    setDetailPunchLoading(true)
    var { data } = await supabase
      .from('punches')
      .select('id, punch_type, punched_at, selfie_path, latitude, longitude, gps_accuracy_meters, nearest_venue_id, is_proxy, location_name, venues(name)')
      .eq('employee_id', r.employee_id)
      .eq('attendance_date', date)
      .order('punched_at')
    setDetailPunches(data || [])
    setDetailPunchLoading(false)
  }

  async function handleDeletePunch(punch) {
    var reason = window.prompt('Reason for deleting this ' + punch.punch_type.toUpperCase() + ' punch at ' + fmtTime(punch.punched_at) + '?')
    if (!reason || !reason.trim()) return
    var { data, error } = await supabase.rpc('delete_punch', {
      p_punch_id: punch.id,
      p_reason: reason.trim()
    })
    if (error || (data && data.error)) {
      window.alert('Delete failed: ' + ((data && data.error) || error.message))
      return
    }
    showToast('Punch deleted')
    setDetailPunches(function (prev) { return prev.filter(function (x) { return x.id !== punch.id }) })
    loadData()
  }

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

  // Row "Override" button — shared by the desktop table and the phone cards
  function startOverride(r) {
    setOverrideTarget(r)
    setOverrideType(r.status === 'Incomplete' ? 'punch_out' : 'full_day_override')
    setOverrideValue(r.status === 'Incomplete' ? '' : 'P')
    setOverrideReason('')
    setOverrideError('')
  }

  // Stat cards double as quick status filters
  var STAT_CARDS = [
    { key: '', label: 'Total', value: stats.total, dot: 'bg-slate-400', color: 'text-gray-900' },
    { key: 'Present', label: 'Present', value: stats.Present, dot: 'bg-emerald-500', color: 'text-emerald-600' },
    { key: 'Absent', label: 'Absent', value: stats.Absent, dot: 'bg-red-500', color: 'text-red-600' },
    { key: 'Incomplete', label: 'Incomplete', value: stats.Incomplete, dot: 'bg-amber-500', color: 'text-amber-600' },
    { key: 'Half Day', label: 'Half Day', value: stats['Half Day'], dot: 'bg-orange-500', color: 'text-orange-600' }
  ]

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3 mb-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-gray-900 tracking-tight">Daily Attendance</h2>
          <p className="text-sm text-gray-500 mt-0.5">View and manage attendance records · click a row for punches and selfies</p>
        </div>
      </div>

      {/* Filters toolbar: one row on desktop; a compact 2 x 2 grid on a phone
          (Department | Date, Status | Search). Department sits on the left
          so its wide drop-down list stays on screen. */}
      <div className="bg-white rounded-2xl ring-1 ring-gray-200/70 shadow-sm p-3 mb-4 grid grid-cols-2 gap-2 sm:flex sm:flex-row sm:flex-wrap sm:items-end sm:gap-3">
        <FilterField label="Date" order="max-sm:order-2">
          <input type="date" value={date} onChange={function (e) { setDate(e.target.value) }}
            className={FIELD + ' w-full sm:w-auto'} />
        </FilterField>
        <FilterField label="Department" order="max-sm:order-1">
          <DeptPicker departments={departments} value={deptFilter} onChange={setDeptFilter}
            counts={deptCounts} total={records.length} className="h-10 rounded-xl w-full sm:w-auto max-sm:min-w-0" />
        </FilterField>
        <FilterField label="Status" order="max-sm:order-3">
          <select value={statusFilter} onChange={function (e) { setStatusFilter(e.target.value) }}
            className={FIELD + ' w-full sm:w-auto sm:min-w-36'}>
            <option value="">All statuses</option>
            <option value="Present">Present</option>
            <option value="Absent">Absent</option>
            <option value="Incomplete">Incomplete</option>
            <option value="Half Day">Half Day</option>
          </select>
        </FilterField>
        <FilterField label="Search" grow order="max-sm:order-4">
          <div className="relative">
            <svg className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
            <input type="text" value={search} onChange={function (e) { setSearch(e.target.value) }}
              placeholder="Name or code…"
              className={FIELD + ' w-full pl-9'} />
          </div>
        </FilterField>
      </div>

      {/* Stats — click to filter by that status */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 sm:gap-3 mb-4">
        {STAT_CARDS.map(function (c) {
          var active = statusFilter === c.key
          return (
            <button key={c.label} onClick={function () { setStatusFilter(active && c.key ? '' : c.key) }}
              className={'text-left rounded-2xl px-3 py-2.5 sm:px-4 sm:py-3 bg-white shadow-sm transition-all ' +
                (active ? 'ring-2 ring-blue-500' : 'ring-1 ring-gray-200/70 hover:ring-gray-300')}>
              <p className="flex items-center gap-2 text-[13px] font-medium text-gray-500">
                <span className={'w-2 h-2 rounded-full ' + c.dot} />
                {c.label}
              </p>
              <p className={'text-[22px] sm:text-[26px] font-bold leading-tight mt-1 tabular-nums ' + c.color}>{c.value}</p>
            </button>
          )
        })}
      </div>

      {/* Table */}
      {loading ? (
        <p className="text-sm text-gray-400 text-center py-12">Loading…</p>
      ) : (
        <>
        {/* Phone: card list in place of the wide table */}
        <div className="md:hidden space-y-2">
          {filtered.length === 0 ? (
            <div className="bg-white rounded-2xl ring-1 ring-gray-200/70 shadow-sm text-center py-12 text-sm text-gray-400">No records for this date</div>
          ) : filtered.map(function (r) {
            var hasSelfie = r.punches && r.punches.some(function (p) { return p.selfie_path })
            return (
              <div key={r.employee_id}
                className="bg-white rounded-2xl ring-1 ring-gray-200/70 shadow-sm p-3 cursor-pointer active:bg-blue-50/40 transition-colors"
                onClick={function () { openDetailPanel(r) }}>
                <div className="flex items-center gap-3">
                  <div onClick={function (e) { e.stopPropagation() }} className="shrink-0 w-9 h-9">
                    {hasSelfie
                      ? <SelfieAvatar punches={r.punches} />
                      : <span className="w-9 h-9 rounded-full bg-slate-100 text-slate-500 text-xs font-bold inline-flex items-center justify-center">{rowInitials(r)}</span>}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-gray-900 truncate">
                      {r.name}
                      {r.is_casual && <span className="ml-1.5 text-[10px] font-medium text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded align-middle">casual</span>}
                    </p>
                    <p className="text-xs text-gray-400 truncate"><span className="tabular-nums">{r.emp_code}</span>{r.department_name ? ' · ' + r.department_name : ''}</p>
                  </div>
                  <span className={'shrink-0 inline-flex items-center gap-1.5 text-[11px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ' + (STATUS_COLORS[r.status] || 'bg-gray-100 text-gray-500')}>
                    <span className={'w-1.5 h-1.5 rounded-full ' + (STATUS_DOTS[r.status] || 'bg-gray-400')} />
                    {r.status}
                  </span>
                </div>

                <div className="mt-2.5 grid grid-cols-3 gap-2 rounded-xl bg-gray-50 px-3 py-2">
                  <div>
                    <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">In</p>
                    <p className="text-[13px] font-semibold text-gray-800 tabular-nums whitespace-nowrap">{fmtTime(r.first_in)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Out</p>
                    <p className="text-[13px] font-semibold text-gray-800 tabular-nums whitespace-nowrap">{fmtTime(r.last_out)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Sessions</p>
                    <p className="text-[13px] font-semibold text-gray-800 tabular-nums">{r.in_count || 0}</p>
                  </div>
                </div>

                {r.status !== 'Absent' && (
                  <div className="mt-2 space-y-1 text-xs">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="w-8 shrink-0 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">In</span>
                      <div className="min-w-0"><VenueCell venue={r.venue_in} status={r.status} type="in" locationName={punchLocation(r, 'in')} /></div>
                    </div>
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="w-8 shrink-0 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Out</span>
                      <div className="min-w-0"><VenueCell venue={r.venue_out} status={r.status} type="out" locationName={punchLocation(r, 'out')} /></div>
                      {r.has_override && <span className="shrink-0 text-[10px] font-semibold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded" title="Has override">edited</span>}
                    </div>
                  </div>
                )}

                {(r.status === 'Incomplete' || r.status === 'Absent') && (
                  <div className="mt-2.5" onClick={function (e) { e.stopPropagation() }}>
                    <button onClick={function () { startOverride(r) }}
                      className="w-full h-9 text-xs font-semibold text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-xl transition-colors">
                      Override
                    </button>
                  </div>
                )}
              </div>
            )
          })}
          {filtered.length > 0 && (
            <p className="px-1 pt-1 text-xs text-gray-500">Showing {filtered.length} of {records.length}</p>
          )}
        </div>

        {/* Desktop table */}
        <div className="hidden md:block bg-white rounded-2xl ring-1 ring-gray-200/70 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50/80 border-b border-gray-200">
                  {[
                    { key: 'name', label: 'Employee' },
                    { key: 'department_name', label: 'Department' },
                    { key: 'first_in', label: 'In' },
                    { key: 'last_out', label: 'Out' },
                    { key: 'hours', label: 'Hours', center: true },
                    { key: 'in_count', label: 'Sessions', center: true },
                    { key: 'status', label: 'Status' },
                    { key: null, label: 'Venue In' },
                    { key: null, label: 'Venue Out' }
                  ].map(function (col, i) {
                    var arrow = sortCol === col.key ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''
                    return (
                      <th key={i}
                        onClick={col.key ? function () { handleSort(col.key) } : undefined}
                        className={(col.center ? 'text-center' : 'text-left') + ' px-4 py-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap' +
                          (col.key ? ' cursor-pointer hover:text-gray-800 select-none' : '') + (sortCol === col.key ? ' text-gray-900' : '')}>
                        {col.label}{arrow}
                      </th>
                    )
                  })}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="text-center py-12 text-sm text-gray-400">No records for this date</td>
                  </tr>
                ) : filtered.map(function (r) {
                  var initials = rowInitials(r)
                  var hasSelfie = r.punches && r.punches.some(function (p) { return p.selfie_path })
                  return (
                    <tr key={r.employee_id}
                      className="hover:bg-blue-50/40 cursor-pointer transition-colors"
                      onClick={function () { openDetailPanel(r) }}>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-3 min-w-52">
                          <div onClick={function (e) { e.stopPropagation() }} className="shrink-0 w-9 h-9">
                            {hasSelfie
                              ? <SelfieAvatar punches={r.punches} />
                              : <span className="w-9 h-9 rounded-full bg-slate-100 text-slate-500 text-xs font-bold inline-flex items-center justify-center">{initials}</span>}
                          </div>
                          <div className="min-w-0">
                            <p className="font-semibold text-gray-900 truncate">
                              {r.name}
                              {r.is_casual && <span className="ml-1.5 text-[10px] font-medium text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded align-middle">casual</span>}
                            </p>
                            <p className="text-xs text-gray-400 tabular-nums">{r.emp_code}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-[13px] text-gray-600 whitespace-nowrap">{r.department_name || '—'}</td>
                      <td className="px-4 py-2.5 text-[13px] font-medium text-gray-800 tabular-nums whitespace-nowrap">{fmtTime(r.first_in)}</td>
                      <td className="px-4 py-2.5 text-[13px] font-medium text-gray-800 tabular-nums whitespace-nowrap">{fmtTime(r.last_out)}</td>
                      <td className="px-4 py-2.5 text-[13px] font-semibold text-gray-800 tabular-nums text-center whitespace-nowrap">
                        {fmtHours(dailyHours(r))}
                      </td>
                      <td className="px-4 py-2.5 text-[13px] text-gray-600 tabular-nums text-center">{r.in_count || 0}</td>
                      <td className="px-4 py-2.5">
                        <span className={'inline-flex items-center gap-1.5 text-[11px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ' + (STATUS_COLORS[r.status] || 'bg-gray-100 text-gray-500')}>
                          <span className={'w-1.5 h-1.5 rounded-full ' + (STATUS_DOTS[r.status] || 'bg-gray-400')} />
                          {r.status}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-xs">
                        <VenueCell venue={r.venue_in} status={r.status} type="in"
                          locationName={punchLocation(r, 'in')} />
                      </td>
                      <td className="px-4 py-2.5 text-xs">
                        <div className="flex items-center gap-1.5">
                          <VenueCell venue={r.venue_out} status={r.status} type="out"
                            locationName={punchLocation(r, 'out')} />
                          {r.has_override && <span className="shrink-0 text-[10px] font-semibold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded" title="Has override">edited</span>}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {filtered.length > 0 && (
            <div className="px-4 py-2.5 border-t border-gray-100 text-xs text-gray-500">
              Showing {filtered.length} of {records.length}
            </div>
          )}
        </div>
        </>
      )}

      {/* DETAIL PANEL */}
      {detailTarget && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-3 sm:p-4" onClick={function () { setDetailTarget(null) }}>
          <div className="bg-white rounded-xl w-full max-w-lg shadow-xl max-h-[88vh] sm:max-h-[80vh] overflow-y-auto" onClick={function (e) { e.stopPropagation() }}>
            <div className="px-4 sm:px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <div className="min-w-0">
                <h3 className="text-sm font-bold text-gray-900">{detailTarget.name}</h3>
                <p className="text-xs text-gray-500">{detailTarget.emp_code} · {detailTarget.department_name} · {date}</p>
              </div>
              <button onClick={function () { setDetailTarget(null) }} className="text-gray-400 hover:text-gray-600 text-lg">✕</button>
            </div>
            <div className="px-4 sm:px-5 py-4">
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
              {detailPunchLoading ? (
                <p className="text-xs text-gray-400 italic mb-4">Loading punches…</p>
              ) : detailPunches.length === 0 ? (
                <p className="text-xs text-gray-400 italic mb-4">No punches recorded</p>
              ) : (
                <div className="space-y-2 mb-4">
                  {detailPunches.map(function (p) {
                    var venueName = p.venues ? p.venues.name : null
                    var locationLabel = venueName || p.location_name || null
                    return (
                      <div key={p.id} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2">
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
                              <span className="text-xs font-mono text-gray-700">{fmtTime(p.punched_at)}</span>
                            </div>
                            {locationLabel && (
                              <span className={'text-[10px] ' + (venueName ? 'text-emerald-600 font-medium' : 'text-gray-400')}>
                                📍 {locationLabel}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {p.is_proxy && <span className="text-[9px] text-amber-600 bg-amber-50 px-1.5 rounded">proxy</span>}
                          {p.gps_accuracy_meters && p.gps_accuracy_meters > 100 && (
                            <span className="text-[9px] text-amber-500">{Math.round(p.gps_accuracy_meters)}m</span>
                          )}
                          <button
                            onClick={function () { handleDeletePunch(p) }}
                            className="text-[10px] text-red-500 hover:text-red-700 hover:bg-red-50 px-1.5 py-0.5 rounded"
                            title="Delete punch"
                          >
                            🗑
                          </button>
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
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-3 sm:p-4" onClick={function () { setOverrideTarget(null) }}>
          <div className="bg-white rounded-xl w-full max-w-md shadow-xl max-h-[88vh] overflow-y-auto md:max-h-none md:overflow-visible" onClick={function (e) { e.stopPropagation() }}>
            <div className="px-4 sm:px-5 py-4 border-b border-gray-100">
              <h3 className="text-sm font-bold text-gray-900">Override for {overrideTarget.name}</h3>
              <p className="text-xs text-gray-500">{overrideTarget.emp_code} · {date}</p>
            </div>
            <form onSubmit={handleOverride} className="px-4 sm:px-5 py-4 space-y-3">
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
        <div className="fixed bottom-4 left-4 right-4 sm:left-auto sm:bottom-6 sm:right-6 bg-slate-800 text-white px-5 py-3 rounded-xl text-sm shadow-lg z-50">
          {toast}
        </div>
      )}
    </div>
  )
}

// "Rahul Sharma" -> "RS" (row avatar fallback)
function rowInitials(r) {
  return (r.name || '?').trim().split(/\s+/).slice(0, 2).map(function (w) { return w[0] }).join('').toUpperCase()
}

// Area name of the row's in/out punch, shown when it isn't at a known venue
// Hours worked that day, counted like the server does: each IN paired with
// the next OUT, open sessions not counted. Falls back to first IN -> last OUT
// when the row's punches carry no times.
function dailyHours(r) {
  var ps = (r.punches || []).filter(function (p) { return p.punched_at })
  if (ps.length) {
    ps = ps.slice().sort(function (a, b) { return new Date(a.punched_at) - new Date(b.punched_at) })
    var total = 0
    var openIn = null
    ps.forEach(function (p) {
      if (p.punch_type === 'in') openIn = p
      else if (p.punch_type === 'out' && openIn) {
        total += (new Date(p.punched_at) - new Date(openIn.punched_at)) / 3600000
        openIn = null
      }
    })
    return total
  }
  if (r.first_in && r.last_out && new Date(r.last_out) > new Date(r.first_in)) {
    return (new Date(r.last_out) - new Date(r.first_in)) / 3600000
  }
  return 0
}

// 7.75 -> "7h 45m", 0 -> "—"
function fmtHours(h) {
  if (!h || h <= 0) return '—'
  var mins = Math.round(h * 60)
  var hh = Math.floor(mins / 60)
  var mm = mins % 60
  return hh ? hh + 'h' + (mm ? ' ' + mm + 'm' : '') : mm + 'm'
}

function punchLocation(r, type) {
  return r.punches && r.punches.find(function (p) { return p.punch_type === type && p.location_name })
    ? r.punches.find(function (p) { return p.punch_type === type }).location_name
    : null
}

var SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL

function selfieUrl(path) {
  if (!path) return null
  return SUPABASE_URL + '/storage/v1/object/public/selfies/' + path
}

// Thumbnail-sized render — avatars only ever display at ~28-36px, but the
// plain object URL serves the full captured file every time. Supabase
// Storage's image-transform endpoint lets us ask for a small resize instead.
// Falls back to the full image automatically if transforms aren't available
// on this project's plan (onError below).
function selfieThumbUrl(path) {
  if (!path) return null
  return SUPABASE_URL + '/storage/v1/render/image/public/selfies/' + path + '?width=96&height=96&resize=cover&quality=60'
}

function SelfieImg({ path, size, rounded }) {
  var [open, setOpen] = useState(false)
  var [thumbFailed, setThumbFailed] = useState(false)
  var url = selfieUrl(path)
  if (!url) return null
  var thumbSrc = thumbFailed ? url : selfieThumbUrl(path)

  return (
    <>
      <img
        src={thumbSrc}
        alt="Selfie"
        className={'object-cover cursor-pointer border border-gray-200 hover:border-slate-400 transition-colors ' + (size || 'w-8 h-8') + ' ' + (rounded || 'rounded-full')}
        onClick={function (e) { e.stopPropagation(); setOpen(true) }}
        onError={function () { if (!thumbFailed) setThumbFailed(true) }}
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

function VenueCell({ venue, status, type, locationName }) {
  if (status === 'Absent') return <span className="text-gray-300">—</span>
  if (status === 'Incomplete' && type === 'out') return <span className="text-gray-300">—</span>

  // Matched one of our venues
  if (venue) {
    return (
      <span className="flex items-center gap-1.5 max-w-48 text-[13px] text-gray-800" title={venue}>
        <PinIcon className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
        <span className="truncate">{venue}</span>
      </span>
    )
  }

  // Outside all venues, but we know the area
  if (locationName) {
    return (
      <span className="flex items-center gap-1.5 max-w-48 text-[13px] text-gray-500" title={'Outside venues · ' + locationName}>
        <PinIcon className="w-3.5 h-3.5 text-gray-400 shrink-0" />
        <span className="truncate">{locationName}</span>
      </span>
    )
  }

  return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-600 whitespace-nowrap">
      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M12 9v4M12 17h.01" /><path d="M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
      </svg>
      Not in venue
    </span>
  )
}

function PinIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z" /><circle cx="12" cy="9.5" r="2.5" />
    </svg>
  )
}

// Table avatar: the punch-in selfie at full size, the punch-out selfie as a
// small badge on its corner (each opens full size on click)
function SelfieAvatar({ punches }) {
  var inPunch = punches.find(function (p) { return p.punch_type === 'in' && p.selfie_path })
  var outPunch = punches.find(function (p) { return p.punch_type === 'out' && p.selfie_path })
  var main = inPunch || outPunch
  var badge = inPunch && outPunch ? outPunch : null
  return (
    <div className="relative w-9 h-9">
      <SelfieImg path={main.selfie_path} size="w-9 h-9" rounded="rounded-full" />
      {badge && (
        <span className="absolute -bottom-1 -right-1 rounded-full ring-2 ring-white">
          <SelfieImg path={badge.selfie_path} size="w-4.5 h-4.5" rounded="rounded-full" />
        </span>
      )}
    </div>
  )
}
