import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'

export default function Departments() {
  var [departments, setDepartments] = useState([])
  var [employeeCounts, setEmployeeCounts] = useState({})
  var [loading, setLoading] = useState(true)
  var [newName, setNewName] = useState('')
  var [saving, setSaving] = useState(false)
  var [error, setError] = useState('')
  var [toast, setToast] = useState('')
  var [deleteTarget, setDeleteTarget] = useState(null)
  var [permDelete, setPermDelete] = useState(null)

  var showToast = useCallback(function (msg) {
    setToast(msg)
    setTimeout(function () { setToast('') }, 2500)
  }, [])

  var loadAll = useCallback(async function () {
    var [deptRes, empRes] = await Promise.all([
      supabase.from('departments').select('*').order('id'),
      supabase.from('employees').select('department_id').eq('active', true)
    ])

    setDepartments(deptRes.data || [])

    var counts = {}
    ;(empRes.data || []).forEach(function (e) {
      if (e.department_id) {
        counts[e.department_id] = (counts[e.department_id] || 0) + 1
      }
    })
    setEmployeeCounts(counts)
    setLoading(false)
  }, [])

  useEffect(function () { loadAll() }, [loadAll])

  async function handleAdd(e) {
    e.preventDefault()
    setError('')

    var name = newName.trim()
    if (!name) return setError('Enter a department name')

    var exists = departments.find(function (d) {
      return d.name.toLowerCase() === name.toLowerCase()
    })
    if (exists) return setError('Department already exists')

    setSaving(true)

    var { error: insertError } = await supabase
      .from('departments')
      .insert({ name: name, is_default: false, active: true })

    setSaving(false)

    if (insertError) {
      setError(insertError.message)
      return
    }

    setNewName('')
    showToast(name + ' added')
    loadAll()
  }

  async function handleDeactivate() {
    if (!deleteTarget) return
    setSaving(true)

    await supabase
      .from('departments')
      .update({ active: false })
      .eq('id', deleteTarget.id)

    setSaving(false)
    showToast(deleteTarget.name + ' deactivated')
    setDeleteTarget(null)
    loadAll()
  }

  async function handleReactivate(dept) {
    setSaving(true)
    await supabase.from('departments').update({ active: true }).eq('id', dept.id)
    setSaving(false)
    showToast(dept.name + ' reactivated')
    loadAll()
  }

  if (loading) {
    return <p className="text-sm text-gray-400 text-center py-12">Loading…</p>
  }

  var activeDepts = departments.filter(function (d) { return d.active })
  var inactiveDepts = departments.filter(function (d) { return !d.active })

  return (
    <div>
      <h2 className="text-lg font-bold text-gray-900 mb-1">Departments</h2>
      <p className="text-xs text-gray-500 mb-5">
        {activeDepts.length} active · {inactiveDepts.length} inactive
      </p>

      <div className="bg-white border border-gray-200 rounded-xl p-4 mb-5 shadow-sm">
        <form onSubmit={handleAdd} className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[200px]">
            <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1">
              New Department
            </label>
            <input
              type="text"
              value={newName}
              onChange={function (e) { setNewName(e.target.value) }}
              placeholder="e.g. Event Operations"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-700"
            />
          </div>
          <button
            type="submit"
            disabled={saving}
            className="px-4 py-2 text-sm text-white bg-slate-800 rounded-lg hover:bg-slate-900 disabled:opacity-40 transition-colors font-medium"
          >
            + Add
          </button>
        </form>
        {error && (
          <p className="text-xs text-red-600 mt-2">{error}</p>
        )}
      </div>

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="text-left px-4 py-3 text-[10px] font-bold text-gray-500 uppercase tracking-wider w-10">#</th>
              <th className="text-left px-4 py-3 text-[10px] font-bold text-gray-500 uppercase tracking-wider">Department</th>
              <th className="text-left px-4 py-3 text-[10px] font-bold text-gray-500 uppercase tracking-wider">Employees</th>
              <th className="text-left px-4 py-3 text-[10px] font-bold text-gray-500 uppercase tracking-wider">Type</th>
              <th className="text-left px-4 py-3 text-[10px] font-bold text-gray-500 uppercase tracking-wider">Status</th>
              <th className="px-4 py-3 text-[10px] font-bold text-gray-500 uppercase tracking-wider text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {departments.map(function (dept, i) {
              var count = employeeCounts[dept.id] || 0
              return (
                <tr key={dept.id} className={'border-b border-gray-100 hover:bg-gray-50' + (!dept.active ? ' opacity-50' : '')}>
                  <td className="px-4 py-2.5 text-xs text-gray-400">{String(i + 1).padStart(2, '0')}</td>
                  <td className="px-4 py-2.5 font-medium text-gray-900">{dept.name}</td>
                  <td className="px-4 py-2.5">
                    <span className="text-xs text-gray-500">
                      {count} {count === 1 ? 'employee' : 'employees'}
                    </span>
                  </td>
                  <td className="px-4 py-2.5">
                    {dept.is_default ? (
                      <span className="text-[10px] font-bold uppercase text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">Default</span>
                    ) : (
                      <span className="text-[10px] font-bold uppercase text-gray-400 bg-gray-50 px-2 py-0.5 rounded-full">Custom</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    {dept.active ? (
                      <span className="text-[10px] font-bold uppercase text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">Active</span>
                    ) : (
                      <span className="text-[10px] font-bold uppercase text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">Inactive</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <div className="flex items-center justify-end gap-1">
                      {dept.active ? (
                        <button
                          onClick={function () {
                            if (count > 0) {
                              showToast('Reassign ' + count + ' employees first')
                              return
                            }
                            setDeleteTarget(dept)
                          }}
                          className="px-2 py-1 text-xs text-red-600 hover:bg-red-50 rounded transition-colors"
                        >
                          Deactivate
                        </button>
                      ) : (
                        <button
                          onClick={function () { handleReactivate(dept) }}
                          className="px-2 py-1 text-xs text-emerald-600 hover:bg-emerald-50 rounded transition-colors"
                        >
                          Reactivate
                        </button>
                      )}
                      <button
                        onClick={function () {
                          if (count > 0) {
                            showToast('Reassign ' + count + ' employees first')
                            return
                          }
                          setPermDelete(dept)
                        }}
                        className="px-2 py-1 text-xs text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {deleteTarget && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={function () { setDeleteTarget(null) }}>
          <div className="bg-white rounded-xl w-full max-w-sm shadow-xl p-5" onClick={function (e) { e.stopPropagation() }}>
            <h3 className="text-sm font-bold text-gray-900 mb-2">Deactivate Department</h3>
            <p className="text-sm text-gray-600 mb-4">
              Are you sure you want to deactivate <strong>{deleteTarget.name}</strong>?
            </p>
            <div className="flex justify-end gap-2">
              <button onClick={function () { setDeleteTarget(null) }} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">Cancel</button>
              <button onClick={handleDeactivate} disabled={saving} className="px-4 py-2 text-sm text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-40 transition-colors font-medium">
                {saving ? 'Deactivating…' : 'Deactivate'}
              </button>
            </div>
          </div>
        </div>
      )}
      {permDelete && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={function () { setPermDelete(null) }}>
          <div className="bg-white rounded-xl w-full max-w-sm shadow-xl p-5" onClick={function (e) { e.stopPropagation() }}>
            <h3 className="text-sm font-bold text-red-600 mb-2">Permanently Delete Department</h3>
            <p className="text-sm text-gray-600 mb-4">
              Delete <strong>{permDelete.name}</strong> forever? This cannot be undone.
            </p>
            <div className="flex justify-end gap-2">
              <button onClick={function () { setPermDelete(null) }} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">Cancel</button>
              <button onClick={async function () {
                setSaving(true)
                var { error: delErr } = await supabase.from('departments').delete().eq('id', permDelete.id)
                setSaving(false)
                if (delErr) {
                  showToast('Delete failed: ' + delErr.message)
                } else {
                  showToast(permDelete.name + ' deleted permanently')
                }
                setPermDelete(null)
                loadAll()
              }} disabled={saving} className="px-4 py-2 text-sm text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-40 transition-colors font-medium">
                {saving ? 'Deleting…' : 'Delete Forever'}
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-6 right-6 bg-slate-800 text-white px-5 py-3 rounded-xl text-sm shadow-lg z-50">
          {toast}
        </div>
      )}
    </div>
  )
}