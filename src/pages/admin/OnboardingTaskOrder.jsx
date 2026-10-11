// OnboardingTaskOrder.jsx
// New Joiners → Task Order sub-tab. Pick a department on the left; the tasks
// aimed at it (and at all departments) are listed on the right in the order
// a new joiner sees them. Drag a row, or use the arrows, then Save order.
// Tests are not listed here: where a test comes is set on the test form
// (start / after task number N / end), and saving puts each of the
// department's tests back in that place around the new task order.
// The department list can be searched; departments with tasks come first
// and the first of them opens by default.
// Tables: onboarding_task_order + onboarding_test_order (migrations
// 20261009060000 and 20261011060000); helpers in onboardingUtils.

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { buildFlow, saveFlow, withTestsPlaced } from './onboardingUtils'

// Line icon per department, picked by keywords in its name (first match
// wins); anything unmatched gets a building.
var DEPT_ICONS = [
  [/social|tech|it\b|software/i, <><rect x="3" y="4" width="18" height="12" rx="2" /><path d="M8 20h8M12 16v4" /></>],
  [/account|finance|hr\b|human/i, <><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>],
  [/admin|management/i, <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></>],
  [/beverage|bar\b|drink/i, <><path d="M17 8h1a3 3 0 0 1 0 6h-1" /><path d="M3 8h14v8a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4z" /><path d="M7 2v2M11 2v2M15 2v2" /></>],
  [/cafe|store|shop|outlet/i, <><path d="M3 9l1.5-5h15L21 9" /><path d="M3 9a3 3 0 0 0 6 0 3 3 0 0 0 6 0 3 3 0 0 0 6 0" /><path d="M5 12v8h14v-8M10 20v-5h4v5" /></>],
  [/cater|kitchen|chef/i, <><path d="M3 18h18M5 18a7 7 0 0 1 14 0M12 8V6M10 6h4" /></>],
  [/crockery|f&b|food|service|restaurant/i, <><path d="M7 2v8a2 2 0 0 0 2 2v10M5 2v6M9 2v6" /><path d="M17 2c-1.7 0-3 2-3 5s1.3 4 3 4v11" /></>],
  [/decor.*sales|sales/i, <><path d="M3 21h18M6 17v-4M10 17V9M14 17v-6M18 17V5" /></>],
  [/decor|design|event/i, <><path d="M12 3l1.8 4.2L18 9l-4.2 1.8L12 15l-1.8-4.2L6 9l4.2-1.8z" /><path d="M19 15l.8 1.7 1.7.8-1.7.8L19 20l-.8-1.7-1.7-.8 1.7-.8zM5 3l.6 1.4L7 5l-1.4.6L5 7l-.6-1.4L3 5l1.4-.6z" /></>],
  [/driver|transport|logistic|vehicle/i, <><path d="M5 17h14M5 17a2 2 0 1 0 4 0M15 17a2 2 0 1 0 4 0" /><path d="M3 17v-5l2-5h14l2 5v5" /><path d="M3 12h18" /></>],
  [/entertain|music|dj/i, <><path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" /></>],
  [/horti|garden|plant/i, <><path d="M11 20A7 7 0 0 1 4 13c0-6 7-10 16-10 0 9-4 16-10 16" /><path d="M4 21c3-6 7-9 12-12" /></>],
  [/housekeep|clean/i, <><path d="M19 3l-7 7" /><path d="M11 9l4 4-2 8H5l1-6z" /><path d="M8 21l1-4M11 21l.5-3" /></>],
  [/security|guard/i, <><path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" /></>],
  [/tender|purchase|procure/i, <><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" /><path d="M14 3v6h6M8 13h8M8 17h5" /></>],
  [/venue|banquet|hall/i, <><path d="M12 21s-7-6-7-11a7 7 0 0 1 14 0c0 5-7 11-7 11z" /><circle cx="12" cy="10" r="2.5" /></>],
  [/maint|engineer|electric|repair/i, <><path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.4-.6-.6-2.4z" /></>]
]
var DEPT_ICON_DEFAULT = <><path d="M4 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16M16 9h2a2 2 0 0 1 2 2v10M3 21h18M8 7h4M8 11h4M8 15h4" /></>

function DeptIcon({ name }) {
  var hit = DEPT_ICONS.find(function (x) { return x[0].test(name) })
  return (
    <svg className="w-[18px] h-[18px] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{hit ? hit[1] : DEPT_ICON_DEFAULT}</svg>
  )
}

export default function OnboardingTaskOrder({ departments, showToast }) {
  var [tasks, setTasks] = useState([])
  var [tests, setTests] = useState([])
  var [taskOrder, setTaskOrder] = useState([])
  var [testOrder, setTestOrder] = useState([])
  var [loading, setLoading] = useState(true)
  var [loadError, setLoadError] = useState('')
  var [deptId, setDeptId] = useState(departments[0] ? departments[0].id : null)
  // The working task order for the department on screen: [{ kind, id }], top first.
  var [list, setList] = useState([])
  var [dirty, setDirty] = useState(false)
  var [saving, setSaving] = useState(false)
  var [dragIndex, setDragIndex] = useState(null)
  var [overIndex, setOverIndex] = useState(null)
  var [deptSearch, setDeptSearch] = useState('')
  // Until the admin picks a department, open the first one that has tasks.
  var [picked, setPicked] = useState(false)

  var load = useCallback(async function () {
    var [tRes, sRes, toRes, soRes] = await Promise.all([
      supabase.from('onboarding_tasks').select('id, name, due_days, department_ids, created_at').order('created_at'),
      supabase.from('onboarding_tests').select('id, title, department_ids, created_at, place, after_count').order('created_at'),
      supabase.from('onboarding_task_order').select('department_id, task_id, position'),
      supabase.from('onboarding_test_order').select('department_id, test_id, position')
    ])
    var err = tRes.error || sRes.error || toRes.error || soRes.error
    setLoadError(err ? err.message : '')
    setTasks(tRes.data || [])
    setTests(sRes.data || [])
    setTaskOrder(toRes.data || [])
    setTestOrder(soRes.data || [])
    setLoading(false)
  }, [])

  useEffect(function () { load() }, [load])

  function flowFor(id) { return buildFlow(id, tasks, tests, taskOrder, testOrder) }
  function tasksFor(id) { return flowFor(id).filter(function (x) { return x.kind === 'task' }) }

  useEffect(function () {
    if (loading || picked) return
    var first = departments.find(function (d) { return tasksFor(d.id).length > 0 })
    if (first) setDeptId(first.id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, picked, departments, tasks, taskOrder])

  useEffect(function () {
    if (deptId == null) return
    setList(tasksFor(deptId))
    setDirty(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deptId, tasks, tests, taskOrder, testOrder])

  function pickDept(id) {
    if (dirty && !window.confirm('Discard the unsaved order for this department?')) return
    setPicked(true)
    setDeptId(id)
  }

  function move(from, to) {
    if (to < 0 || to >= list.length || from === to) return
    var next = list.slice()
    var item = next.splice(from, 1)[0]
    next.splice(to, 0, item)
    setList(next)
    setDirty(true)
  }

  async function save() {
    if (deptId == null || saving) return
    setSaving(true)
    // Tests of this department, in their current order, go back to their set place.
    var testById = {}
    tests.forEach(function (t) { testById[t.id] = t })
    var deptTests = flowFor(deptId)
      .filter(function (x) { return x.kind === 'test' && testById[x.id] })
      .map(function (x) { return testById[x.id] })
    var err = await saveFlow(supabase, deptId, withTestsPlaced(list, deptTests))
    setSaving(false)
    if (err) return showToast(err.message)
    var dept = departments.find(function (d) { return d.id === deptId })
    showToast('Order saved for ' + (dept ? dept.name : 'department'))
    load()
  }

  if (loading) return <p className="text-sm text-gray-400 text-center py-12">Loading…</p>

  var taskById = {}
  tasks.forEach(function (t) { taskById[t.id] = t })
  var dept = departments.find(function (d) { return d.id === deptId })

  // Departments with tasks first (each group keeps its A-Z order), then search.
  var counts = {}
  departments.forEach(function (d) { counts[d.id] = tasksFor(d.id).length })
  var q = deptSearch.trim().toLowerCase()
  var shownDepts = departments
    .filter(function (d) { return !q || d.name.toLowerCase().indexOf(q) !== -1 })
    .sort(function (a, b) { return (counts[b.id] > 0) - (counts[a.id] > 0) })
  var withTasks = departments.filter(function (d) { return counts[d.id] > 0 }).length

  return (
    <div>
      {loadError && (
        <div className="px-3 py-2 mb-4 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-xs text-red-600">{loadError}</p>
        </div>
      )}

      {departments.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl p-10 shadow-sm">
          <p className="text-sm text-gray-400 text-center">No departments yet.</p>
        </div>
      ) : (
        <div className="grid gap-5 md:grid-cols-[300px_minmax(0,1fr)] items-stretch">
          {/* Departments */}
          <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden flex flex-col">
            <div className="px-5 pt-5 pb-4">
              <div className="flex items-baseline justify-between gap-2 mb-3">
                <p className="text-base font-bold text-gray-900">Departments</p>
                <p className="text-xs text-gray-500">{withTasks} of {departments.length} have tasks</p>
              </div>
              <div className="relative">
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" viewBox="0 0 24 24"
                  fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" />
                </svg>
                <input type="text" value={deptSearch} onChange={function (e) { setDeptSearch(e.target.value) }}
                  placeholder="Search department"
                  className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-700" />
              </div>
            </div>
            <div className="flex-1 max-h-[calc(100vh-300px)] min-h-[240px] overflow-y-auto px-2 pb-3">
              {shownDepts.length === 0 && (
                <p className="px-3 py-6 text-xs text-gray-400 text-center">No department matches "{deptSearch}"</p>
              )}
              {shownDepts.map(function (d) {
                var on = d.id === deptId
                var n = counts[d.id]
                return (
                  <button key={d.id} type="button" onClick={function () { pickDept(d.id) }}
                    className={'w-full flex items-center gap-3 pl-3 pr-3 py-2 rounded-lg text-left border-l-[3px] transition-colors ' +
                      (on ? 'bg-slate-100 border-slate-800 text-gray-900' : 'border-transparent hover:bg-gray-50 text-gray-600')}>
                    <span className={on ? 'text-gray-900' : 'text-gray-500'}><DeptIcon name={d.name} /></span>
                    <span className={'flex-1 min-w-0 truncate text-sm ' + (on ? 'font-semibold' : 'font-normal')}>{d.name}</span>
                    <span className={'shrink-0 min-w-[26px] h-6 px-2 rounded-full text-[11px] font-semibold inline-flex items-center justify-center ' +
                      (on ? 'bg-slate-200 text-slate-800' : 'bg-gray-100 text-gray-500')}>{n}</span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* The sequence for the chosen department */}
          <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
            <div className="flex flex-wrap items-center gap-3 px-6 py-5 border-b border-gray-100">
              <div className="min-w-0 flex-1">
                <p className="text-lg font-bold text-gray-900">
                  {dept ? dept.name : ''}
                  {list.length > 0 && <span className="ml-2 text-sm font-normal text-gray-500">{list.length} {list.length === 1 ? 'task' : 'tasks'}</span>}
                </p>
                <p className="text-xs text-gray-500 mt-0.5">New joiners go top to bottom. Drag a row or use the arrows. Tests take the place set on each test.</p>
              </div>
              {dirty && (
                <button type="button" onClick={function () { setList(tasksFor(deptId)); setDirty(false) }}
                  className="px-3 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">Reset</button>
              )}
              <button type="button" onClick={save} disabled={!dirty || saving}
                className="px-5 py-2.5 text-sm text-white bg-gray-900 rounded-lg hover:bg-black disabled:opacity-40 transition-colors font-semibold">
                {saving ? 'Saving…' : 'Save order'}
              </button>
            </div>

            {list.length === 0 ? (
              <div className="px-6 py-14 text-center">
                <div className="mx-auto mb-3 w-11 h-11 rounded-full bg-slate-100 text-slate-400 inline-flex items-center justify-center">
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" />
                    <rect x="9" y="3" width="6" height="4" rx="1" />
                  </svg>
                </div>
                <p className="text-sm font-semibold text-gray-700">No tasks for {dept ? dept.name : 'this department'} yet</p>
                <p className="text-xs text-gray-500 mt-1">Add a task for this department (or for All Departments) in the Tasks tab, then set its order here.</p>
              </div>
            ) : (
              <ol className="p-3 space-y-3">
                {list.map(function (x, i) {
                  var row = taskById[x.id]
                  if (!row) return null
                  var isAll = !(row.department_ids || []).length
                  return (
                    <li key={x.kind + x.id}
                      draggable
                      onDragStart={function (e) { setDragIndex(i); e.dataTransfer.effectAllowed = 'move' }}
                      onDragOver={function (e) { e.preventDefault(); if (overIndex !== i) setOverIndex(i) }}
                      onDragEnd={function () { setDragIndex(null); setOverIndex(null) }}
                      onDrop={function (e) { e.preventDefault(); if (dragIndex != null) move(dragIndex, i); setDragIndex(null); setOverIndex(null) }}
                      className={'flex items-stretch bg-white border rounded-xl transition-colors ' +
                        (dragIndex === i ? 'opacity-40 ' : '') +
                        (overIndex === i && dragIndex !== null && dragIndex !== i ? 'border-slate-800 ring-1 ring-slate-800' : 'border-gray-200 hover:border-gray-300')}>
                      <span className="shrink-0 w-11 flex items-center justify-center border-r border-gray-100 cursor-grab text-gray-300 hover:text-gray-500 select-none" title="Drag to reorder" aria-hidden="true">
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                          <circle cx="9" cy="6" r="1.6" /><circle cx="15" cy="6" r="1.6" />
                          <circle cx="9" cy="12" r="1.6" /><circle cx="15" cy="12" r="1.6" />
                          <circle cx="9" cy="18" r="1.6" /><circle cx="15" cy="18" r="1.6" />
                        </svg>
                      </span>
                      <span className="flex-1 min-w-0 flex items-center gap-4 px-4 py-3">
                        <span className="shrink-0 w-14 h-12 rounded-xl text-base font-bold inline-flex items-center justify-center bg-slate-50 text-gray-900">{i + 1}</span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-base font-bold text-gray-900 truncate">{row.name}</span>
                          <span className="block text-sm text-gray-500 mt-0.5">
                            Due day {row.due_days}{isAll ? ' · All departments' : ''}
                          </span>
                        </span>
                        <span className="shrink-0 inline-flex items-center gap-2">
                          <button type="button" onClick={function () { move(i, i - 1) }} disabled={i === 0} aria-label="Move up"
                            className="w-12 h-10 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 disabled:opacity-30 inline-flex items-center justify-center">
                            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 19V5M6 11l6-6 6 6" /></svg>
                          </button>
                          <button type="button" onClick={function () { move(i, i + 1) }} disabled={i === list.length - 1} aria-label="Move down"
                            className="w-12 h-10 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 disabled:opacity-30 inline-flex items-center justify-center">
                            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 5v14M6 13l6 6 6-6" /></svg>
                          </button>
                        </span>
                      </span>
                    </li>
                  )
                })}
              </ol>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
