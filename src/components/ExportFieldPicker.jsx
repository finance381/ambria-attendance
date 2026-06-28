import { useState } from 'react'

/*
  Field groups the admin can toggle on/off before export.
  Each group maps to one or more RPCs that will be fetched only if selected.
*/
var FIELD_GROUPS = [
  {
    key: 'attendance',
    label: 'Attendance Summary',
    desc: 'Present / Half Day / Absent / Incomplete / Att%',
    default: true,
    source: 'monthly_summary_range',
  },
  {
    key: 'hours',
    label: 'Working Hours',
    desc: 'Total hours, avg daily hours',
    default: true,
    source: 'monthly_summary_range',
  },
  {
    key: 'timing',
    label: 'Avg Punch Times',
    desc: 'Avg punch-in, avg punch-out, min/max hours',
    default: false,
    source: 'avg_punch_times',
  },
  {
    key: 'daily_punches',
    label: 'Daily Punch Detail',
    desc: 'Per-day punch-in & punch-out times',
    default: false,
    source: 'punches',
  },
  {
    key: 'locations',
    label: 'Location Tracking',
    desc: 'GPS location name for each punch-in & out',
    default: false,
    source: 'punches',
  },
  {
    key: 'dar',
    label: 'DAR Compliance',
    desc: 'DARs submitted, missing, compliance %',
    default: false,
    source: 'dar_compliance',
  },
  {
    key: 'claims',
    label: 'Claims',
    desc: 'Claims used, limit, over-limit count',
    default: false,
    source: 'monthly_summary_range',
  },
  {
    key: 'leaves',
    label: 'Leave Balance',
    desc: 'Annual / quarterly / half-day balances',
    default: false,
    source: 'admin_all_leave_balances',
  },
  {
    key: 'deductions',
    label: 'Deductions & Penalties',
    desc: 'FY leave deductions + over-claim count + ₹500/over-claim penalty',
    default: false,
    source: 'admin_all_leave_balances',
  },
]

export { FIELD_GROUPS }

export default function ExportFieldPicker({ open, onClose, onExport, loading, defaultFrom, defaultTo }) {
  var [selected, setSelected] = useState(function () {
    var init = {}
    FIELD_GROUPS.forEach(function (g) { init[g.key] = g.default })
    return init
  })
  var [fromDate, setFromDate] = useState(defaultFrom || '')
  var [toDate, setToDate] = useState(defaultTo || '')

  // Sync defaults when modal opens
  if (open && defaultFrom && !fromDate) setFromDate(defaultFrom)
  if (open && defaultTo && !toDate) setToDate(defaultTo)

  if (!open) return null

  var dateError = fromDate && toDate && toDate < fromDate

  var allSelected = FIELD_GROUPS.every(function (g) { return selected[g.key] })
  var noneSelected = FIELD_GROUPS.every(function (g) { return !selected[g.key] })

  function toggleAll() {
    var val = !allSelected
    var next = {}
    FIELD_GROUPS.forEach(function (g) { next[g.key] = val })
    setSelected(next)
  }

  function toggle(key) {
    setSelected(function (prev) {
      var next = { ...prev }
      next[key] = !next[key]
      return next
    })
  }

  function handleExport() {
    var keys = FIELD_GROUPS.filter(function (g) { return selected[g.key] }).map(function (g) { return g.key })
    onExport(keys, fromDate, toDate)
  }

  // Dedupe sources needed
  var sources = []
  FIELD_GROUPS.forEach(function (g) {
    if (selected[g.key] && sources.indexOf(g.source) === -1) sources.push(g.source)
  })

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl w-full max-w-md shadow-xl" onClick={function (e) { e.stopPropagation() }}>
        {/* Header */}
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-gray-900">Export DOCX Report</h3>
            <p className="text-[10px] text-gray-400 mt-0.5">Select the sections to include</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg leading-none">&times;</button>
        </div>

        {/* Date range */}
        <div className="px-5 pt-3 pb-2">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1">From</label>
              <input type="date" value={fromDate} onChange={function (e) { setFromDate(e.target.value) }}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-700" />
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1">To</label>
              <input type="date" value={toDate} onChange={function (e) { setToDate(e.target.value) }}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-700" />
            </div>
          </div>
          {dateError && <p className="text-[10px] text-red-500 mt-1">To date must be after From date</p>}
        </div>

        {/* Select All */}
        <div className="px-5 pt-3 pb-1">
          <label className="flex items-center gap-2 cursor-pointer group">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={toggleAll}
              className="w-4 h-4 rounded border-gray-300 text-slate-800 focus:ring-slate-700"
            />
            <span className="text-xs font-semibold text-gray-700 group-hover:text-gray-900">Select All</span>
          </label>
        </div>

        {/* Field groups */}
        <div className="px-5 py-3 space-y-1 max-h-[50vh] overflow-y-auto">
          {FIELD_GROUPS.map(function (g) {
            return (
              <label key={g.key} className={'flex items-start gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-colors ' +
                (selected[g.key] ? 'bg-slate-50' : 'hover:bg-gray-50')}>
                <input
                  type="checkbox"
                  checked={selected[g.key]}
                  onChange={function () { toggle(g.key) }}
                  className="w-4 h-4 mt-0.5 rounded border-gray-300 text-slate-800 focus:ring-slate-700"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-gray-800">{g.label}</p>
                  <p className="text-[10px] text-gray-400 mt-0.5">{g.desc}</p>
                </div>
              </label>
            )
          })}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-gray-100 flex items-center justify-between">
          <p className="text-[10px] text-gray-400">
            {sources.length} data source{sources.length !== 1 ? 's' : ''} will be queried
          </p>
          <div className="flex gap-2">
            <button onClick={onClose}
              className="px-4 py-2 text-xs text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors font-medium">
              Cancel
            </button>
            <button onClick={handleExport} disabled={noneSelected || loading || !fromDate || !toDate || dateError}
              className="px-4 py-2 text-xs text-white bg-slate-800 rounded-lg hover:bg-slate-900 disabled:opacity-40 transition-colors font-medium flex items-center gap-2">
              {loading && <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />}
              {loading ? 'Generating…' : '📄 Generate DOCX'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}