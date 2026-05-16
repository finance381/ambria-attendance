import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'

export default function CasualReports() {
  var today = new Date().toISOString().slice(0, 10)
  var [view, setView] = useState('daily')
  var [date, setDate] = useState(today)
  var [data, setData] = useState(null)
  var [movements, setMovements] = useState([])
  var [loading, setLoading] = useState(true)

  var [rptMonth, setRptMonth] = useState(new Date().getMonth() + 1)
  var [rptYear, setRptYear] = useState(new Date().getFullYear())
  var [rptVendor, setRptVendor] = useState('')
  var [rptData, setRptData] = useState(null)
  var [rptLoading, setRptLoading] = useState(false)
  var [allVendors, setAllVendors] = useState([])

  var loadData = useCallback(async function () {
    setLoading(true)
    var [headcount, movLog] = await Promise.all([
      supabase.rpc('casual_daily_headcount', { p_date: date }),
      supabase.rpc('movement_log', { p_date: date })
    ])
    setData(headcount.data)
    setMovements(Array.isArray(movLog.data) ? movLog.data : [])
    setLoading(false)
  }, [date])

  useEffect(function () { loadData() }, [loadData])

  useEffect(function () {
    supabase.from('vendors').select('id, name').eq('active', true).order('name')
      .then(function (res) { setAllVendors(res.data || []) })
  }, [])

  async function loadMonthly() {
    setRptLoading(true)
    var params = { p_month: rptMonth, p_year: rptYear }
    if (rptVendor) params.p_vendor_id = Number(rptVendor)
    var { data: result } = await supabase.rpc('vendor_monthly_report', params)
    setRptData(result)
    setRptLoading(false)
  }

  return (
    <div>
      <h2 className="text-lg font-bold text-gray-900 mb-1">Casual Workers</h2>
      <p className="text-xs text-gray-500 mb-4">Headcount, movements, and vendor reports</p>

      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 mb-5">
        {[
          { id: 'daily', label: 'Daily Headcount' },
          { id: 'monthly', label: 'Vendor Report' }
        ].map(function (tb) {
          return (
            <button key={tb.id} onClick={function () { setView(tb.id) }}
              className={'flex-1 py-2 text-xs font-semibold rounded-lg transition-colors ' +
                (view === tb.id ? 'bg-white text-slate-800 shadow-sm' : 'text-gray-500')}>
              {tb.label}
            </button>
          )
        })}
      </div>

      {view === 'daily' && (
      <div className="flex flex-wrap gap-3 mb-4">
        <div>
          <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1">Date</label>
          <input type="date" value={date} onChange={function (e) { setDate(e.target.value) }}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-700" />
        </div>
      </div>
      )}

      {view === 'monthly' && (
        <div>
          <div className="flex flex-wrap gap-3 mb-4 items-end">
            <div>
              <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1">Month</label>
              <select value={rptMonth} onChange={function (e) { setRptMonth(Number(e.target.value)) }}
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm">
                {['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'].map(function (m, i) {
                  return <option key={i} value={i + 1}>{m}</option>
                })}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1">Year</label>
              <select value={rptYear} onChange={function (e) { setRptYear(Number(e.target.value)) }}
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm">
                {[2025, 2026, 2027].map(function (y) { return <option key={y} value={y}>{y}</option> })}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1">Vendor</label>
              <select value={rptVendor} onChange={function (e) { setRptVendor(e.target.value) }}
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm">
                <option value="">All Vendors</option>
                {allVendors.map(function (v) { return <option key={v.id} value={v.id}>{v.name}</option> })}
              </select>
            </div>
            <button onClick={loadMonthly} disabled={rptLoading}
              className="px-4 py-2 text-sm text-white bg-slate-800 rounded-lg hover:bg-slate-900 disabled:opacity-40 transition-colors font-medium">
              {rptLoading ? 'Loading…' : 'Generate'}
            </button>
          </div>

          {rptData && (
            <>
              <div className="grid grid-cols-3 gap-3 mb-5">
                <div className="bg-white border border-gray-200 rounded-lg px-4 py-3 text-center">
                  <p className="text-[9px] font-semibold text-gray-400 uppercase tracking-wider">Workers</p>
                  <p className="text-2xl font-bold text-slate-800">{rptData.total_workers}</p>
                </div>
                <div className="bg-white border border-gray-200 rounded-lg px-4 py-3 text-center">
                  <p className="text-[9px] font-semibold text-gray-400 uppercase tracking-wider">Total Man-Days</p>
                  <p className="text-2xl font-bold text-blue-700">{rptData.total_days}</p>
                </div>
                <div className="bg-white border border-gray-200 rounded-lg px-4 py-3 text-center">
                  <p className="text-[9px] font-semibold text-gray-400 uppercase tracking-wider">Total Hours</p>
                  <p className="text-2xl font-bold text-emerald-700">{rptData.total_hours}</p>
                </div>
              </div>

              {rptData.vendors.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-8">No casual activity this month</p>
              ) : rptData.vendors.map(function (v) {
                return (
                  <div key={v.vendor_name} className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm mb-4">
                    <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-gray-900">{v.vendor_name}</span>
                        <span className="text-[10px] font-semibold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full">{v.worker_count} workers</span>
                      </div>
                      <div className="text-xs text-gray-500">
                        <span className="font-semibold text-gray-700">{v.total_days}</span> days · <span className="font-semibold text-gray-700">{v.total_hours}</span> hrs
                      </div>
                    </div>
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-100">
                          <th className="text-left px-4 py-2 text-[10px] font-bold text-gray-500 uppercase tracking-wider">Code</th>
                          <th className="text-left px-4 py-2 text-[10px] font-bold text-gray-500 uppercase tracking-wider">Name</th>
                          <th className="text-center px-4 py-2 text-[10px] font-bold text-gray-500 uppercase tracking-wider">Days</th>
                          <th className="text-right px-4 py-2 text-[10px] font-bold text-gray-500 uppercase tracking-wider">Hours</th>
                        </tr>
                      </thead>
                      <tbody>
                        {v.workers.map(function (w) {
                          return (
                            <tr key={w.emp_code} className="border-b border-gray-50 hover:bg-gray-50">
                              <td className="px-4 py-2 text-xs text-gray-400 font-mono">{w.emp_code}</td>
                              <td className="px-4 py-2 text-xs font-medium text-gray-900">{w.name}</td>
                              <td className="px-4 py-2 text-xs text-center text-gray-700">{w.days_worked}</td>
                              <td className="px-4 py-2 text-xs text-right font-mono text-gray-700">{w.total_hours}</td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )
              })}
            </>
          )}
        </div>
      )}

      {view === 'daily' && loading ? (
        <p className="text-sm text-gray-400 text-center py-12">Loading…</p>
      ) : !data ? (
        <p className="text-sm text-gray-400 text-center py-12">No data</p>
      ) : (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-3 gap-3 mb-5">
            <div className="bg-white border border-gray-200 rounded-lg px-4 py-3 text-center">
              <p className="text-[9px] font-semibold text-gray-400 uppercase tracking-wider">Casuals</p>
              <p className="text-2xl font-bold text-slate-800">{data.total_casuals}</p>
            </div>
            <div className="bg-white border border-gray-200 rounded-lg px-4 py-3 text-center">
              <p className="text-[9px] font-semibold text-gray-400 uppercase tracking-wider">Vendors</p>
              <p className="text-2xl font-bold text-blue-700">{data.vendors.length}</p>
            </div>
            <div className="bg-white border border-gray-200 rounded-lg px-4 py-3 text-center">
              <p className="text-[9px] font-semibold text-gray-400 uppercase tracking-wider">Total Hours</p>
              <p className="text-2xl font-bold text-emerald-700">{data.total_hours}</p>
            </div>
          </div>

          {data.total_casuals === 0 ? (
            <div className="text-center py-8">
              <p className="text-sm text-gray-400">No casual workers punched on this date</p>
            </div>
          ) : (
            <div className="space-y-4">
              {data.vendors.map(function (v) {
                return (
                  <div key={v.vendor_name} className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
                    <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-gray-900">{v.vendor_name}</span>
                        <span className="text-[10px] font-semibold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full">
                          {v.worker_count} worker{v.worker_count !== 1 ? 's' : ''}
                        </span>
                      </div>
                    </div>
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-100">
                          <th className="text-left px-4 py-2 text-[10px] font-bold text-gray-500 uppercase tracking-wider">Code</th>
                          <th className="text-left px-4 py-2 text-[10px] font-bold text-gray-500 uppercase tracking-wider">Name</th>
                          <th className="text-center px-4 py-2 text-[10px] font-bold text-emerald-600 uppercase tracking-wider">In</th>
                          <th className="text-center px-4 py-2 text-[10px] font-bold text-red-500 uppercase tracking-wider">Out</th>
                          <th className="text-right px-4 py-2 text-[10px] font-bold text-gray-500 uppercase tracking-wider">Hours</th>
                        </tr>
                      </thead>
                      <tbody>
                        {v.workers.map(function (w) {
                          return (
                            <tr key={w.emp_code} className="border-b border-gray-50 hover:bg-gray-50">
                              <td className="px-4 py-2 text-xs text-gray-400 font-mono">{w.emp_code}</td>
                              <td className="px-4 py-2 text-xs font-medium text-gray-900">{w.name}</td>
                              <td className="px-4 py-2 text-xs text-center text-emerald-700 font-medium">{fmtTime(w.first_in)}</td>
                              <td className="px-4 py-2 text-xs text-center text-red-600 font-medium">{fmtTime(w.last_out)}</td>
                              <td className="px-4 py-2 text-xs text-right font-mono text-gray-700">{w.hours != null ? w.hours : '—'}</td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )
              })}
            </div>
          )}

          {/* Movement Log (daily view) */}
          {movements.length > 0 && (
            <div className="mt-6">
              <h3 className="text-sm font-bold text-gray-900 mb-3">Movements</h3>
              <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200">
                      <th className="text-left px-4 py-2 text-[10px] font-bold text-gray-500 uppercase tracking-wider">Worker</th>
                      <th className="text-left px-4 py-2 text-[10px] font-bold text-gray-500 uppercase tracking-wider">From</th>
                      <th className="text-left px-4 py-2 text-[10px] font-bold text-gray-500 uppercase tracking-wider">To</th>
                      <th className="text-center px-4 py-2 text-[10px] font-bold text-gray-500 uppercase tracking-wider">Departed</th>
                      <th className="text-center px-4 py-2 text-[10px] font-bold text-gray-500 uppercase tracking-wider">Arrived</th>
                      <th className="text-center px-4 py-2 text-[10px] font-bold text-gray-500 uppercase tracking-wider">Transit</th>
                      <th className="text-center px-4 py-2 text-[10px] font-bold text-gray-500 uppercase tracking-wider">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {movements.map(function (m) {
                      var statusColor = m.status === 'arrived' ? 'text-emerald-600 bg-emerald-50'
                        : m.status === 'in_transit' ? 'text-blue-600 bg-blue-50'
                        : 'text-gray-400 bg-gray-100'
                      return (
                        <tr key={m.movement_id} className="border-b border-gray-50 hover:bg-gray-50">
                          <td className="px-4 py-2">
                            <p className="text-xs font-medium text-gray-900">{m.name}</p>
                            <p className="text-[10px] text-gray-400">{m.emp_code}</p>
                          </td>
                          <td className="px-4 py-2 text-xs text-amber-600 font-medium">{m.from_venue}</td>
                          <td className="px-4 py-2 text-xs text-emerald-600 font-medium">{m.to_venue}</td>
                          <td className="px-4 py-2 text-xs text-center text-gray-600">{fmtTime(m.departed_at)}</td>
                          <td className="px-4 py-2 text-xs text-center text-gray-600">{fmtTime(m.arrived_at)}</td>
                          <td className="px-4 py-2 text-xs text-center text-gray-700 font-mono">
                            {m.transit_minutes != null ? m.transit_minutes + 'm' : '—'}
                          </td>
                          <td className="px-4 py-2 text-center">
                            <span className={'text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ' + statusColor}>
                              {m.status === 'in_transit' ? 'In Transit' : m.status}
                            </span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function fmtTime(iso) {
  if (!iso) return '—'
  var d = new Date(iso)
  var h = d.getHours(), m = d.getMinutes()
  var ampm = h >= 12 ? 'PM' : 'AM'
  h = h % 12 || 12
  return h + ':' + String(m).padStart(2, '0') + ' ' + ampm
}