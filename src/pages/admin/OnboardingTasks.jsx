// OnboardingTasks.jsx
// New Joiners → Tasks sub-tab. Onboarding tasks shown as tiles; "+ Add Task" /
// Edit opens a form for name, description, assigned departments + roles
// (empty = all), points of contact (multiple employees), days-to-complete
// (counted from each joiner's date of joining) and attached Company Training
// Docs (picked by title). Tables: migrations 20261007070000_onboarding_tasks.sql
// onward.

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { ROLES, inputClass, labelClass, hintClass, sectionClass, toggle, deptLabels, ICONS } from './onboardingUtils'
import { TileCard, TileSection, PeopleList, AttachmentList, ChipPick, EmployeePicker, ConfirmDelete } from './OnboardingFields'

var DEFAULT_DUE_DAYS = 7
var MAX_DUE_DAYS = 365

export default function OnboardingTasks({ employees, departments, docs, employeeId, showToast }) {
  var [tasks, setTasks] = useState([])
  var [loading, setLoading] = useState(true)
  var [loadError, setLoadError] = useState('')
  // null = closed, {} = new task, task row = editing that task
  var [editing, setEditing] = useState(null)
  var [deleteTarget, setDeleteTarget] = useState(null)
  var [deleting, setDeleting] = useState(false)
  // List filters: '' = all departments; a department also keeps the
  // All-Departments tasks, since its joiners get those too.
  var [deptFilter, setDeptFilter] = useState('')
  var [search, setSearch] = useState('')

  var loadTasks = useCallback(async function () {
    var { data, error } = await supabase.from('onboarding_tasks').select('*').order('created_at', { ascending: false })
    setLoadError(error ? error.message : '')
    setTasks(data || [])
    setLoading(false)
  }, [])

  useEffect(function () { loadTasks() }, [loadTasks])

  async function openDoc(doc) {
    var { data, error } = await supabase.storage.from('training-docs').createSignedUrl(doc.file_path, 60 * 5)
    if (error || !data) return showToast('Could not open file')
    window.open(data.signedUrl, '_blank', 'noopener')
  }

  async function handleDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    var { error } = await supabase.from('onboarding_tasks').delete().eq('id', deleteTarget.id)
    setDeleting(false)
    if (error) return showToast(error.message)
    showToast(deleteTarget.name + ' deleted')
    setDeleteTarget(null)
    loadTasks()
  }

  if (loading) {
    return <p className="text-sm text-gray-400 text-center py-12">Loading…</p>
  }

  var q = search.trim().toLowerCase()
  var shownTasks = tasks.filter(function (task) {
    var ids = task.department_ids || []
    if (deptFilter && ids.length > 0 && !ids.includes(Number(deptFilter))) return false
    if (q && task.name.toLowerCase().indexOf(q) === -1 && (task.description || '').toLowerCase().indexOf(q) === -1) return false
    return true
  })
  var filtering = deptFilter !== '' || q !== ''

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" viewBox="0 0 24 24"
            fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" />
          </svg>
          <input type="text" value={search} onChange={function (e) { setSearch(e.target.value) }}
            placeholder="Search tasks"
            className="w-full pl-9 pr-3 py-2 bg-white border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-700" />
        </div>
        <select value={deptFilter} onChange={function (e) { setDeptFilter(e.target.value) }}
          className="px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-700">
          <option value="">All departments</option>
          {departments.map(function (d) {
            return <option key={d.id} value={String(d.id)}>{d.name}</option>
          })}
        </select>
        {filtering && (
          <button onClick={function () { setSearch(''); setDeptFilter('') }}
            className="px-3 py-2 text-xs text-gray-500 hover:text-gray-800">Clear</button>
        )}
        <p className="text-xs text-gray-500 ml-auto">
          {filtering ? shownTasks.length + ' of ' : ''}{tasks.length} onboarding {tasks.length === 1 ? 'task' : 'tasks'}
        </p>
        <button
          onClick={function () { setEditing({}) }}
          className="px-4 py-2 text-sm text-white bg-slate-800 rounded-lg hover:bg-slate-900 transition-colors font-medium"
        >
          + Add Task
        </button>
      </div>

      {loadError && (
        <div className="px-3 py-2 mb-4 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-xs text-red-600">{loadError}</p>
        </div>
      )}

      {tasks.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl p-10 shadow-sm">
          <p className="text-sm text-gray-400 text-center">No tasks yet. Click "+ Add Task" to create one.</p>
        </div>
      ) : shownTasks.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl p-10 shadow-sm">
          <p className="text-sm text-gray-400 text-center">No tasks match this search.</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {shownTasks.map(function (task) {
            var pocs = employees.filter(function (e) { return task.poc_ids.includes(e.id) })
            var taskDocs = docs.filter(function (d) { return task.training_doc_ids.includes(d.id) })
            var deptIds = task.department_ids || []
            var roles = task.roles || []
            var roleLabels = ROLES
              .filter(function (r) { return roles.includes(r.value) })
              .map(function (r) { return r.label })
            return (
              <TileCard
                key={task.id}
                icon={ICONS.task}
                kind="Onboarding task"
                title={task.name}
                description={task.description}
                onEdit={function () { setEditing(task) }}
                onDelete={function () { setDeleteTarget(task) }}
                stats={[
                  { label: 'Complete within', value: task.due_days + (task.due_days === 1 ? ' day' : ' days') + ' of joining', accent: 'text-amber-700' },
                  { label: 'Departments', value: deptIds.length ? deptLabels(deptIds, departments).join(', ') : 'All departments', muted: !deptIds.length },
                  { label: 'Roles', value: roleLabels.length ? roleLabels.join(', ') : 'All roles', muted: !roleLabels.length }
                ]}
              >
                <TileSection label="Point of contact">
                  <PeopleList people={pocs} />
                </TileSection>
                <TileSection label="Training docs" count={taskDocs.length}>
                  <AttachmentList docs={taskDocs} onOpen={openDoc} />
                </TileSection>
              </TileCard>
            )
          })}
        </div>
      )}

      {editing && (
        <TaskModal
          task={editing}
          employees={employees}
          docs={docs}
          departments={departments}
          employeeId={employeeId}
          onClose={function () { setEditing(null) }}
          onSaved={function (msg) {
            setEditing(null)
            showToast(msg)
            loadTasks()
          }}
        />
      )}

      {deleteTarget && (
        <ConfirmDelete
          title={'Delete "' + deleteTarget.name + '"?'}
          body="This task will be removed permanently."
          busy={deleting}
          onCancel={function () { setDeleteTarget(null) }}
          onConfirm={handleDelete}
        />
      )}
    </div>
  )
}

