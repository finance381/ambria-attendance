// onboardingUtils.js
// Shared constants/helpers for the New Joiners tab (OnboardingTasks,
// OnboardingTests, OnboardingFields).

export var ROLES = [
  { value: 'staff', label: 'Staff' },
  { value: 'supervisor', label: 'Supervisor' },
  { value: 'manager', label: 'Manager' },
  { value: 'admin', label: 'Admin' }
]

export var inputClass = 'w-full px-3.5 py-2.5 border border-gray-300 rounded-lg text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-slate-700 focus:border-transparent'
export var labelClass = 'block text-[13px] font-medium text-gray-700 mb-1.5'
// Small grey note next to a label, e.g. "(one or more)".
export var hintClass = 'ml-1 text-xs font-normal text-gray-400'
// Heading over a group of fields in the onboarding forms.
export var sectionClass = 'text-sm font-semibold text-gray-900 pb-2 mb-1 border-b border-gray-100'

export function toggle(list, id) {
  return list.includes(id) ? list.filter(function (x) { return x !== id }) : list.concat(id)
}

// A "new joiner" for a test = active employee in one of its departments
// (empty = all) who joined within the last NEW_JOINER_DAYS days and isn't the
// marker. Must match the 60 in tests_to_mark() / submit_test_score()
// (migration 20261008060000_onboarding_test_results.sql).
export var NEW_JOINER_DAYS = 60

export function newJoinersForTest(test, employees) {
  var cutoff = new Date()
  cutoff.setHours(0, 0, 0, 0)
  cutoff.setDate(cutoff.getDate() - NEW_JOINER_DAYS)
  var deptIds = test.department_ids || []
  return employees.filter(function (e) {
    if (!e.date_of_joining || e.id === test.marked_by) return false
    if (deptIds.length > 0 && !deptIds.includes(e.department_id)) return false
    return new Date(e.date_of_joining + 'T00:00:00') >= cutoff
  })
}

// Empty id list = "All Departments".
export function deptLabels(ids, departments) {
  if (!ids || ids.length === 0) return ['All Departments']
  return departments
    .filter(function (d) { return ids.includes(d.id) })
    .map(function (d) { return d.name })
}

// SVG path data for the tile icons (rendered by Icon in OnboardingFields).
export var ICONS = {
  edit: ['M13.5 3.5l3 3L7 16H4v-3l9.5-9.5z'],
  trash: ['M4 6h12', 'M8 6V4h4v2', 'M6 6l1 10h6l1-10'],
  task: ['M7 4h6', 'M5 5h10v12H5z', 'M8 10l1.5 1.5L12.5 8.5'],
  test: ['M5 3h7l3 3v11H5z', 'M8 9h4', 'M8 12h4', 'M8 15h2'],
  open: ['M8 4H4v12h12v-4', 'M11 4h5v5', 'M16 4l-7 7']
}

// ── The onboarding sequence per department (tasks and tests together) ──────
// Positions live in onboarding_task_order and onboarding_test_order and share
// one numbering, so a department's list interleaves both. Must order the same
// way as onboarding_flow() (migration 20261011060000_onboarding_test_sequence.sql):
// ordered items first by position; the rest tasks before tests, then by due
// day and age.

function appliesTo(item, deptId) {
  var ids = item.department_ids || []
  return ids.length === 0 || ids.includes(deptId)
}

