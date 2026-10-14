// TaskDueBanner.jsx
// Home-screen reminder for a new joiner: their onboarding tasks (and tests
// that have a due date) due within the next 2 days or already overdue (not
// done, not locked behind a test). Red when anything is overdue, amber
// otherwise; taps through to /my-tasks. Renders nothing when there's nothing
// to remind about.
// Data: my_onboarding_flow() RPC (due_date, done, locked).

import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useLanguage } from '../lib/i18n'

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
  var [items, setItems] = useState([])

  useEffect(function () {
    supabase.rpc('my_onboarding_flow').then(function ({ data, error }) {
      if (error || !data) return
      var list = data
        .filter(function (s) { return !s.done && !s.locked && s.due_date })
        .map(function (s) { return { key: s.kind + s.id, isTest: s.kind === 'test', title: s.title, days: daysLeft(s.due_date) } })
        .filter(function (s) { return s.days <= REMIND_DAYS })
        .sort(function (a, b) { return a.days - b.days })
      setItems(list)
    })
  }, [])

  if (items.length === 0) return null

  var overdueCount = items.filter(function (s) { return s.days < 0 }).length
  var soonCount = items.length - overdueCount
  var overdue = overdueCount > 0

  return (
    <Link to="/my-tasks"
      className={'block bg-white rounded-2xl shadow-sm ring-1 mb-4 no-underline overflow-hidden border-l-4 ' +
        (overdue ? 'ring-red-100 border-l-red-500' : 'ring-amber-100 border-l-amber-400')}>
      {/* Header: icon, what's wrong, counts, and where tapping goes */}
      <div className="flex items-center gap-3 px-4 py-3">
        <span className={'w-10 h-10 rounded-xl inline-flex items-center justify-center shrink-0 ' +
          (overdue ? 'bg-red-50 text-red-600' : 'bg-amber-50 text-amber-600')}>
          <Glyph name="clock" className="w-5 h-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-bold text-gray-900 leading-tight">
            {overdue ? t('due_banner_overdue') : t('due_banner_soon')}
          </p>
          <p className="flex items-center gap-2 mt-1 text-[11px]">
            {overdueCount > 0 && (
              <span className="inline-flex items-center gap-1 font-semibold text-red-700">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500" />{t('due_count_overdue', { n: overdueCount })}
              </span>
            )}
            {soonCount > 0 && (
              <span className="inline-flex items-center gap-1 font-semibold text-amber-700">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />{t('due_count_soon', { n: soonCount })}
              </span>
            )}
          </p>
        </div>
        <span className="inline-flex items-center gap-0.5 text-xs font-semibold text-slate-600 shrink-0">
          {t('due_view')}
          <Glyph name="chevron" className="w-3.5 h-3.5" />
        </span>
      </div>

      <ul className="border-t border-gray-100 divide-y divide-gray-100">
        {items.slice(0, 3).map(function (s) {
          var late = s.days < 0
          return (
            <li key={s.key} className="flex items-center gap-3 px-4 py-2.5">
              <span className={'w-7 h-7 rounded-lg inline-flex items-center justify-center shrink-0 ' +
                (s.isTest ? 'bg-amber-50 text-amber-600' : 'bg-slate-100 text-slate-600')}>
                <Glyph name={s.isTest ? 'test' : 'task'} className="w-3.5 h-3.5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-gray-900 truncate leading-tight">{s.title}</p>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mt-0.5">
                  {s.isTest ? t('mytasks_test_label') : t('mytasks_task_label')}
                </p>
              </div>
              <span className={'shrink-0 text-[11px] font-semibold px-2 py-0.5 rounded-full ' +
                (late ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-700')}>
                {dueText(t, s.days)}
              </span>
            </li>
          )
        })}
      </ul>
      {items.length > 3 && (
        <p className="px-4 py-2 text-[11px] font-medium text-gray-500 border-t border-gray-100">{t('due_more', { n: items.length - 3 })}</p>
      )}
    </Link>
  )
}

// Small stroke icons (24x24), same style as MyTasks.
function Glyph({ name, className }) {
  var paths = {
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    chevron: <path d="M9 6l6 6-6 6" />,
    task: <><rect x="4" y="4" width="16" height="16" rx="3" /><path d="M8.5 12l2.5 2.5 4.5-5" /></>,
    test: <><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" /><rect x="9" y="3" width="6" height="4" rx="1" /><path d="M9 13h6M9 17h4" /></>
  }
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>
  )
}
