// TaskDueBanner.jsx
// Home-screen reminder for a new joiner: their onboarding tasks (and tests
// that have a due date) due within the next 2 days or already overdue (not
// done, not locked behind a test). One compact row — counts plus the most
// urgent item — red when anything is overdue, amber otherwise; taps through
// to /my-tasks. Renders nothing when there's nothing to remind about, and for
// anyone whose Tasks tab is off.
// Data: my_onboarding_flow() RPC (due_date, done, locked).

import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useLanguage } from '../lib/i18n'
import { useAuth } from '../lib/useAuth'
import { AlertRow } from './AlertRow'

var REMIND_DAYS = 2

// Whole days from today to the due date: 0 = today, -1 = 1 day overdue.
function daysLeft(dueDate) {
  var today = new Date()
  today.setHours(0, 0, 0, 0)
  return Math.round((new Date(dueDate + 'T00:00:00') - today) / 86400000)
}

function dueText(t, days) {
  if (days < 0) return t('due_overdue_by', { n: -days })
  if (days === 0) return t('due_today')
  if (days === 1) return t('due_tomorrow')
  return t('due_in_days', { n: days })
}

export default function TaskDueBanner() {
  var { t } = useLanguage()
  var { employee } = useAuth()
  var [items, setItems] = useState([])
  // Only new joiners (Tasks tab switched on in Admin → Employees) have
  // onboarding; everyone else would see tasks they can't open.
  var hasTasksTab = !!(employee && employee.visible_tabs && employee.visible_tabs.includes('tasks'))

  useEffect(function () {
    if (!hasTasksTab) return
    supabase.rpc('my_onboarding_flow').then(function ({ data, error }) {
      if (error || !data) return
      var list = data
        .filter(function (s) { return !s.done && !s.locked && s.due_date })
        .map(function (s) { return { title: s.title, days: daysLeft(s.due_date) } })
        .filter(function (s) { return s.days <= REMIND_DAYS })
        .sort(function (a, b) { return a.days - b.days })
      setItems(list)
    })
  }, [hasTasksTab])

  if (items.length === 0) return null

  var overdueCount = items.filter(function (s) { return s.days < 0 }).length
  var soonCount = items.length - overdueCount
  var first = items[0]
  var counts = [
    overdueCount > 0 ? t('due_count_overdue', { n: overdueCount }) : null,
    soonCount > 0 ? t('due_count_soon', { n: soonCount }) : null
  ].filter(Boolean).join(' · ')

  return (
    <Link to="/my-tasks" className="block no-underline">
      <AlertRow
        tone={overdueCount > 0 ? 'red' : 'amber'}
        icon="clock"
        title={t('due_banner_title') + ' · ' + counts}
        sub={first.title + ' — ' + dueText(t, first.days) + (items.length > 1 ? '  ' + t('due_more', { n: items.length - 1 }) : '')}
      />
    </Link>
  )
}