// [{ kind: 'task'|'test', id }] for one department, top first.
export function buildFlow(deptId, tasks, tests, taskOrder, testOrder) {
  var pos = {}
  taskOrder.forEach(function (r) { if (r.department_id === deptId) pos['task:' + r.task_id] = r.position })
  testOrder.forEach(function (r) { if (r.department_id === deptId) pos['test:' + r.test_id] = r.position })
  var items = []
  tasks.forEach(function (t) {
    if (appliesTo(t, deptId)) items.push({ kind: 'task', id: t.id, kr: 0, dd: t.due_days, ca: t.created_at })
  })
  tests.forEach(function (t) {
    if (appliesTo(t, deptId)) items.push({ kind: 'test', id: t.id, kr: 1, dd: null, ca: t.created_at })
  })
  items.sort(function (a, b) {
    var pa = pos[a.kind + ':' + a.id], pb = pos[b.kind + ':' + b.id]
    if (pa != null && pb != null && pa !== pb) return pa - pb
    if (pa != null && pb == null) return -1
    if (pb != null && pa == null) return 1
    if (a.kr !== b.kr) return a.kr - b.kr
    if (a.dd !== b.dd) return (a.dd == null ? 1e9 : a.dd) - (b.dd == null ? 1e9 : b.dd)
    if (a.ca !== b.ca) return a.ca < b.ca ? -1 : 1
    return a.id - b.id
  })
  return items.map(function (x) { return { kind: x.kind, id: x.id } })
}

// Writes one department's list: its rows in both order tables are replaced.
export async function saveFlow(supabase, deptId, list) {
  var taskRows = [], testRows = []
  list.forEach(function (x, i) {
    if (x.kind === 'task') taskRows.push({ department_id: deptId, task_id: x.id, position: i })
    else testRows.push({ department_id: deptId, test_id: x.id, position: i })
  })
  var d1 = await supabase.from('onboarding_task_order').delete().eq('department_id', deptId)
  if (d1.error) return d1.error
  var d2 = await supabase.from('onboarding_test_order').delete().eq('department_id', deptId)
  if (d2.error) return d2.error
  if (taskRows.length) {
    var i1 = await supabase.from('onboarding_task_order').insert(taskRows)
    if (i1.error) return i1.error
  }
  if (testRows.length) {
    var i2 = await supabase.from('onboarding_test_order').insert(testRows)
    if (i2.error) return i2.error
  }
  return null
}

// The list with a test moved to its place: 'start', 'count' (after the Nth
// task of this department's list), or 'end'. An N past the department's last
// task puts it at the end.
export function placeTest(list, testId, place, afterCount) {
  var rest = list.filter(function (x) { return !(x.kind === 'test' && x.id === testId) })
  var item = { kind: 'test', id: testId }
  var at = rest.length
  if (place === 'start') at = 0
  else if (place === 'count' && afterCount != null) {
    var seen = 0
    for (var i = 0; i < rest.length; i++) {
      if (rest[i].kind === 'task') seen++
      if (seen === afterCount) { at = i + 1; break }
    }
  }
  // Two tests in the same spot keep the order they were placed in.
  while (at < rest.length && rest[at].kind === 'test') at++
  rest.splice(at, 0, item)
  return rest
}

// A department's full list from its tasks in the given order: each test
// that applies to the department (in testsInOrder order) goes back to the
// place set on the test form.
export function withTestsPlaced(taskList, testsInOrder) {
  var list = taskList.slice()
  testsInOrder.forEach(function (t) {
    list = placeTest(list, t.id, t.place || 'end', t.after_count)
  })
  return list
}

// Puts a test in its place in every department it applies to, keeping the
// rest of each department's order as it is.
export async function applyTestPlacement(supabase, test, departments) {
  var [tRes, sRes, toRes, soRes] = await Promise.all([
    supabase.from('onboarding_tasks').select('id, due_days, department_ids, created_at'),
    supabase.from('onboarding_tests').select('id, department_ids, created_at'),
    supabase.from('onboarding_task_order').select('department_id, task_id, position'),
    supabase.from('onboarding_test_order').select('department_id, test_id, position')
  ])
  var err = tRes.error || sRes.error || toRes.error || soRes.error
  if (err) return err
  var scope = (test.department_ids || []).length ? test.department_ids : departments.map(function (d) { return d.id })
  for (var i = 0; i < scope.length; i++) {
    var deptId = scope[i]
    var list = buildFlow(deptId, tRes.data || [], sRes.data || [], toRes.data || [], soRes.data || [])
    var placed = placeTest(list, test.id, test.place || 'end', test.after_count)
    var e = await saveFlow(supabase, deptId, placed)
    if (e) return e
  }
  return null
}
