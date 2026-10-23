// NewJoiners.jsx
// Admin top-level "New Joiners" tab (/admin/new-joiners). Loads the shared
// lookups (employees, departments, training docs) once and switches between
// the Tasks, Task Order (per-department priority) and Tests sub-tabs.
// Phones: the sub-tab bar scrolls sideways and the toast spans the width.

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/useAuth'
import OnboardingTasks from './OnboardingTasks'
import OnboardingTests from './OnboardingTests'
import OnboardingTaskOrder from './OnboardingTaskOrder'

// Line icons (24x24, stroke) for the sub-tabs.
var TAB_ICONS = {
  tasks: <><path d="M11 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5" /><path d="M18.5 2.5a2.1 2.1 0 0 1 3 3L12 15l-4 1 1-4z" /></>,
  order: <><path d="M8 6h13M8 12h13M8 18h13" /><path d="M3 6h.01M3 12h.01M3 18h.01" /></>,
  tests: <><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" /><path d="M14 3v6h6M8 13h8M8 17h5" /></>
}

var TABS = [
  { id: 'tasks', label: 'Tasks' },
  { id: 'order', label: 'Task Order' },
  { id: 'tests', label: 'Tests' }
]

export default function NewJoiners() {
  var { employee } = useAuth()
  var [tab, setTab] = useState('tasks')
  var [employees, setEmployees] = useState([])
  var [departments, setDepartments] = useState([])
  var [docs, setDocs] = useState([])
  var [loading, setLoading] = useState(true)
  var [toast, setToast] = useState('')

  var showToast = useCallback(function (msg) {
    setToast(msg)
    setTimeout(function () { setToast('') }, 2500)
  }, [])

  useEffect(function () {
    Promise.all([
      supabase.from('employees').select('id, name, emp_code, department_id, date_of_joining').eq('active', true).order('name'),
      supabase.from('departments').select('id, name').eq('active', true).order('name'),
      supabase.from('training_docs').select('id, title, file_path, file_type, department_id').order('title')
    ]).then(function ([empRes, deptRes, docRes]) {
      setEmployees(empRes.data || [])
      setDepartments(deptRes.data || [])
      setDocs(docRes.data || [])
      setLoading(false)
    })
  }, [])

  var shared = {
    employees: employees,
    departments: departments,
    employeeId: employee?.id,
    showToast: showToast
  }

  return (
    <div>
      <div className="mb-4">
        <h2 className="text-xl sm:text-2xl font-bold text-gray-900 tracking-tight">New Joiners</h2>
        <p className="text-sm text-gray-500 mt-0.5">Onboarding tasks, their order and tests for new joiners</p>
      </div>

      <div className="flex gap-1 mb-4 sm:mb-5 bg-white ring-1 ring-gray-200/70 shadow-sm rounded-xl p-1 w-fit max-w-full max-md:overflow-x-auto max-md:[scrollbar-width:none] max-md:[&::-webkit-scrollbar]:hidden">
        {TABS.map(function (t) {
          var isActive = tab === t.id
          return (
            <button
              key={t.id}
              onClick={function () { setTab(t.id) }}
              className={'px-3 sm:px-4 py-2 text-sm font-semibold rounded-lg transition-colors flex items-center gap-2 whitespace-nowrap shrink-0 ' +
                (isActive ? 'bg-blue-600 text-white shadow-sm shadow-blue-600/30' : 'text-gray-600 hover:bg-gray-100')}
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{TAB_ICONS[t.id]}</svg>
              {t.label}
            </button>
          )
        })}
      </div>

      {loading ? (
        <p className="text-sm text-gray-400 text-center py-12">Loading…</p>
      ) : (
        <>
          {tab === 'tasks' && <OnboardingTasks {...shared} docs={docs} />}
          {tab === 'order' && <OnboardingTaskOrder {...shared} />}
          {tab === 'tests' && <OnboardingTests {...shared} />}
        </>
      )}

      {toast && (
        <div className="fixed bottom-4 left-4 right-4 text-center sm:text-left sm:left-auto sm:bottom-6 sm:right-6 bg-slate-800 text-white px-5 py-3 rounded-xl text-sm shadow-lg z-50">
          {toast}
        </div>
      )}
    </div>
  )
}
