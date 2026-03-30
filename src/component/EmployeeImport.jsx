import { useState } from 'react'
import { supabase } from '../lib/supabase'

var TEMPLATE_HEADERS = ['Name', 'Phone', 'Department', 'Role', 'Designation', 'Date of Joining']
var VALID_ROLES = ['staff', 'supervisor', 'manager', 'admin']

export default function EmployeeImport({ departments, onClose, onDone }) {
  var [file, setFile] = useState(null)
  var [rows, setRows] = useState([])
  var [errors, setErrors] = useState([])
  var [importing, setImporting] = useState(false)
  var [progress, setProgress] = useState({ done: 0, total: 0, failed: [] })
  var [step, setStep] = useState('upload')  // upload | preview | importing | done

  var deptMap = {}
  departments.forEach(function (d) {
    deptMap[d.name.toLowerCase().trim()] = d.id
  })

  function downloadTemplate() {
    var csv = TEMPLATE_HEADERS.join(',') + '\n'
    csv += 'Raju Kumar,9876543210,Kitchen Production,staff,Chef de Partie,2025-01-15\n'
    csv += 'Amit Singh,9123456789,Security,supervisor,Head Guard,\n'

    var blob = new Blob([csv], { type: 'text/csv' })
    var a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'ambria_employee_template.csv'
    a.click()
  }

  function handleFile(e) {
    var f = e.target.files[0]
    if (!f) return
    setFile(f)

    var reader = new FileReader()
    reader.onload = function (ev) {
      parseCSV(ev.target.result)
    }
    reader.readAsText(f)
  }

  function parseCSV(text) {
    var lines = text.split('\n').map(function (l) { return l.trim() }).filter(Boolean)

    if (lines.length < 2) {
      setErrors([{ row: 0, msg: 'File is empty or has no data rows' }])
      return
    }

    // Skip header row
    var header = lines[0].toLowerCase()
    var startIdx = header.includes('name') ? 1 : 0

    var parsed = []
    var errs = []

    for (var i = startIdx; i < lines.length; i++) {
      var cols = parseCSVLine(lines[i])
      var rowNum = i + 1

      var name = (cols[0] || '').trim()
      var phone = (cols[1] || '').replace(/[^0-9]/g, '')
      var dept = (cols[2] || '').trim()
      var role = (cols[3] || '').trim().toLowerCase()
      var designation = (cols[4] || '').trim()
      var doj = (cols[5] || '').trim()

      // Validate
      if (!name) { errs.push({ row: rowNum, msg: 'Name is empty' }); continue }
      if (phone.length !== 10) { errs.push({ row: rowNum, msg: name + ' — phone must be 10 digits, got "' + (cols[1] || '') + '"' }); continue }
      if (!dept) { errs.push({ row: rowNum, msg: name + ' — department is empty' }); continue }

      var deptId = deptMap[dept.toLowerCase()]
      if (!deptId) {
        errs.push({ row: rowNum, msg: name + ' — department "' + dept + '" not found. Check spelling.' })
        continue
      }

      if (!role) role = 'staff'
      if (!VALID_ROLES.includes(role)) {
        errs.push({ row: rowNum, msg: name + ' — invalid role "' + role + '". Use: staff, supervisor, manager, admin' })
        continue
      }

      if (doj && !/^\d{4}-\d{2}-\d{2}$/.test(doj)) {
        errs.push({ row: rowNum, msg: name + ' — date format must be YYYY-MM-DD, got "' + doj + '"' })
        continue
      }

      parsed.push({
        name: name,
        phone: phone,
        department_id: deptId,
        department_name: dept,
        role: role,
        designation: designation || null,
        date_of_joining: doj || null
      })
    }

    setRows(parsed)
    setErrors(errs)
    setStep('preview')
  }

  function parseCSVLine(line) {
    var result = []
    var current = ''
    var inQuotes = false

    for (var i = 0; i < line.length; i++) {
      var ch = line[i]
      if (ch === '"') {
        inQuotes = !inQuotes
      } else if (ch === ',' && !inQuotes) {
        result.push(current)
        current = ''
      } else {
        current += ch
      }
    }
    result.push(current)
    return result
  }

  async function handleImport() {
    setImporting(true)
    setStep('importing')
    var failed = []

    for (var i = 0; i < rows.length; i++) {
      setProgress({ done: i, total: rows.length, failed: failed })

      var row = rows[i]
      var { data, error } = await supabase.functions.invoke('create-employee', {
        body: {
          name: row.name,
          phone: row.phone,
          department_id: row.department_id,
          role: row.role,
          designation: row.designation,
          date_of_joining: row.date_of_joining
        }
      })

      if (error || (data && data.error)) {
        failed.push({
          name: row.name,
          msg: (data && data.error) || error.message || 'Unknown error'
        })
      }
    }

    setProgress({ done: rows.length, total: rows.length, failed: failed })
    setImporting(false)
    setStep('done')
  }

  // ── UPLOAD STEP ─────────────────────────────────────────────────────

  if (step === 'upload') {
    return (
      <Modal onClose={onClose} title="Import Employees">
        <div className="space-y-4">
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
            <p className="text-sm font-medium text-gray-800 mb-2">Step 1: Download the template</p>
            <p className="text-xs text-gray-500 mb-3">
              Fill in employee details using the exact department names from your system.
              Role must be one of: staff, supervisor, manager, admin.
            </p>
            <button
              onClick={downloadTemplate}
              className="px-4 py-2 text-sm text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors font-medium"
            >
              ⬇ Download Template CSV
            </button>
          </div>

          <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
            <p className="text-sm font-medium text-gray-800 mb-2">Step 2: Upload filled CSV</p>
            <input
              type="file"
              accept=".csv"
              onChange={handleFile}
              className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-slate-800 file:text-white hover:file:bg-slate-900 file:cursor-pointer"
            />
          </div>

          <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
            <p className="text-xs text-amber-700">
              <strong>Note:</strong> Each employee gets login credentials (phone + password "ambria123"). They should change their password on first login.
            </p>
          </div>
        </div>
      </Modal>
    )
  }

  // ── PREVIEW STEP ────────────────────────────────────────────────────

  if (step === 'preview') {
    return (
      <Modal onClose={onClose} title="Review Import" wide>
        {errors.length > 0 && (
          <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 mb-4">
            <p className="text-xs font-bold text-red-700 mb-1">{errors.length} row{errors.length > 1 ? 's' : ''} skipped due to errors:</p>
            <div className="max-h-32 overflow-y-auto">
              {errors.map(function (e, i) {
                return <p key={i} className="text-xs text-red-600">Row {e.row}: {e.msg}</p>
              })}
            </div>
          </div>
        )}

        {rows.length === 0 ? (
          <div className="text-center py-6">
            <p className="text-sm text-gray-500">No valid rows to import.</p>
            <button onClick={function () { setStep('upload'); setErrors([]) }}
              className="mt-3 px-4 py-2 text-sm text-slate-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors">
              Back
            </button>
          </div>
        ) : (
          <>
            <p className="text-xs text-gray-500 mb-3">
              {rows.length} employee{rows.length > 1 ? 's' : ''} ready to import:
            </p>
            <div className="max-h-64 overflow-y-auto border border-gray-200 rounded-lg">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="text-left px-3 py-2 font-bold text-gray-500 uppercase">Name</th>
                    <th className="text-left px-3 py-2 font-bold text-gray-500 uppercase">Phone</th>
                    <th className="text-left px-3 py-2 font-bold text-gray-500 uppercase">Department</th>
                    <th className="text-left px-3 py-2 font-bold text-gray-500 uppercase">Role</th>
                    <th className="text-left px-3 py-2 font-bold text-gray-500 uppercase">Designation</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(function (r, i) {
                    return (
                      <tr key={i} className="border-b border-gray-100">
                        <td className="px-3 py-2 font-medium text-gray-800">{r.name}</td>
                        <td className="px-3 py-2 text-gray-500">{r.phone}</td>
                        <td className="px-3 py-2 text-gray-500">{r.department_name}</td>
                        <td className="px-3 py-2">
                          <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-gray-100">{r.role}</span>
                        </td>
                        <td className="px-3 py-2 text-gray-400">{r.designation || '—'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            <div className="flex justify-end gap-2 mt-4">
              <button onClick={function () { setStep('upload'); setRows([]); setErrors([]) }}
                className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
                Back
              </button>
              <button onClick={handleImport}
                className="px-4 py-2 text-sm text-white bg-slate-800 rounded-lg hover:bg-slate-900 transition-colors font-medium">
                Import {rows.length} Employee{rows.length > 1 ? 's' : ''}
              </button>
            </div>
          </>
        )}
      </Modal>
    )
  }

  // ── IMPORTING STEP ──────────────────────────────────────────────────

  if (step === 'importing') {
    var pct = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0

    return (
      <Modal title="Importing…">
        <div className="text-center py-4">
          <div className="w-full bg-gray-200 rounded-full h-3 mb-3">
            <div className="bg-slate-800 h-3 rounded-full transition-all" style={{ width: pct + '%' }} />
          </div>
          <p className="text-sm text-gray-600">
            {progress.done} of {progress.total} employees processed…
          </p>
          {progress.failed.length > 0 && (
            <p className="text-xs text-red-500 mt-1">{progress.failed.length} failed so far</p>
          )}
        </div>
      </Modal>
    )
  }

  // ── DONE STEP ───────────────────────────────────────────────────────

  if (step === 'done') {
    var succeeded = progress.total - progress.failed.length

    return (
      <Modal onClose={function () { onDone() }} title="Import Complete">
        <div className="text-center py-2">
          <div className="w-14 h-14 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-3">
            <span className="text-2xl">✓</span>
          </div>
          <p className="text-sm font-semibold text-gray-800 mb-1">
            {succeeded} employee{succeeded !== 1 ? 's' : ''} imported successfully
          </p>
          {progress.failed.length > 0 && (
            <div className="mt-3 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-left">
              <p className="text-xs font-bold text-red-700 mb-1">{progress.failed.length} failed:</p>
              <div className="max-h-32 overflow-y-auto">
                {progress.failed.map(function (f, i) {
                  return <p key={i} className="text-xs text-red-600">{f.name}: {f.msg}</p>
                })}
              </div>
            </div>
          )}
          <button onClick={function () { onDone() }}
            className="mt-4 px-4 py-2 text-sm text-white bg-slate-800 rounded-lg hover:bg-slate-900 transition-colors font-medium">
            Done
          </button>
        </div>
      </Modal>
    )
  }

  return null
}

function Modal({ children, onClose, title, wide }) {
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
      onClick={onClose ? onClose : undefined}>
      <div className={'bg-white rounded-xl shadow-xl ' + (wide ? 'w-full max-w-2xl' : 'w-full max-w-md')}
        onClick={function (e) { e.stopPropagation() }}>
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h3 className="text-sm font-bold text-gray-900">{title}</h3>
          {onClose && (
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg leading-none">✕</button>
          )}
        </div>
        <div className="px-5 py-4">
          {children}
        </div>
      </div>
    </div>
  )
}