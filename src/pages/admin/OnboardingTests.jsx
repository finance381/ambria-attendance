// OnboardingTests.jsx
// New Joiners → Tests sub-tab. Onboarding tests shown as tiles; "Add Test" /
// Edit opens a form for title, description, departments (empty = all), the
// point of contact who takes and marks it, and after which task number it
// comes (0 = at the start, blank = at the end). Saving puts
// the test in that place in each of its departments' sequence; until it is
// marked, the steps after it stay locked for the joiner. Each tile also shows
// the marker's progress: new joiners scored vs pending.
// Tables: migrations 20261007100000_onboarding_tests.sql,
// 20261008060000_onboarding_test_results.sql and
// 20261011060000_onboarding_test_sequence.sql.
// Phones: one tile per row; the form modal is a single scrolling column.

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { inputClass, labelClass, hintClass, sectionClass, deptLabels, ICONS, NEW_JOINER_DAYS, newJoinersForTest, applyTestPlacement } from './onboardingUtils'
import { TileCard, TileSection, PeopleList, ChipPick, EmployeePicker, ConfirmDelete, Icon, PLUS_ICON, EmptyState } from './OnboardingFields'

export default function OnboardingTests({ employees, departments, employeeId, showToast }) {
  var [tests, setTests] = useState([])
  var [results, setResults] = useState([])
  var [tasks, setTasks] = useState([])
  var [loading, setLoading] = useState(true)
  var [loadError, setLoadError] = useState('')
  // null = closed, {} = new test, test row = editing that test
  var [editing, setEditing] = useState(null)
  var [deleteTarget, setDeleteTarget] = useState(null)
  var [deleting, setDeleting] = useState(false)

  var loadTests = useCallback(async function () {
    var [testRes, resultRes, taskRes] = await Promise.all([
      supabase.from('onboarding_tests').select('*').order('created_at', { ascending: false }),
      supabase.from('onboarding_test_results').select('test_id, employee_id, score'),
      supabase.from('onboarding_tasks').select('id, name, department_ids').order('created_at')
    ])
    setLoadError(testRes.error ? testRes.error.message : '')
    setTests(testRes.data || [])
    setResults(resultRes.data || [])
    setTasks(taskRes.data || [])
    setLoading(false)
  }, [])

  useEffect(function () { loadTests() }, [loadTests])

  async function handleDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    var { error } = await supabase.from('onboarding_tests').delete().eq('id', deleteTarget.id)
    setDeleting(false)
    if (error) return showToast(error.message)
    showToast(deleteTarget.title + ' deleted')
    setDeleteTarget(null)
    loadTests()
  }

  if (loading) {
    return <p className="text-sm text-gray-400 text-center py-12">Loading…</p>
  }

  return (
    <div>
      <div className="bg-white rounded-2xl ring-1 ring-gray-200/70 shadow-sm p-3 mb-4 flex flex-wrap items-center gap-3">
        <span className="text-xs font-semibold text-gray-600 bg-gray-100 px-2.5 py-1 rounded-full tabular-nums">
          {tests.length} onboarding {tests.length === 1 ? 'test' : 'tests'}
        </span>
        <p className="flex-1 basis-full sm:basis-0 order-last sm:order-none min-w-0 sm:min-w-52 text-xs text-gray-500">Marked by the point of contact; steps after a test stay locked until it is marked.</p>
        <button
          onClick={function () { setEditing({}) }}
          className="h-10 px-4 ml-auto sm:ml-0 inline-flex items-center gap-1.5 text-sm text-white bg-blue-600 rounded-xl hover:bg-blue-700 shadow-sm shadow-blue-600/30 transition-colors font-semibold"
        >
          <Icon d={PLUS_ICON} />
          Add Test
        </button>
      </div>

      {loadError && (
        <div className="mb-4 px-4 py-3 bg-red-50 ring-1 ring-red-200 rounded-xl">
          <p className="text-sm text-red-600">{loadError}</p>
        </div>
      )}

      {tests.length === 0 ? (
        <EmptyState icon={ICONS.test} title="No onboarding tests yet" body={'Click "Add Test" to create the first one.'} />
      ) : (
        <div className="grid md:grid-cols-2 2xl:grid-cols-3 gap-4 items-start">
          {tests.map(function (test) {
            var marker = employees.find(function (e) { return e.id === test.marked_by })
            var deptIds = test.department_ids || []
            var joiners = newJoinersForTest(test, employees)
            var scores = {}
            results.forEach(function (r) { if (r.test_id === test.id) scores[r.employee_id] = r.score })
            var doneCount = joiners.filter(function (j) { return scores[j.id] != null }).length
            return (
              <TileCard
                key={test.id}
                icon={ICONS.test}
                kind="Onboarding test"
                title={test.title}
                description={test.description}
                onEdit={function () { setEditing(test) }}
                onDelete={function () { setDeleteTarget(test) }}
                stats={[
                  { label: 'Out of', value: test.max_score + ' marks', accent: 'text-amber-700' },
                  { label: 'Departments', value: deptIds.length ? deptLabels(deptIds, departments).join(', ') : 'All', muted: !deptIds.length, chips: deptIds.length ? deptLabels(deptIds, departments) : null },
                  { label: 'Comes', value: placeLabel(test) },
                  { label: 'Due', value: test.due_days != null ? 'Within ' + test.due_days + (test.due_days === 1 ? ' day' : ' days') + ' of joining' : 'No due date', muted: test.due_days == null }
                ]}
              >
                <TileSection label="Point of contact">
                  <PeopleList people={marker ? [marker] : []} />
                </TileSection>
                <TileSection label={'Results · ' + doneCount + ' of ' + joiners.length + ' scored'}>
                  {joiners.length === 0 ? (
                    <p className="text-xs text-gray-400">No new joiners (last {NEW_JOINER_DAYS} days) in these departments</p>
                  ) : (
                    <div className="flex flex-col gap-1">
                      {joiners.map(function (j) {
                        var s = scores[j.id]
                        return (
                          <div key={j.id} className="flex items-center justify-between gap-2 text-xs">
                            <span className="text-gray-800 truncate">{j.name}</span>
                            {s != null ? (
                              <span className="font-semibold text-emerald-700 shrink-0">{s} / {test.max_score}</span>
                            ) : (
                              <span className="text-[10px] font-semibold uppercase text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded shrink-0">Pending</span>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </TileSection>
              </TileCard>
            )
          })}
        </div>
      )}

      {editing && (
        <TestModal
          test={editing}
          employees={employees}
          departments={departments}
          tasks={tasks}
          employeeId={employeeId}
          onClose={function () { setEditing(null) }}
          onSaved={function (msg) {
            setEditing(null)
            showToast(msg)
            loadTests()
          }}
        />
      )}

      {deleteTarget && (
        <ConfirmDelete
          title={'Delete "' + deleteTarget.title + '"?'}
          body="This test will be removed permanently."
          busy={deleting}
          onCancel={function () { setDeleteTarget(null) }}
          onConfirm={handleDelete}
        />
      )}
    </div>
  )
}

// Where a test sits, for the tile.
function placeLabel(test) {
  if (test.place === 'start') return 'At the start'
  if (test.place === 'count' && test.after_count != null) return 'After task ' + test.after_count
  return 'At the end'
}

function TestModal({ test, employees, departments, employeeId, onClose, onSaved }) {
  var isEdit = !!test.id
  var [title, setTitle] = useState(test.title || '')
  var [description, setDescription] = useState(test.description || '')
  var [markedBy, setMarkedBy] = useState(test.marked_by ? [test.marked_by] : [])
  var [deptIds, setDeptIds] = useState(test.department_ids || [])
  // Where the test comes: 'start' | 'count' (after task number afterCount) | 'end'.
  var [placeMode, setPlaceMode] = useState(
    test.place === 'start' ? 'start' : test.place === 'count' && test.after_count != null ? 'count' : 'end')
  var [afterCount, setAfterCount] = useState(test.after_count != null ? String(test.after_count) : '1')
  // Optional: blank = no due date
  var [dueDays, setDueDays] = useState(test.due_days != null ? String(test.due_days) : '')
  var [saving, setSaving] = useState(false)
  var [error, setError] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    var cleanTitle = title.trim()
    if (!cleanTitle) return setError('Enter a test title')
    if (markedBy.length === 0) return setError('Select the point of contact for this test')

    var place = placeMode, count = null
    if (placeMode === 'count') {
      var n = Number(afterCount)
      if (afterCount.trim() === '' || !Number.isInteger(n) || n < 1) return setError('Enter after which task number the test comes (1 or more)')
      count = n
    }

    var due = null
    if (dueDays.trim() !== '') {
      var dd = Number(dueDays)
      if (!Number.isInteger(dd) || dd < 1 || dd > 365) return setError('Due days must be between 1 and 365, or leave it blank')
      due = dd
    }

    setSaving(true)
    var row = {
      title: cleanTitle,
      description: description.trim() || null,
      // No marks field on the form: new tests are out of 100, edits keep theirs.
      max_score: test.max_score || 100,
      marked_by: markedBy[0],
      department_ids: deptIds,
      place: place,
      after_count: count,
      due_days: due
    }
    var res = isEdit
      ? await supabase.from('onboarding_tests').update(row).eq('id', test.id).select('id').single()
      : await supabase.from('onboarding_tests').insert(Object.assign({ created_by: employeeId || null }, row)).select('id').single()
    if (res.error) { setSaving(false); return setError(res.error.message) }

    // Put it in its place in each department's sequence — on a new test, or
    // when its place or departments changed.
    var moved = !isEdit || place !== (test.place || 'end') ||
      count !== (test.after_count != null ? test.after_count : null) ||
      JSON.stringify((test.department_ids || []).slice().sort()) !== JSON.stringify(deptIds.slice().sort())
    if (moved) {
      var placeErr = await applyTestPlacement(supabase, { id: res.data.id, department_ids: deptIds, place: place, after_count: count }, departments)
      if (placeErr) { setSaving(false); return setError('Saved, but the order could not be updated: ' + placeErr.message) }
    }
    setSaving(false)
    onSaved(cleanTitle + (isEdit ? ' updated' : ' added'))
  }

  var placeOptions = [
    { id: 'start', label: 'At the start' },
    { id: 'count', label: 'After a task' },
    { id: 'end', label: 'At the end' }
  ]
  var n = Number(afterCount)
  var placeHint = placeMode === 'start'
    ? 'Comes first, before any task.'
    : placeMode === 'end'
      ? 'Comes after all of the department\u2019s tasks.'
      : Number.isInteger(n) && n >= 1
        ? (n === 1 ? 'Comes after the first task of each department.' : 'Comes after the first ' + n + ' tasks of each department (at the end if it has fewer).')
        : 'Enter a task number, 1 or more.'

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-3 sm:p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-4xl shadow-xl max-h-[94vh] sm:max-h-[92vh] flex flex-col" onClick={function (e) { e.stopPropagation() }}>
        <div className="flex items-start justify-between gap-3 px-4 sm:px-6 pt-4 sm:pt-5 pb-3 sm:pb-4 border-b border-gray-100">
          <div>
            <h3 className="text-base sm:text-lg font-semibold text-gray-900 tracking-tight">{isEdit ? 'Edit test' : 'Add test'}</h3>
            <p className="text-[13px] sm:text-sm text-gray-500 mt-0.5">For new joiners in the selected departments</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close"
            className="w-9 h-9 sm:w-8 sm:h-8 -mr-2 shrink-0 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 inline-flex items-center justify-center">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col min-h-0 flex-1">
          <div className="px-4 sm:px-6 py-4 sm:py-5 overflow-y-auto grid grid-cols-1 gap-x-8 gap-y-6 md:grid-cols-2">
            {/* Left: what the test is and who takes it */}
            <section className="space-y-3">
              <p className={sectionClass}>Details</p>
              <div>
                <label className={labelClass}>Title <span className="text-red-500">*</span></label>
                <input type="text" value={title} onChange={function (e) { setTitle(e.target.value) }}
                  placeholder="e.g. Food Safety Basics" maxLength={150} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Description<span className={hintClass}>(optional)</span></label>
                <textarea value={description} onChange={function (e) { setDescription(e.target.value) }}
                  rows={4} maxLength={1000} placeholder="What does this test cover?"
                  className={inputClass + ' resize-none'} />
              </div>
              <div>
                <label className={labelClass}>Point of contact <span className="text-red-500">*</span><span className={hintClass}>takes and marks the test</span></label>
                <EmployeePicker employees={employees} selected={markedBy} onChange={setMarkedBy} single />
              </div>
              <div>
                <label className={labelClass}>Due within<span className={hintClass}>(optional)</span></label>
                <div className="flex items-center gap-2.5">
                  <input type="number" min={1} max={365} step={1} value={dueDays}
                    onChange={function (e) { setDueDays(e.target.value) }} placeholder="—"
                    className="w-24 px-3.5 py-2.5 border border-gray-200 rounded-xl bg-white text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
                  <span className="text-sm text-gray-600">days of joining</span>
                </div>
                <p className="text-xs text-gray-500 mt-1">Leave blank for no due date. With one, the joiner gets a reminder and the point of contact is alerted when it's overdue.</p>
              </div>
            </section>

            {/* Right: who it is for and where it sits in the joiner's sequence */}
            <section className="space-y-3">
              <p className={sectionClass}>Who it is for</p>
              <ChipPick allLabel="All Departments" selected={deptIds} onChange={setDeptIds}
                options={departments.map(function (d) { return { value: d.id, label: d.name } })} />

              <p className={sectionClass + ' pt-4'}>When it comes</p>
              <div className="grid grid-cols-3 gap-1 p-1 bg-gray-100 rounded-xl">
                {placeOptions.map(function (o) {
                  var on = placeMode === o.id
                  return (
                    <button key={o.id} type="button" onClick={function () { setPlaceMode(o.id) }}
                      className={'px-2 py-2 text-[13px] font-semibold rounded-lg transition-colors ' +
                        (on ? 'bg-blue-600 text-white shadow-sm shadow-blue-600/30' : 'text-gray-600 hover:bg-white/70')}>
                      {o.label}
                    </button>
                  )
                })}
              </div>
              {placeMode === 'count' && (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-700">After task number</span>
                  <input type="number" min={1} step={1} value={afterCount}
                    onChange={function (e) { setAfterCount(e.target.value) }}
                    className="w-20 h-10 px-3 border border-gray-200 rounded-xl bg-white text-sm text-center focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              )}
              <div className="px-3.5 py-3 rounded-xl bg-amber-50 ring-1 ring-amber-100">
                <p className="text-[13px] text-amber-900">{placeHint}</p>
                <p className="text-xs text-amber-700 mt-0.5">Steps after the test stay locked for the joiner until this test is marked.</p>
              </div>
            </section>

            {error && (
              <div className="md:col-span-2 px-4 py-3 bg-red-50 ring-1 ring-red-200 rounded-xl">
                <p className="text-sm text-red-600">{error}</p>
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2 px-4 sm:px-6 py-3 sm:py-4 border-t border-gray-100 bg-gray-50/60 rounded-b-2xl">
            <button type="button" onClick={onClose}
              className="h-10 flex-1 sm:flex-none px-4 text-sm font-medium bg-white ring-1 ring-gray-200 text-gray-700 hover:bg-gray-50 rounded-xl transition-colors">Cancel</button>
            <button type="submit" disabled={saving}
              className="h-10 flex-1 sm:flex-none px-5 text-sm text-white bg-blue-600 rounded-xl hover:bg-blue-700 shadow-sm shadow-blue-600/30 disabled:opacity-40 transition-colors font-semibold">
              {saving ? 'Saving\u2026' : (isEdit ? 'Save Changes' : 'Add Test')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
