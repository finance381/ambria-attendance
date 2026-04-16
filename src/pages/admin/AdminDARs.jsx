import { useState, useEffect, useCallback } from 'react'
import { Navigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/useAuth'

function formatDate(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')
}

function formatDisplayDate(dateStr) {
  var d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

function formatTime12(t) {
  if (!t) return '—'
  var parts = t.split(':')
  var h = parseInt(parts[0], 10)
  var m = parts[1]
  var ampm = h >= 12 ? 'PM' : 'AM'
  h = h % 12 || 12
  return h + ':' + m + ' ' + ampm
}

function formatBullets(text) {
  return text.split('\n').filter(function (l) { return l.trim() }).map(function (l) {
    var line = l.trim()
    if (line.startsWith('•') || line.startsWith('-') || line.startsWith('*')) {
      return '• ' + line.slice(1).trim()
    }
    return '• ' + line
  })
}

export default function AdminDARs() {
  var { employee } = useAuth()

  var today = formatDate(new Date())
  var [dateFrom, setDateFrom] = useState(today)
  var [dateTo, setDateTo] = useState(today)
  var [empFilter, setEmpFilter] = useState('')
  var [employees, setEmployees] = useState([])
  var [dars, setDars] = useState([])
  var [loading, setLoading] = useState(true)
  var [expandedId, setExpandedId] = useState(null)

  var loadEmployees = useCallback(async function () {
    var { data } = await supabase
      .from('employees')
      .select('emp_code, name')
      .eq('active', true)
      .order('name')
    setEmployees(data || [])
  }, [])

  var loadDARs = useCallback(async function () {
    setLoading(true)

    var query = supabase
      .from('daily_reports')
      .select('id, emp_code, report_date, punch_in, punch_out, punch_times_manual, tasks, submitted_at')
      .gte('report_date', dateFrom)
      .lte('report_date', dateTo)
      .order('report_date', { ascending: false })
      .order('emp_code')

    if (empFilter) {
      query = query.eq('emp_code', empFilter)
    }

    var { data } = await query
    setDars(data || [])
    setLoading(false)
  }, [dateFrom, dateTo, empFilter])

  useEffect(function () { loadEmployees() }, [loadEmployees])
  useEffect(function () { loadDARs() }, [loadDARs])

  if (employee.emp_code !== 'AMB001') {
    return <Navigate to="/admin" replace />
  }

  function getEmpName(empCode) {
    var emp = employees.find(function (e) { return e.emp_code === empCode })
    return emp ? emp.name : empCode
  }

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-bold text-slate-800">Daily Activity Reports</h2>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-end">
        <div>
          <label className="text-xs font-medium text-slate-500 block mb-1">From</label>
          <input type="date" value={dateFrom} onChange={function (e) { setDateFrom(e.target.value) }}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="text-xs font-medium text-slate-500 block mb-1">To</label>
          <input type="date" value={dateTo} onChange={function (e) { setDateTo(e.target.value) }}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="text-xs font-medium text-slate-500 block mb-1">Employee</label>
          <select value={empFilter} onChange={function (e) { setEmpFilter(e.target.value) }}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm">
            <option value="">All Employees</option>
            {employees.map(function (emp) {
              return <option key={emp.emp_code} value={emp.emp_code}>{emp.name}</option>
            })}
          </select>
        </div>
      </div>

      {/* Stats */}
      <div className="flex gap-4 text-sm">
        <span className="text-slate-500">{dars.length} DAR{dars.length !== 1 ? 's' : ''} found</span>
      </div>

      {/* Table */}
      {loading ? (
        <div className="text-center py-8">
          <div className="w-6 h-6 border-2 border-slate-700 border-t-transparent rounded-full animate-spin mx-auto" />
        </div>
      ) : dars.length === 0 ? (
        <div className="text-center py-8 text-sm text-gray-400">No DARs found for selected filters</div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-600">Date</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-600">Employee</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-600">In</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-600">Out</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-600">Tasks</th>
              </tr>
            </thead>
            <tbody>
              {dars.map(function (dar) {
                var isExpanded = expandedId === dar.id
                var bullets = formatBullets(dar.tasks)
                return (
                  <tr key={dar.id}
                    onClick={function () { setExpandedId(isExpanded ? null : dar.id) }}
                    className={'border-b border-gray-100 cursor-pointer hover:bg-gray-50 transition-colors ' +
                      (isExpanded ? 'bg-slate-50' : '')}>
                    <td className="px-4 py-3 whitespace-nowrap">{formatDisplayDate(dar.report_date)}</td>
                    <td className="px-4 py-3">
                      <div className="font-medium">{getEmpName(dar.emp_code)}</div>
                      <div className="text-[10px] text-gray-400">{dar.emp_code}</div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {formatTime12(dar.punch_in)}
                      {dar.punch_times_manual && <span className="text-[10px] text-amber-500 ml-1">M</span>}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {formatTime12(dar.punch_out)}
                    </td>
                    <td className="px-4 py-3">
                      {isExpanded ? (
                        <div className="space-y-0.5">
                          {bullets.map(function (b, i) {
                            return <div key={i} className="text-slate-700">{b}</div>
                          })}
                        </div>
                      ) : (
                        <div className="text-slate-500 truncate max-w-xs">{bullets[0]} {bullets.length > 1 ? '(+' + (bullets.length - 1) + ' more)' : ''}</div>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
