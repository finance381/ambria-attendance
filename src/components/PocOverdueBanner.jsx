// PocOverdueBanner.jsx
// Home-screen card for a point of contact: new joiners who are past the due
// date on a task this employee is a contact on, or on a test they mark.
// A compact row (count + the most overdue joiner) that taps open to the full
// list. Stays until the task is ticked / the test is scored. Renders nothing
// when there's none (including when the my_poc_overdue_tasks RPC doesn't
// exist yet).
// Data: my_poc_overdue_tasks() — migrations 20261014060000_onboarding_due_reminders.sql
// and 20261014070000_onboarding_test_due_days.sql.

import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useLanguage } from '../lib/i18n'
import { AlertRow } from './AlertRow'

function daysOverdue(dueDate) {
  var today = new Date()
  today.setHours(0, 0, 0, 0)
  return Math.round((today - new Date(dueDate + 'T00:00:00')) / 86400000)
}

export default function PocOverdueBanner() {
  var { t } = useLanguage()
  var [rows, setRows] = useState([])
  var [open, setOpen] = useState(false)

  useEffect(function () {
    supabase.rpc('my_poc_overdue_tasks').then(function ({ data, error }) {
      if (error || !data) return
      setRows(data)
    })
  }, [])

  if (rows.length === 0) return null

  // Rows come oldest due date first, so rows[0] is the most overdue
  var first = rows[0]

  return (
    <div role="button" tabIndex={0} onClick={function () { setOpen(!open) }}
      onKeyDown={function (e) { if (e.key === 'Enter') setOpen(!open) }} className="cursor-pointer">
      <AlertRow
        tone="red"
        icon="alert"
        title={t('poc_overdue_title') + ' · ' + rows.length}
        sub={first.employee_name + ' — ' + first.task_title + ', ' + t('due_overdue_by', { n: daysOverdue(first.due_date) })}
        expanded={open}>
        {open && (
          <ul className="border-t border-gray-100 divide-y divide-gray-100 max-h-64 overflow-y-auto">
            {rows.map(function (r) {
              return (
                <li key={(r.kind || 'task') + r.task_id + '-' + r.employee_id} className="px-3 py-2 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[13px] font-medium text-gray-900 truncate leading-tight">{r.employee_name}</p>
                    <p className="text-[11px] text-gray-500 truncate">
                      {r.kind === 'test' && <span className="font-bold uppercase text-amber-700 mr-1">{t('mytasks_test_label')}</span>}
                      {r.task_title}{r.department_name ? ' · ' + r.department_name : ''}
                    </p>
                  </div>
                  <span className="shrink-0 text-[11px] font-semibold text-red-700">
                    {t('due_overdue_by', { n: daysOverdue(r.due_date) })}
                  </span>
                </li>
              )
            })}
          </ul>
        )}
      </AlertRow>
    </div>
  )
}
