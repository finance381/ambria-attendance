// TrainingDocs.jsx
// Config → "Company Training Docs" tab. Admin uploads PDF/Word training docs
// targeted at a department + role (either can be "All"), lists them, opens
// them via signed URLs and deletes them. The list can be narrowed by
// department (which also keeps the All-Departments docs, since that
// department sees them too) and by a title search. Table + bucket: see migration
// 20261007060000_training_docs.sql.

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/useAuth'

var BUCKET = 'training-docs'
var MAX_BYTES = 20 * 1024 * 1024
var ALLOWED_EXT = ['pdf', 'doc', 'docx']
var ROLES = [
  { value: 'staff', label: 'Staff' },
  { value: 'supervisor', label: 'Supervisor' },
  { value: 'manager', label: 'Manager' },
  { value: 'admin', label: 'Admin' }
]
var ALL = 'all'

var inputClass = 'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-700'
var labelClass = 'block text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1'

function fileExt(name) {
  var i = name.lastIndexOf('.')
  return i === -1 ? '' : name.slice(i + 1).toLowerCase()
}

function roleLabel(role) {
  var r = ROLES.find(function (x) { return x.value === role })
  return r ? r.label : 'All Roles'
}

export default function TrainingDocs() {
  var { employee } = useAuth()
  var [docs, setDocs] = useState([])
  var [departments, setDepartments] = useState([])
  var [loading, setLoading] = useState(true)
  var [loadError, setLoadError] = useState('')
  var [toast, setToast] = useState('')
  var [showAdd, setShowAdd] = useState(false)
  var [deleteTarget, setDeleteTarget] = useState(null)
  var [deleting, setDeleting] = useState(false)
  var [deptFilter, setDeptFilter] = useState(ALL)
  var [search, setSearch] = useState('')

  var showToast = useCallback(function (msg) {
    setToast(msg)
    setTimeout(function () { setToast('') }, 2500)
  }, [])

  var loadAll = useCallback(async function () {
    var [docRes, deptRes] = await Promise.all([
      supabase.from('training_docs').select('*').order('created_at', { ascending: false }),
      supabase.from('departments').select('id, name').eq('active', true).order('name')
    ])
    setLoadError(docRes.error ? docRes.error.message : '')
    setDocs(docRes.data || [])
    setDepartments(deptRes.data || [])
    setLoading(false)
  }, [])

  useEffect(function () { loadAll() }, [loadAll])

  function deptName(id) {
    if (id == null) return 'All Departments'
    var d = departments.find(function (x) { return x.id === id })
    return d ? d.name : 'Inactive dept'
  }

  async function handleOpen(doc) {
    var { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(doc.file_path, 60 * 5)
    if (error || !data) return showToast('Could not open file')
    window.open(data.signedUrl, '_blank', 'noopener')
  }

  async function handleDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    var { error } = await supabase.from('training_docs').delete().eq('id', deleteTarget.id)
    if (!error) await supabase.storage.from(BUCKET).remove([deleteTarget.file_path])
    setDeleting(false)
    if (error) return showToast(error.message)
    showToast(deleteTarget.title + ' deleted')
    setDeleteTarget(null)
    loadAll()
  }

  var query = search.trim().toLowerCase()
  var shownDocs = docs.filter(function (doc) {
    if (deptFilter !== ALL && doc.department_id != null && String(doc.department_id) !== deptFilter) return false
    if (query && doc.title.toLowerCase().indexOf(query) === -1 && doc.file_name.toLowerCase().indexOf(query) === -1) return false
    return true
  })
  var filtering = deptFilter !== ALL || query !== ''

  if (loading) {
    return <p className="text-sm text-gray-400 text-center py-12">Loading…</p>
  }

  return (
    <div>
      <div className="flex items-start justify-between gap-3 mb-5">
        <div>
          <h2 className="text-lg font-bold text-gray-900 mb-1">Company Training Docs</h2>
          <p className="text-xs text-gray-500">
            {filtering ? shownDocs.length + ' of ' : ''}{docs.length} {docs.length === 1 ? 'document' : 'documents'}
          </p>
        </div>
        <button
          onClick={function () { setShowAdd(true) }}
          className="px-4 py-2 text-sm text-white bg-slate-800 rounded-lg hover:bg-slate-900 transition-colors font-medium"
        >
          + Add Doc
        </button>
      </div>

      {loadError && (
        <div className="px-3 py-2 mb-4 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-xs text-red-600">{loadError}</p>
        </div>
      )}

      {docs.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-4">
          <select value={deptFilter} onChange={function (e) { setDeptFilter(e.target.value) }}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-slate-700">
            <option value={ALL}>All departments</option>
            {departments.map(function (d) {
              return <option key={d.id} value={String(d.id)}>{d.name}</option>
            })}
          </select>
          <input type="text" value={search} onChange={function (e) { setSearch(e.target.value) }}
            placeholder="Search by title"
            className="flex-1 min-w-[180px] max-w-xs px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-700" />
          {filtering && (
            <button onClick={function () { setDeptFilter(ALL); setSearch('') }}
              className="px-3 py-2 text-xs text-gray-500 hover:text-gray-800">Clear</button>
          )}
        </div>
      )}

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
        {docs.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-10">No documents yet.</p>
        ) : shownDocs.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-10">No documents match this filter.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-4 py-3 text-[10px] font-bold text-gray-500 uppercase tracking-wider">Title</th>
                <th className="text-left px-4 py-3 text-[10px] font-bold text-gray-500 uppercase tracking-wider">Department</th>
                <th className="text-left px-4 py-3 text-[10px] font-bold text-gray-500 uppercase tracking-wider">Role</th>
                <th className="text-left px-4 py-3 text-[10px] font-bold text-gray-500 uppercase tracking-wider">Type</th>
                <th className="text-left px-4 py-3 text-[10px] font-bold text-gray-500 uppercase tracking-wider">Added</th>
                <th className="px-4 py-3 text-[10px] font-bold text-gray-500 uppercase tracking-wider text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {shownDocs.map(function (doc) {
                return (
                  <tr key={doc.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="px-4 py-2.5">
                      <p className="font-medium text-gray-900">{doc.title}</p>
                      <p className="text-[11px] text-gray-400">{doc.file_name}</p>
                    </td>
                    <td className="px-4 py-2.5 text-xs text-gray-600">{deptName(doc.department_id)}</td>
                    <td className="px-4 py-2.5 text-xs text-gray-600">{roleLabel(doc.role)}</td>
                    <td className="px-4 py-2.5">
                      <span className="text-[10px] font-bold uppercase text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">{doc.file_type}</span>
                    </td>
                    <td className="px-4 py-2.5 text-xs text-gray-500">{new Date(doc.created_at).toLocaleDateString('en-IN')}</td>
                    <td className="px-4 py-2.5 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={function () { handleOpen(doc) }}
                          className="px-2 py-1 text-xs text-slate-700 hover:bg-slate-100 rounded transition-colors">Open</button>
                        <button onClick={function () { setDeleteTarget(doc) }}
                          className="px-2 py-1 text-xs text-red-600 hover:bg-red-50 rounded transition-colors">Delete</button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {showAdd && (
        <AddDocModal
          departments={departments}
          employeeId={employee?.id}
          onClose={function () { setShowAdd(false) }}
          onSaved={function (title) {
            setShowAdd(false)
            showToast(title + ' added')
            loadAll()
          }}
        />
      )}

      {deleteTarget && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={function () { setDeleteTarget(null) }}>
          <div className="bg-white rounded-xl w-full max-w-sm shadow-xl p-5" onClick={function (e) { e.stopPropagation() }}>
            <h3 className="text-sm font-bold text-gray-900 mb-1">Delete "{deleteTarget.title}"?</h3>
            <p className="text-xs text-gray-500 mb-4">The file will be removed permanently.</p>
            <div className="flex justify-end gap-2">
              <button onClick={function () { setDeleteTarget(null) }}
                className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">Cancel</button>
              <button onClick={handleDelete} disabled={deleting}
                className="px-4 py-2 text-sm text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-40 transition-colors font-medium">
                {deleting ? 'Deleting…' : 'Delete'}
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

function AddDocModal({ departments, employeeId, onClose, onSaved }) {
  var [deptId, setDeptId] = useState('')
  var [role, setRole] = useState('')
  var [file, setFile] = useState(null)
  var [title, setTitle] = useState('')
  var [saving, setSaving] = useState(false)
  var [error, setError] = useState('')

  function handleFile(e) {
    setError('')
    var f = e.target.files && e.target.files[0]
    if (!f) return setFile(null)
    if (ALLOWED_EXT.indexOf(fileExt(f.name)) === -1) {
      e.target.value = ''
      setFile(null)
      return setError('Only PDF or Word (.doc, .docx) files are allowed')
    }
    if (f.size > MAX_BYTES) {
      e.target.value = ''
      setFile(null)
      return setError('File is larger than 20 MB')
    }
    setFile(f)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (!deptId) return setError('Select a department')
    if (!role) return setError('Select a role')
    if (!file) return setError('Choose a PDF or Word file')
    var cleanTitle = title.trim()
    if (!cleanTitle) return setError('Enter a title')

    setSaving(true)
    var ext = fileExt(file.name)
    var path = Date.now() + '-' + Math.random().toString(36).slice(2, 8) + '.' + ext

    var { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file, {
      contentType: file.type || undefined,
      upsert: false
    })
    if (upErr) {
      setSaving(false)
      return setError(upErr.message)
    }

    var { error: insErr } = await supabase.from('training_docs').insert({
      title: cleanTitle,
      department_id: deptId === ALL ? null : Number(deptId),
      role: role === ALL ? null : role,
      file_path: path,
      file_name: file.name,
      file_type: ext,
      uploaded_by: employeeId || null
    })
    if (insErr) {
      // Don't leave an orphan file in the bucket if the row failed.
      await supabase.storage.from(BUCKET).remove([path])
      setSaving(false)
      return setError(insErr.message)
    }

    setSaving(false)
    onSaved(cleanTitle)
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl w-full max-w-md shadow-xl" onClick={function (e) { e.stopPropagation() }}>
        <div className="px-5 py-4 border-b border-gray-100">
          <h3 className="text-sm font-bold text-gray-900">Add Training Doc</h3>
          <p className="text-xs text-gray-500">PDF or Word, up to 20 MB</p>
        </div>
        <form onSubmit={handleSubmit} className="px-5 py-4 space-y-3">
          <div>
            <label className={labelClass}>Department *</label>
            <select value={deptId} onChange={function (e) { setDeptId(e.target.value) }} className={inputClass}>
              <option value="">— Select —</option>
              <option value={ALL}>All Departments</option>
              {departments.map(function (d) {
                return <option key={d.id} value={d.id}>{d.name}</option>
              })}
            </select>
          </div>

          <div>
            <label className={labelClass}>Role *</label>
            <select value={role} onChange={function (e) { setRole(e.target.value) }} className={inputClass}>
              <option value="">— Select —</option>
              <option value={ALL}>All Roles</option>
              {ROLES.map(function (r) {
                return <option key={r.value} value={r.value}>{r.label}</option>
              })}
            </select>
          </div>

          <div>
            <label className={labelClass}>Upload Doc (PDF / Word) *</label>
            <input type="file" accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              onChange={handleFile}
              className="w-full text-sm text-gray-600 file:mr-3 file:px-3 file:py-1.5 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-slate-100 file:text-slate-700 hover:file:bg-slate-200" />
          </div>

          <div>
            <label className={labelClass}>Title *</label>
            <input type="text" value={title} onChange={function (e) { setTitle(e.target.value) }}
              placeholder="e.g. Kitchen Hygiene SOP" maxLength={150} className={inputClass} />
          </div>

          {error && (
            <div className="px-3 py-2 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-xs text-red-600">{error}</p>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose}
              className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">Cancel</button>
            <button type="submit" disabled={saving}
              className="px-4 py-2 text-sm text-white bg-slate-800 rounded-lg hover:bg-slate-900 disabled:opacity-40 transition-colors font-medium">
              {saving ? 'Uploading…' : 'Add Doc'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