function TaskModal({ task, employees, docs, departments, employeeId, onClose, onSaved }) {
  var isEdit = !!task.id
  var [name, setName] = useState(task.name || '')
  var [description, setDescription] = useState(task.description || '')
  var [deptIds, setDeptIds] = useState(task.department_ids || [])
  var [roles, setRoles] = useState(task.roles || [])
  var [pocIds, setPocIds] = useState(task.poc_ids || [])
  var [docIds, setDocIds] = useState(task.training_doc_ids || [])
  var [dueDays, setDueDays] = useState(String(task.due_days || DEFAULT_DUE_DAYS))
  var [saving, setSaving] = useState(false)
  var [error, setError] = useState('')

  // Docs offered for attaching follow the departments picked above: a doc
  // shows if it is for all departments or for one of them (all docs when the
  // task is for all departments). Docs already attached stay listed, tagged,
  // so changing the departments never drops one silently.
  function docFitsDepts(d) {
    return deptIds.length === 0 || d.department_id == null || deptIds.includes(d.department_id)
  }
  var shownDocs = docs.filter(function (d) { return docFitsDepts(d) || docIds.includes(d.id) })

  function docDeptLabel(d) {
    if (d.department_id == null) return 'All departments'
    var dept = departments.find(function (x) { return x.id === d.department_id })
    return dept ? dept.name : 'Inactive dept'
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    var cleanName = name.trim()
    if (!cleanName) return setError('Enter a task name')
    if (pocIds.length === 0) return setError('Add at least one point of contact')
    var days = Number(dueDays)
    if (!Number.isInteger(days) || days < 1 || days > MAX_DUE_DAYS) {
      return setError('Days to complete must be between 1 and ' + MAX_DUE_DAYS)
    }

    setSaving(true)
    var row = {
      name: cleanName,
      description: description.trim() || null,
      department_ids: deptIds,
      roles: roles,
      poc_ids: pocIds,
      training_doc_ids: docIds,
      due_days: days
    }
    var { error: saveErr } = isEdit
      ? await supabase.from('onboarding_tasks').update(row).eq('id', task.id)
      : await supabase.from('onboarding_tasks').insert(Object.assign({ created_by: employeeId || null }, row))
    setSaving(false)
    if (saveErr) return setError(saveErr.message)
    onSaved(cleanName + (isEdit ? ' updated' : ' added'))
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-4xl shadow-xl max-h-[92vh] flex flex-col" onClick={function (e) { e.stopPropagation() }}>
        <div className="flex items-start justify-between gap-3 px-6 pt-5 pb-4 border-b border-gray-100">
          <div>
            <h3 className="text-lg font-semibold text-gray-900 tracking-tight">{isEdit ? 'Edit onboarding task' : 'Add onboarding task'}</h3>
            <p className="text-sm text-gray-500 mt-0.5">Applies to new joiners in the selected departments and roles</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close"
            className="w-8 h-8 -mr-2 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 inline-flex items-center justify-center">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col min-h-0 flex-1">
          <div className="px-6 py-5 overflow-y-auto grid gap-x-8 gap-y-5 md:grid-cols-2">
            {/* Left: what the task is */}
            <div className="space-y-4">
              <p className={sectionClass}>Details</p>
              <div>
                <label className={labelClass}>Task name <span className="text-red-500">*</span></label>
                <input type="text" value={name} onChange={function (e) { setName(e.target.value) }}
                  placeholder="e.g. Meet your department head" maxLength={150} className={inputClass} />
              </div>

              <div>
                <label className={labelClass}>Description<span className={hintClass}>(optional)</span></label>
                <textarea value={description} onChange={function (e) { setDescription(e.target.value) }}
                  rows={4} maxLength={1000} placeholder="What should the new joiner do?"
                  className={inputClass + ' resize-none'} />
              </div>

              <div>
                <label className={labelClass}>Point of contact <span className="text-red-500">*</span><span className={hintClass}>(one or more)</span></label>
                <EmployeePicker employees={employees} selected={pocIds} onChange={setPocIds} />
              </div>

              <div>
                <label className={labelClass}>Complete within <span className="text-red-500">*</span></label>
                <div className="flex items-center gap-2.5">
                  <input type="number" min={1} max={MAX_DUE_DAYS} step={1} value={dueDays}
                    onChange={function (e) { setDueDays(e.target.value) }}
                    className="w-24 px-3.5 py-2.5 border border-gray-300 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-slate-700 focus:border-transparent" />
                  <span className="text-sm text-gray-600">days of joining</span>
                </div>
              </div>
            </div>

            {/* Right: who it is for, and what to read */}
            <div className="space-y-4">
              <p className={sectionClass}>Who it is for</p>
              <div>
                <label className={labelClass}>Departments</label>
                <ChipPick allLabel="All Departments" selected={deptIds} onChange={setDeptIds}
                  options={departments.map(function (d) { return { value: d.id, label: d.name } })} />
              </div>

              <div>
                <label className={labelClass}>Roles</label>
                <ChipPick allLabel="All Roles" selected={roles} onChange={setRoles} options={ROLES} />
              </div>

              <div>
                <label className={labelClass}>Training docs<span className={hintClass}>(optional)</span></label>
                {docs.length === 0 ? (
                  <p className="text-xs text-gray-400">No docs yet. Add them in Config → Company Training Docs.</p>
                ) : shownDocs.length === 0 ? (
                  <p className="text-xs text-gray-400">No docs for the selected departments. Add them in Config → Company Training Docs.</p>
                ) : (
                  <div className="border border-gray-200 rounded-lg max-h-52 overflow-y-auto divide-y divide-gray-100">
                    {shownDocs.map(function (d) {
                      var fits = docFitsDepts(d)
                      return (
                        <label key={d.id} className="flex items-center gap-2 px-3 py-1.5 text-xs text-gray-700 cursor-pointer hover:bg-gray-50">
                          <input type="checkbox" checked={docIds.includes(d.id)}
                            onChange={function () { setDocIds(toggle(docIds, d.id)) }} />
                          <span className="flex-1">{d.title}</span>
                          <span className={'text-[10px] ' + (fits ? 'text-gray-400' : 'text-amber-600')}>
                            {fits ? docDeptLabel(d) : docDeptLabel(d) + ' · not in selected depts'}
                          </span>
                        </label>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>

            {error && (
              <div className="md:col-span-2 px-3 py-2 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-xs text-red-600">{error}</p>
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2 px-6 py-4 border-t border-gray-100">
            <button type="button" onClick={onClose}
              className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">Cancel</button>
            <button type="submit" disabled={saving}
              className="px-5 py-2 text-sm text-white bg-slate-800 rounded-lg hover:bg-slate-900 disabled:opacity-40 transition-colors font-semibold">
              {saving ? 'Saving\u2026' : (isEdit ? 'Save Changes' : 'Add Task')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
