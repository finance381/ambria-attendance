// PocOverdueBanner.jsx
// Home-screen card for a point of contact: new joiners who are past the due
// date on a task this employee is a contact on, or on a test they mark.
// Stays until the task is ticked / the test is scored. Renders nothing when
// there's none (including when the my_poc_overdue_tasks RPC doesn't exist yet).
// Data: my_poc_overdue_tasks() — migrations 20261014060000_onboarding_due_reminders.sql
// and 20261014070000_onboarding_test_due_days.sql.

import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useLanguage } from '../lib/i18n'

function daysOverdue(dueDate) {
  var today = new Date()
  today.setHours(0, 0, 0, 0)
  return Math.round((today - new Date(dueDate + 'T00:00:00')) / 86400000)
}

export default function PocOverdueBanner() {
  var { t } = useLanguage()
  var [rows, setRows] = useState([])
  var [showAll, setShowAll] = useState(false)

  useEffect(function () {
    supabase.rpc('my_poc_overdue_tasks').then(function ({ data, error }) {
      if (error || !data) return
      setRows(data)
    })
  }, [])

  if (rows.length === 0) return null

  var visible = showAll ? rows : rows.slice(0, 3)

  return (
    <div className="rounded-2xl border border-red-200 bg-white mb-4 overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-3 bg-red-50 border-b border-red-100">
        <span className="w-8 h-8 rounded-lg bg-red-500 text-white inline-flex items-center justify-center shrink-0">
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
            strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 9v4M12 17h.01" /><path d="M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
          </svg>
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-red-900">{t('poc_overdue_title')}</p>
          <p className="text-[11px] text-red-700">{t('poc_overdue_sub', { n: rows.length })}</p>
        </div>
      </div>
      <ul className="divide-y divide-gray-100">
        {visible.map(function (r) {
          return (
            <li key={(r.kind || 'task') + r.task_id + '-' + r.employee_id} className="px-4 py-2.5 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-gray-900 truncate">{r.employee_name}</p>
                <p className="text-[11px] text-gray-500 truncate">
                  {r.kind === 'test' && <span className="font-bold uppercase text-amber-700 mr-1">{t('mytasks_test_label')}</span>}
                  {r.task_title}{r.department_name ? ' · ' + r.department_name : ''}
                </p>
              </div>
              <span className="shrink-0 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-red-50 text-red-700">
                {t('due_overdue_by', { n: daysOverdue(r.due_date) })}
              </span>
            </li>
          )
        })}
      </ul>
      {rows.length > 3 && (
        <button onClick={function () { setShowAll(!showAll) }}
          className="w-full py-2 text-xs font-medium text-red-700 border-t border-gray-100 hover:bg-red-50">
          {showAll ? t('show_less') : t('due_more', { n: rows.length - 3 })}
        </button>
      )}
    </div>
  )
}
