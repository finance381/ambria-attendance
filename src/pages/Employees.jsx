import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import EmployeeImport from '../components/EmployeeImport'

var ROLES = ['staff', 'supervisor', 'manager', 'admin']

export default function Employees() {
  var [employees, setEmployees] = useState([])
  var [departments, setDepartments] = useState([])
  var [loading, setLoading] = useState(true)
  var [search, setSearch] = useState('')
  var [deptFilter, setDeptFilter] = useState('')
  var [showAdd, setShowAdd] = useState(false)
  var [editId, setEditId] = useState(null)
  var [resetId, setResetId] = useState(null)
  var [deactivateTarget, setDeactivateTarget] = useState(null)
  var [saving, setSaving] = useState(false)
  var [toast, setToast] = useState('')
  var [showImport, setShowImport] = useState(false)

  var [form, setForm] = useState({
    name: '', phone: '', department_id: '', role: 'staff', designation: '', date_of_joining: ''
  })
  var [formError, setFormError] = useState('')

  var [newPassword, setNewPassword] = useState('')
  var [resetError, setResetError] = useState('')

  var showToast = useCallback(function (msg) {
    setToast(msg)
    setTimeout(function () { setToast('') }, 2500)
  }, [])

  var loadAll = useCallback(async function () {
    var [empRes, deptRes] = await Promise.all([
      supabase.from('employees').select('*').eq('is_casual', false).order('created_at', { ascending: false }),
      supabase.from('departments').select('*').eq('active', true).order('name')
    ])
    setEmployees(empRes.data || [])
    setDepartments(deptRes.data || [])
    setLoading(false)
  }, [])

  useEffect(function () { loadAll() }, [loadAll])

  var filtered = employees.filter(function (e) {
    var matchSearch = !search ||
      e.name.toLowerCase().includes(search.toLowerCase()) ||
      e.emp_code.toLowerCase().includes(search.toLowerCase()) ||
      (e.phone && e.phone.includes(search))
    var matchDept = !deptFilter || String(e.department_id) === deptFilter
    return matchSearch && matchDept
  })

  var activeCount = employees.filter(function (e) { return e.active }).length
  var inactiveCount = employees.filter(function (e) { return !e.active }).length

  function deptName(id) {
    var d = departments.find(function (d) { return d.id === id })
    return d ? d.name : '—'
  }

  function resetForm() {
    setForm({ name: '', phone: '', department_id: '', role: 'staff', designation: '', date_of_joining: '' })
    setFormError('')
  }

  function openAdd() {
    resetForm()
    setEditId(null)
    setShowAdd(true)
  }

  function openEdit(emp) {
    setForm({
      name: emp.name,
      phone: emp.phone || '',
      department_id: emp.department_id ? String(emp.department_id) : '',
      role: emp.role,
      designation: emp.designation || '',
      date_of_joining: emp.date_of_joining || ''
    })
    setFormError('')
    setEditId(emp.id)
    setShowAdd(true)
  }

  function closeForm() {
    setShowAdd(false)
    setEditId(null)
    resetForm()
  }

  async function handleCreate(e) {
    e.preventDefault()
    setFormError('')

    if (!form.name.trim()) return setFormError('Name is required')
    if (!form.phone || form.phone.replace(/[^0-9]/g, '').length !== 10) {
      return setFormError('Enter a valid 10-digit phone number')
    }
    if (!form.department_id) return setFormError('Select a department')

    var existing = employees.find(function (emp) {
      return emp.phone === form.phone && emp.id !== editId
    })
    if (existing) return setFormError('Phone number already registered to ' + existing.name)

    setSaving(true)

    var { data, error } = await supabase.functions.invoke('create-employee', {
      body: {
        name: form.name.trim(),
        phone: form.phone.replace(/[^0-9]/g, ''),
        department_id: Number(form.department_id),
        role: form.role,
        designation: form.designation.trim() || null,
        date_of_joining: form.date_of_joining || null
      }
    })

    setSaving(false)

    if (error || (data && data.error)) {
      setFormError((data && data.error) || error.message || 'Failed to create employee')
      return
    }

    showToast(form.name.trim() + ' created — initial password: ' + (data.initial_password || 'ambria123'))
    closeForm()
    loadAll()
  }

  async function handleUpdate(e) {
    e.preventDefault()
    setFormError('')

    if (!form.name.trim()) return setFormError('Name is required')
    if (!form.department_id) return setFormError('Select a department')

    setSaving(true)

    var updates = {
      name: form.name.trim(),
      department_id: Number(form.department_id),
      role: form.role,
      designation: form.designation.trim() || null,
      date_of_joining: form.date_of_joining || null
    }

    var { error } = await supabase
      .from('employees')
      .update(updates)
      .eq('id', editId)

    setSaving(false)

    if (error) {
      setFormError(error.message)
      return
    }

    showToast(form.name.trim() + ' updated')
    closeForm()
    loadAll()
  }

  async function handleDeactivate() {
    if (!deactivateTarget) return
    setSaving(true)

    await supabase
      .from('employees')
      .update({ active: false })
      .eq('id', deactivateTarget.id)

    setSaving(false)
    showToast(deactivateTarget.name + ' deactivated')
    setDeactivateTarget(null)
    loadAll()
  }

  async function handleReactivate(emp) {
    setSaving(true)
    await supabase.from('employees').update({ active: true }).eq('id', emp.id)
    setSaving(false)
    showToast(emp.name + ' reactivated')
    loadAll()
  }

  async function handleResetPassword(e) {
    e.preventDefault()
    setResetError('')

    if (newPassword.length < 6) {
      setResetError('Password must be at least 6 characters')
      return
    }

    function exportCSV() {
    var headers = ['Employee Code', 'Name', 'Phone', 'Department', 'Role', 'Designation', 'Date of Joining', 'Status']
    var csvRows = [headers.join(',')]

    employees.forEach(function (emp) {
      csvRows.push([
        emp.emp_code,
        '"' + (emp.name || '').replace(/"/g, '""') + '"',
        emp.phone || '',
        '"' + deptName(emp.department_id) + '"',
        emp.role,
        '"' + (emp.designation || '').replace(/"/g, '""') + '"',
        emp.date_of_joining || '',
        emp.active ? 'Active' : 'Inactive'
      ].join(','))
    })

    var blob = new Blob([csvRows.join('\n')], { type: 'text/csv' })
    var a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'ambria_employees_' + new Date().toISOString().slice(0, 10) + '.csv'
    a.click()
    showToast('CSV exported')
  }

    setSaving(true)

    var { data, error } = await supabase.functions.invoke('reset-password', {
      body: { employee_id: resetId, new_password: newPassword }
    })

    setSaving(false)

    if (error || (data && data.error)) {
      setResetError((data && data.error) || error.message || 'Failed to reset password')
      return
    }

    showToast('Password reset successfully')
    setResetId(null)
    setNewPassword('')
  }

  if (loading) {
    return <p className="text-sm text-gray-400 text-center py-12">Loading…</p>
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-bold text-gray-900">Employees</h2>
          <p className="text-xs text-gray-500">
            {activeCount} active · {inactiveCount} inactive
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={exportCSV}
            className="px-3 py-2 text-sm text-gray-600 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors font-medium"
          >
            ⬇ Export
          </button>
          <button
            onClick={function () { setShowImport(true) }}
            className="px-3 py-2 text-sm text-gray-600 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors font-medium"
          >
            ⬆ Import CSV
          </button>
          <button
            onClick={openAdd}
            className="px-4 py-2 text-sm text-white bg-slate-800 rounded-lg hover:bg-slate-900 transition-colors font-medium"
          >
            + Add Employee
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-3 mb-4">
        <input
          type="text"
          value={search}
          onChange={function (e) { setSearch(e.target.value) }}
          placeholder="Search name, code, phone…"
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm min-w-[200px] focus:outline-none focus:ring-2 focus:ring-slate-700"
        />
        <select
          value={deptFilter}
          onChange={function (e) { setDeptFilter(e.target.value) }}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-700"
        >
          <option value="">All Departments</option>
          {departments.map(function (d) {
            return <option key={d.id} value={d.id}>{d.name}</option>
          })}
        </select>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl overflow-x-auto shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="text-left px-4 py-3 text-[10px] font-bold text-gray-500 uppercase tracking-wider">Code</th>
              <th className="text-left px-4 py-3 text-[10px] font-bold text-gray-500 uppercase tracking-wider">Name</th>
              <th className="text-left px-4 py-3 text-[10px] font-bold text-gray-500 uppercase tracking-wider">Phone</th>
              <th className="text-left px-4 py-3 text-[10px] font-bold text-gray-500 uppercase tracking-wider">Department</th>
              <th className="text-left px-4 py-3 text-[10px] font-bold text-gray-500 uppercase tracking-wider">Role</th>
              <th className="text-left px-4 py-3 text-[10px] font-bold text-gray-500 uppercase tracking-wider">Status</th>
              <th className="px-4 py-3 text-[10px] font-bold text-gray-500 uppercase tracking-wider text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="text-center py-8 text-sm text-gray-400 italic">
                  {employees.length ? 'No matching employees' : 'No employees yet — add one above'}
                </td>
              </tr>
            ) : filtered.map(function (emp) {
              return (
                <tr key={emp.id} className={'border-b border-gray-100 hover:bg-gray-50' + (!emp.active ? ' opacity-50' : '')}>
                  <td className="px-4 py-2.5 text-xs text-gray-400 font-mono">{emp.emp_code}</td>
                  <td className="px-4 py-2.5 font-medium text-gray-900">
                    {emp.name}
                    {emp.designation && (
                      <span className="block text-[11px] text-gray-400 font-normal">{emp.designation}</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-gray-500">{emp.phone || '—'}</td>
                  <td className="px-4 py-2.5 text-xs text-gray-600">{deptName(emp.department_id)}</td>
                  <td className="px-4 py-2.5">
                    <span className={'text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ' + roleColor(emp.role)}>
                      {emp.role}
                    </span>
                  </td>
                  <td className="px-4 py-2.5">
                    {emp.active ? (
                      <span className="text-[10px] font-bold uppercase text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">Active</span>
                    ) : (
                      <span className="text-[10px] font-bold uppercase text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">Inactive</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={function () { openEdit(emp) }} className="px-2 py-1 text-xs text-slate-600 hover:bg-slate-100 rounded transition-colors">Edit</button>
                      <button onClick={function () { setResetId(emp.id); setNewPassword(''); setResetError('') }} className="px-2 py-1 text-xs text-amber-600 hover:bg-amber-50 rounded transition-colors">Reset PW</button>
                      {emp.active ? (
                        <button onClick={function () { setDeactivateTarget(emp) }} className="px-2 py-1 text-xs text-red-600 hover:bg-red-50 rounded transition-colors">Deactivate</button>
                      ) : (
                        <button onClick={function () { handleReactivate(emp) }} className="px-2 py-1 text-xs text-emerald-600 hover:bg-emerald-50 rounded transition-colors">Reactivate</button>
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* ADD / EDIT MODAL */}
      {showAdd && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={closeForm}>
          <div className="bg-white rounded-xl w-full max-w-md shadow-xl" onClick={function (e) { e.stopPropagation() }}>
            <div className="px-5 py-4 border-b border-gray-100">
              <h3 className="text-sm font-bold text-gray-900">{editId ? 'Edit Employee' : 'Add Employee'}</h3>
            </div>
            <form onSubmit={editId ? handleUpdate : handleCreate} className="px-5 py-4 space-y-3">
              <Field label="Full Name *">
                <input type="text" value={form.name} onChange={function (e) { setForm({ ...form, name: e.target.value }) }} className="form-input" autoFocus />
              </Field>

              {!editId && (
                <Field label="Phone Number *">
                  <div className="flex">
                    <span className="inline-flex items-center px-2.5 bg-gray-50 border border-r-0 border-gray-300 rounded-l-lg text-xs text-gray-500">+91</span>
                    <input type="tel" inputMode="numeric" maxLength={10} value={form.phone}
                      onChange={function (e) { setForm({ ...form, phone: e.target.value.replace(/[^0-9]/g, '') }) }}
                      className="form-input rounded-l-none flex-1" placeholder="9876543210" />
                  </div>
                </Field>
              )}

              <Field label="Department *">
                <select value={form.department_id} onChange={function (e) { setForm({ ...form, department_id: e.target.value }) }} className="form-input">
                  <option value="">— Select —</option>
                  {departments.map(function (d) { return <option key={d.id} value={d.id}>{d.name}</option> })}
                </select>
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Role">
                  <select value={form.role} onChange={function (e) { setForm({ ...form, role: e.target.value }) }} className="form-input">
                    {ROLES.map(function (r) { return <option key={r} value={r}>{r}</option> })}
                  </select>
                </Field>
                <Field label="Designation">
                  <input type="text" value={form.designation} onChange={function (e) { setForm({ ...form, designation: e.target.value }) }} className="form-input" placeholder="e.g. Chef de Partie" />
                </Field>
              </div>

              <Field label="Date of Joining">
                <input type="date" value={form.date_of_joining} onChange={function (e) { setForm({ ...form, date_of_joining: e.target.value }) }} className="form-input" />
              </Field>

              {formError && (
                <div className="px-3 py-2 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-xs text-red-600">{formError}</p>
                </div>
              )}

              {!editId && (
                <p className="text-[11px] text-gray-400">
                  Initial password will be set to <strong>ambria123</strong> — employee should change it on first login.
                </p>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={closeForm} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">Cancel</button>
                <button type="submit" disabled={saving} className="px-4 py-2 text-sm text-white bg-slate-800 rounded-lg hover:bg-slate-900 disabled:opacity-40 transition-colors font-medium">
                  {saving ? 'Saving…' : editId ? 'Update' : 'Create Employee'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* RESET PASSWORD MODAL */}
      {resetId && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={function () { setResetId(null) }}>
          <div className="bg-white rounded-xl w-full max-w-sm shadow-xl" onClick={function (e) { e.stopPropagation() }}>
            <div className="px-5 py-4 border-b border-gray-100">
              <h3 className="text-sm font-bold text-gray-900">Reset Password</h3>
            </div>
            <form onSubmit={handleResetPassword} className="px-5 py-4 space-y-3">
              <Field label="New Password">
                <input type="text" value={newPassword} onChange={function (e) { setNewPassword(e.target.value) }} className="form-input" placeholder="Min 6 characters" autoFocus />
              </Field>

              {resetError && (
                <div className="px-3 py-2 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-xs text-red-600">{resetError}</p>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={function () { setResetId(null) }} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">Cancel</button>
                <button type="submit" disabled={saving} className="px-4 py-2 text-sm text-white bg-amber-600 rounded-lg hover:bg-amber-700 disabled:opacity-40 transition-colors font-medium">
                  {saving ? 'Resetting…' : 'Reset Password'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DEACTIVATE CONFIRMATION */}
      {deactivateTarget && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={function () { setDeactivateTarget(null) }}>
          <div className="bg-white rounded-xl w-full max-w-sm shadow-xl p-5" onClick={function (e) { e.stopPropagation() }}>
            <h3 className="text-sm font-bold text-gray-900 mb-2">Deactivate Employee</h3>
            <p className="text-sm text-gray-600 mb-4">
              Are you sure you want to deactivate <strong>{deactivateTarget.name}</strong>? They will not be able to log in or punch attendance.
            </p>
            <div className="flex justify-end gap-2">
              <button onClick={function () { setDeactivateTarget(null) }} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">Cancel</button>
              <button onClick={handleDeactivate} disabled={saving} className="px-4 py-2 text-sm text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-40 transition-colors font-medium">
                {saving ? 'Deactivating…' : 'Deactivate'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showImport && (
        <EmployeeImport
          departments={departments}
          onClose={function () { setShowImport(false) }}
          onDone={function () { setShowImport(false); loadAll() }}
        />
      )}

      {toast && (
        <div className="fixed bottom-6 right-6 bg-slate-800 text-white px-5 py-3 rounded-xl text-sm shadow-lg z-50">
          {toast}
        </div>
      )}

      <style>{`
        .form-input {
          width: 100%;
          padding: 0.5rem 0.75rem;
          border: 1px solid #d1d5db;
          border-radius: 0.5rem;
          font-size: 0.875rem;
          outline: none;
        }
        .form-input:focus {
          box-shadow: 0 0 0 2px rgba(30,41,59,0.3);
          border-color: transparent;
        }
      `}</style>
    </div>
  )
}

function Field({ label, children }) {
  return (
    <div>
      <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1">{label}</label>
      {children}
    </div>
  )
}

function roleColor(role) {
  if (role === 'admin') return 'bg-purple-50 text-purple-700'
  if (role === 'manager') return 'bg-blue-50 text-blue-700'
  if (role === 'supervisor') return 'bg-amber-50 text-amber-700'
  return 'bg-gray-100 text-gray-600'
}