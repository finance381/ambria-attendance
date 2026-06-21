import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'

var MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
var DAYS = ['Su','Mo','Tu','We','Th','Fr','Sa']

export default function LeaveOverride() {
  // ── Override employees ──
  var [overrideEmps, setOverrideEmps] = useState([])
  var [allEmps, setAllEmps] = useState([])
  var [addEmpId, setAddEmpId] = useState('')
  var [empLoading, setEmpLoading] = useState(true)
  var [empSaving, setEmpSaving] = useState(false)

  // ── Bonus calendar ──
  var [calYear, setCalYear] = useState(new Date().getFullYear())
  var [calMonth, setCalMonth] = useState(new Date().getMonth())
  var [bonusDates, setBonusDates] = useState([])
  var [bonusLoading, setBonusLoading] = useState(true)
  var [reasonModal, setReasonModal] = useState(null) // { date: 'YYYY-MM-DD' }
  var [reasonText, setReasonText] = useState('')
  var [bonusSaving, setBonusSaving] = useState(false)

  var [toast, setToast] = useState('')

  function showToast(msg) { setToast(msg); setTimeout(function () { setToast('') }, 3000) }

  // ── Load employees ──
  var loadEmps = useCallback(async function () {
    setEmpLoading(true)
    var { data } = await supabase
      .from('employees')
      .select('id, emp_code, name, department_id, leave_scheme, monthly_leave_cap, active')
      .eq('active', true)
      .eq('is_casual', false)
      .order('name')
    var emps = data || []
    setAllEmps(emps)
    setOverrideEmps(emps.filter(function (e) { return e.leave_scheme === 'monthly_cap' }))
    setEmpLoading(false)
  }, [])

  // ── Load bonus dates ──
  var loadBonus = useCallback(async function () {
    setBonusLoading(true)
    var { data } = await supabase
      .from('bonus_leave_dates')
      .select('*')
      .order('leave_date')
    setBonusDates(data || [])
    setBonusLoading(false)
  }, [])

  useEffect(function () { loadEmps(); loadBonus() }, [loadEmps, loadBonus])

  // ── Add employee to override ──
  async function handleAddEmp() {
    if (!addEmpId) return
    setEmpSaving(true)
    var { error } = await supabase
      .from('employees')
      .update({ leave_scheme: 'monthly_cap', monthly_leave_cap: 4 })
      .eq('id', addEmpId)
    if (error) { showToast('Error: ' + error.message) }
    else { showToast('Employee added to monthly-cap override'); setAddEmpId('') }
    await loadEmps()
    setEmpSaving(false)
  }

  // ── Remove employee from override ──
  async function handleRemoveEmp(empId, empName) {
    if (!confirm('Remove ' + empName + ' from monthly-cap override? They will revert to standard leave.')) return
    var { error } = await supabase
      .from('employees')
      .update({ leave_scheme: 'standard' })
      .eq('id', empId)
    if (error) { showToast('Error: ' + error.message) }
    else { showToast(empName + ' reverted to standard leave') }
    await loadEmps()
  }

  // ── Update monthly cap ──
  async function handleCapChange(empId, newCap) {
    var cap = parseInt(newCap)
    if (isNaN(cap) || cap < 1 || cap > 30) return
    await supabase
      .from('employees')
      .update({ monthly_leave_cap: cap })
      .eq('id', empId)
    setOverrideEmps(function (prev) {
      return prev.map(function (e) { return e.id === empId ? Object.assign({}, e, { monthly_leave_cap: cap }) : e })
    })
  }

  // ── Bonus date toggle ──
  function handleDateClick(dateStr) {
    var existing = bonusDates.find(function (b) { return b.leave_date === dateStr })
    if (existing) {
      // Remove
      removeBonusDate(existing)
    } else {
      // Open reason modal
      setReasonText('')
      setReasonModal({ date: dateStr })
    }
  }

  async function removeBonusDate(bonus) {
    if (!confirm('Remove bonus leave on ' + bonus.leave_date + (bonus.reason ? ' (' + bonus.reason + ')' : '') + '?')) return
    setBonusSaving(true)
    await supabase.from('bonus_leave_dates').delete().eq('id', bonus.id)
    await loadBonus()
    setBonusSaving(false)
    showToast('Removed bonus leave: ' + bonus.leave_date)
  }

  async function handleAddBonus() {
    if (!reasonModal) return
    setBonusSaving(true)
    var { error } = await supabase.from('bonus_leave_dates').insert({
      leave_date: reasonModal.date,
      reason: reasonText.trim() || null
    })
    if (error) {
      if (error.code === '23505') showToast('Date already marked')
      else showToast('Error: ' + error.message)
    } else {
      showToast('Bonus leave added: ' + reasonModal.date)
    }
    setReasonModal(null)
    await loadBonus()
    setBonusSaving(false)
  }

  // ── Calendar grid ──
  var firstDay = new Date(calYear, calMonth, 1).getDay()
  var daysInMonth = new Date(calYear, calMonth + 1, 0).getDate()
  var cells = []
  for (var i = 0; i < firstDay; i++) cells.push(null)
  for (var d = 1; d <= daysInMonth; d++) cells.push(d)

  var bonusDateSet = {}
  bonusDates.forEach(function (b) { bonusDateSet[b.leave_date] = b })

  // Available employees (not already on override)
  var availableEmps = allEmps.filter(function (e) { return e.leave_scheme !== 'monthly_cap' })

  // ── FY bonus count ──
  var today = new Date()
  var fyStart = today.getMonth() >= 3
    ? new Date(today.getFullYear(), 3, 1)
    : new Date(today.getFullYear() - 1, 3, 1)
  var fyEnd = new Date(fyStart.getFullYear() + 1, 2, 31)
  var fyBonusCount = bonusDates.filter(function (b) {
    var dt = new Date(b.leave_date)
    return dt >= fyStart && dt <= fyEnd
  }).length

  function prevMonth() {
    if (calMonth === 0) { setCalMonth(11); setCalYear(calYear - 1) }
    else setCalMonth(calMonth - 1)
  }
  function nextMonth() {
    if (calMonth === 11) { setCalMonth(0); setCalYear(calYear + 1) }
    else setCalMonth(calMonth + 1)
  }

  return (
    <div className="space-y-8">
      {/* Toast */}
      {toast && (
        <div className="fixed top-4 right-4 z-50 bg-slate-800 text-white px-4 py-2 rounded-lg text-sm shadow-lg">
          {toast}
        </div>
      )}

      {/* ── Section A: Override Employees ── */}
      <div>
        <h3 className="text-sm font-bold text-gray-900 mb-1">Monthly-Cap Employees</h3>
        <p className="text-xs text-gray-500 mb-3">
          These employees get {'\u00A0'}<span className="font-semibold">4 leaves/month</span>{'\u00A0'} (carry-forward) + bonus days instead of the standard 76/year. No half-days.
        </p>

        {/* Add employee */}
        <div className="flex gap-2 mb-4">
          <select
            value={addEmpId}
            onChange={function (e) { setAddEmpId(e.target.value) }}
            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-700"
          >
            <option value="">Select employee to add…</option>
            {availableEmps.map(function (e) {
              return <option key={e.id} value={e.id}>{e.name} ({e.emp_code})</option>
            })}
          </select>
          <button
            onClick={handleAddEmp}
            disabled={!addEmpId || empSaving}
            className="px-4 py-2 bg-slate-800 text-white text-sm font-semibold rounded-lg hover:bg-slate-700 disabled:opacity-40"
          >
            {empSaving ? 'Adding…' : 'Add'}
          </button>
        </div>

        {/* Employee list */}
        {empLoading ? (
          <p className="text-sm text-gray-400 py-6 text-center">Loading…</p>
        ) : overrideEmps.length === 0 ? (
          <div className="border border-dashed border-gray-300 rounded-xl py-8 text-center">
            <p className="text-sm text-gray-400">No employees on monthly-cap override yet</p>
            <p className="text-xs text-gray-300 mt-1">Select an employee above to get started</p>
          </div>
        ) : (
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="text-left px-3 py-2.5 text-[10px] font-bold text-gray-500 uppercase tracking-wider">Code</th>
                  <th className="text-left px-3 py-2.5 text-[10px] font-bold text-gray-500 uppercase tracking-wider">Name</th>
                  <th className="text-center px-3 py-2.5 text-[10px] font-bold text-gray-500 uppercase tracking-wider">Leaves/Month</th>
                  <th className="text-center px-3 py-2.5 text-[10px] font-bold text-gray-500 uppercase tracking-wider w-20"></th>
                </tr>
              </thead>
              <tbody>
                {overrideEmps.map(function (e) {
                  return (
                    <tr key={e.id} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="px-3 py-2 text-xs text-gray-400 font-mono">{e.emp_code}</td>
                      <td className="px-3 py-2 font-medium text-gray-900">{e.name}</td>
                      <td className="px-3 py-2 text-center">
                        <input
                          type="number"
                          value={e.monthly_leave_cap}
                          onChange={function (ev) { handleCapChange(e.id, ev.target.value) }}
                          min="1" max="30"
                          className="w-16 px-2 py-1 border border-gray-300 rounded text-sm text-center focus:outline-none focus:ring-2 focus:ring-slate-700"
                        />
                      </td>
                      <td className="px-3 py-2 text-center">
                        <button
                          onClick={function () { handleRemoveEmp(e.id, e.name) }}
                          className="text-xs text-red-500 hover:text-red-700 font-semibold"
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Section B: Bonus Leave Calendar ── */}
      <div>
        <h3 className="text-sm font-bold text-gray-900 mb-1">Bonus Leave Calendar</h3>
        <p className="text-xs text-gray-500 mb-1">
          Mark dates when all monthly-cap employees get an extra leave day (festivals, company events, etc).
        </p>
        <p className="text-xs text-gray-400 mb-3">
          FY total: <span className="font-semibold text-gray-600">{fyBonusCount}</span> bonus day{fyBonusCount !== 1 ? 's' : ''} marked
        </p>

        {/* Month nav */}
        <div className="flex items-center gap-3 mb-3">
          <button onClick={prevMonth} className="px-2.5 py-1.5 text-sm bg-gray-100 rounded-lg hover:bg-gray-200 active:bg-gray-300">←</button>
          <span className="text-sm font-semibold text-gray-800 min-w-[120px] text-center">
            {MONTHS[calMonth]} {calYear}
          </span>
          <button onClick={nextMonth} className="px-2.5 py-1.5 text-sm bg-gray-100 rounded-lg hover:bg-gray-200 active:bg-gray-300">→</button>
        </div>

        {/* Calendar grid */}
        {bonusLoading ? (
          <p className="text-sm text-gray-400 py-6 text-center">Loading…</p>
        ) : (
          <div className="bg-white border border-gray-200 rounded-xl p-3 shadow-sm inline-block">
            {/* Day headers */}
            <div className="grid grid-cols-7 gap-1 mb-1">
              {DAYS.map(function (day) {
                return (
                  <div key={day} className="w-10 h-8 flex items-center justify-center text-[10px] font-bold text-gray-400 uppercase">
                    {day}
                  </div>
                )
              })}
            </div>
            {/* Date cells */}
            <div className="grid grid-cols-7 gap-1">
              {cells.map(function (day, idx) {
                if (day === null) {
                  return <div key={'empty-' + idx} className="w-10 h-10" />
                }
                var mm = String(calMonth + 1).padStart(2, '0')
                var dd = String(day).padStart(2, '0')
                var dateStr = calYear + '-' + mm + '-' + dd
                var bonus = bonusDateSet[dateStr]
                var isBonus = !!bonus
                var isToday = dateStr === new Date().toISOString().slice(0, 10)

                return (
                  <button
                    key={dateStr}
                    onClick={function () { handleDateClick(dateStr) }}
                    disabled={bonusSaving}
                    title={isBonus ? (bonus.reason || 'Bonus leave') + ' — click to remove' : 'Click to mark as bonus leave'}
                    className={
                      'w-10 h-10 rounded-lg text-sm font-medium transition-all relative ' +
                      (isBonus
                        ? 'bg-emerald-500 text-white hover:bg-emerald-600 shadow-sm'
                        : 'bg-gray-50 text-gray-700 hover:bg-gray-100') +
                      (isToday ? ' ring-2 ring-slate-400 ring-offset-1' : '')
                    }
                  >
                    {day}
                    {isBonus && bonus.reason && (
                      <span className="absolute -bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-white" />
                    )}
                  </button>
                )
              })}
            </div>

            {/* Legend for current month bonus dates */}
            {(function () {
              var monthBonuses = bonusDates.filter(function (b) {
                return b.leave_date.startsWith(calYear + '-' + String(calMonth + 1).padStart(2, '0'))
              })
              if (monthBonuses.length === 0) return null
              return (
                <div className="mt-3 pt-3 border-t border-gray-100 space-y-1">
                  {monthBonuses.map(function (b) {
                    return (
                      <div key={b.id} className="flex items-center gap-2 text-xs">
                        <span className="w-2 h-2 rounded-full bg-emerald-500 flex-shrink-0" />
                        <span className="text-gray-600 font-medium">{b.leave_date.slice(8)}{' '}{MONTHS[calMonth]}</span>
                        {b.reason && <span className="text-gray-400">— {b.reason}</span>}
                      </div>
                    )
                  })}
                </div>
              )
            })()}
          </div>
        )}
      </div>

      {/* ── Reason Modal ── */}
      {reasonModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={function () { setReasonModal(null) }}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-5" onClick={function (e) { e.stopPropagation() }}>
            <h4 className="text-sm font-bold text-gray-900 mb-1">Add Bonus Leave</h4>
            <p className="text-xs text-gray-500 mb-4">{reasonModal.date}</p>

            <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1">Reason (optional)</label>
            <input
              type="text"
              value={reasonText}
              onChange={function (e) { setReasonText(e.target.value) }}
              placeholder="e.g. Diwali, Company event…"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-slate-700"
              autoFocus
              onKeyDown={function (e) { if (e.key === 'Enter') handleAddBonus() }}
            />

            <div className="flex gap-2">
              <button
                onClick={function () { setReasonModal(null) }}
                className="flex-1 px-4 py-2 text-sm font-semibold text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200"
              >
                Cancel
              </button>
              <button
                onClick={handleAddBonus}
                disabled={bonusSaving}
                className="flex-1 px-4 py-2 text-sm font-semibold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 disabled:opacity-40"
              >
                {bonusSaving ? 'Saving…' : 'Mark as Bonus'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}