// MyTasks.jsx
// Mobile "Tasks" tab (/my-tasks, visible_tabs id 'tasks'). The logged-in
// employee's onboarding sequence in their department's order: tasks (due
// date, points of contact, training docs, Mark as complete) and tests (who
// takes it, its status or score). A test holds back the steps after it:
// until it is marked they show as locked. Ticking the last step before a test
// notifies its point of contact.
// Layout: progress bar, then a numbered timeline with one card per step
// (status chip, contact + due date, doc chips, action); the next step to do is
// highlighted.
// Data: my_onboarding_flow() RPC — migration
// 20261011060000_onboarding_test_sequence.sql.

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { useLanguage } from '../../lib/i18n'

function formatDate(d) {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

function isOverdue(d) {
  var today = new Date()
  today.setHours(0, 0, 0, 0)
  return new Date(d + 'T00:00:00') < today
}

// Small stroke icons (24x24).
function Icon({ name, className }) {
  var paths = {
    check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
    task: <><rect x="4" y="4" width="16" height="16" rx="3" /><path d="M8.5 12l2.5 2.5 4.5-5" /></>,
    test: <><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" /><rect x="9" y="3" width="6" height="4" rx="1" /><path d="M9 13h6M9 17h4" /></>,
    user: <><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></>,
    file: <><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" /><path d="M14 3v6h6" /></>,
    lock: <><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></>,
    undo: <><path d="M9 14L4 9l5-5" /><path d="M4 9h11a5 5 0 0 1 0 10h-3" /></>
  }
  return (
    <svg className={className || 'w-4 h-4'} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>
  )
}

export default function MyTasks() {
  var { t } = useLanguage()
  var [tasks, setTasks] = useState([])
  var [loading, setLoading] = useState(true)
  var [loadError, setLoadError] = useState('')
  var [toast, setToast] = useState('')
  var [saving, setSaving] = useState(null)

  var load = useCallback(async function () {
    var { data, error } = await supabase.rpc('my_onboarding_flow')
    setLoadError(error ? error.message : '')
    setTasks(data || [])
    setLoading(false)
  }, [])

  useEffect(function () { load() }, [load])

  function showToast(msg) {
    setToast(msg)
    setTimeout(function () { setToast('') }, 2500)
  }

  async function toggleDone(task) {
    setSaving(task.id)
    var { data, error } = await supabase.rpc('set_task_complete', { p_task_id: task.id, p_done: !task.completed_at })
    setSaving(null)
    if (error) return showToast(error.message)
    if (data && data.all_done) showToast(t('mytasks_all_done_toast'))
    load()
  }

  async function openDoc(doc) {
    var { data, error } = await supabase.storage.from('training-docs').createSignedUrl(doc.file_path, 60 * 5)
    if (error || !data) {
      showToast(t('mytasks_open_err'))
      return
    }
    window.open(data.signedUrl, '_blank', 'noopener')
  }

  // tasks holds the whole sequence (tasks and tests); the first locked step
  // starts the hidden tail.
  var doneCount = tasks.filter(function (x) { return x.done }).length
  var hasTests = tasks.some(function (x) { return x.kind === 'test' })
  var allDone = tasks.length > 0 && doneCount === tasks.length
  var firstLocked = tasks.findIndex(function (x) { return x.locked })
  var visible = firstLocked === -1 ? tasks : tasks.slice(0, firstLocked)
  var lockedCount = firstLocked === -1 ? 0 : tasks.length - firstLocked
  // The step to do next gets the highlight.
  var currentIndex = visible.findIndex(function (x) { return !x.done })

  // Small chip under the card's top row: "Up next" for the current step.
  function UpNext() {
    return <span className="text-[10px] font-bold uppercase tracking-wider text-slate-800 bg-slate-100 px-2 py-0.5 rounded-full">{t('mytasks_up_next')}</span>
  }

  function renderTest(test, i) {
    var scored = test.score != null
    var current = i === currentIndex
    var statusText = scored
      ? t('mytasks_test_scored', { score: test.score, max: test.max_score })
      : test.ready ? t('mytasks_test_ready_chip') : t('mytasks_test_waiting_chip')
    // A test is a checkpoint, not another to-do: it gets a solid coloured
    // header band and a tinted body so it never reads like a task card.
    var band = scored ? 'bg-emerald-600' : test.ready ? 'bg-indigo-600' : 'bg-amber-500'
    var body = scored ? 'bg-emerald-50 border-emerald-200' : test.ready ? 'bg-indigo-50 border-indigo-200' : 'bg-amber-50 border-amber-200'
    return (
      <div className={'rounded-2xl border overflow-hidden shadow-sm ' + body + (current ? ' ring-2 ring-amber-200' : '')}>
          <div className={'flex items-center justify-between gap-2 px-4 py-2 text-white ' + band}>
            <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider">
              <Icon name="test" className="w-4 h-4" />
              {t('mytasks_test_label')}
            </span>
            <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-white/20 shrink-0">{statusText}</span>
          </div>
          <div className="px-4 py-3">
            <h3 className="text-base font-bold text-gray-900 leading-snug">{test.title}</h3>
            {test.description && (
              <p className="text-[13px] text-gray-600 mt-1 leading-relaxed whitespace-pre-line">{test.description}</p>
            )}
            {test.poc_names.length > 0 && (
              <p className="flex items-center gap-1.5 text-xs text-gray-600 mt-2">
                <Icon name="user" className="w-3.5 h-3.5 text-gray-400" />
                <span className="text-gray-500">{t('mytasks_test_taken_by')}:</span>
                <span className="font-medium text-gray-800">{test.poc_names.join(', ')}</span>
              </p>
            )}
            {!scored && (
              <p className="text-xs text-gray-600 mt-3 pt-3 border-t border-black/5">
                {test.ready ? t('mytasks_test_ready_note') : t('mytasks_test_waiting_note')}
              </p>
            )}
          </div>
      </div>
    )
  }

  function renderTask(task, i) {
    var done = !!task.completed_at
    var current = i === currentIndex
    var overdue = !done && task.due_date && isOverdue(task.due_date)
    return (
      <div className={'rounded-2xl border bg-white p-4 shadow-sm ' +
        (current ? 'border-slate-300 ring-2 ring-slate-100' : done ? 'border-gray-100' : 'border-gray-200')}>
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                <Icon name="task" className="w-3.5 h-3.5" />
                {t('mytasks_task_label')}
              </span>
              {current && <UpNext />}
            </div>
            {done ? (
              <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full shrink-0 bg-emerald-50 text-emerald-700">{t('mytasks_done')}</span>
            ) : overdue ? (
              <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full shrink-0 bg-red-50 text-red-700">{t('mytasks_overdue')}</span>
            ) : null}
          </div>
          <h3 className={'text-base font-bold mt-1.5 leading-snug ' + (done ? 'text-gray-500' : 'text-gray-900')}>{task.title}</h3>
          {task.description && !done && (
            <p className="text-[13px] text-gray-600 mt-1 leading-relaxed whitespace-pre-line">{task.description}</p>
          )}

          {!done && <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mt-3 text-xs text-gray-600">
            {task.poc_names.length > 0 && (
              <span className="inline-flex items-center gap-1.5">
                <Icon name="user" className="w-3.5 h-3.5 text-gray-400" />
                <span className="text-gray-400">{t('mytasks_contact')}:</span>
                <span className="font-medium text-gray-700">{task.poc_names.join(', ')}</span>
              </span>
            )}
            <span className={'inline-flex items-center gap-1.5 ' + (overdue ? 'text-red-600 font-medium' : '')}>
              <Icon name="calendar" className={'w-3.5 h-3.5 ' + (overdue ? 'text-red-500' : 'text-gray-400')} />
              {task.due_date ? t('mytasks_due', { date: formatDate(task.due_date) }) : t('mytasks_due_days', { n: task.due_days })}
            </span>
          </div>}

          {task.docs.length > 0 && (
            <div className="mt-3">
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">{t('mytasks_docs')}</p>
              <div className="flex flex-wrap gap-2">
                {task.docs.map(function (d) {
                  return (
                    <button key={d.id} onClick={function () { openDoc(d) }}
                      className="inline-flex items-center gap-2 pl-2 pr-3 py-1.5 rounded-lg border border-gray-200 bg-gray-50 hover:bg-gray-100 transition-colors text-left">
                      <span className={'text-[9px] font-bold uppercase px-1.5 py-0.5 rounded ' +
                        (d.file_type === 'pdf' ? 'text-red-700 bg-red-100' : 'text-blue-700 bg-blue-100')}>{d.file_type}</span>
                      <span className="text-xs font-medium text-slate-800">{d.title}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {done ? (
            <div className="mt-2 flex justify-end">
              <button onClick={function () { toggleDone(task) }} disabled={saving === task.id}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-gray-500 hover:text-gray-800 hover:bg-gray-50 rounded-lg disabled:opacity-50">
                <Icon name="undo" className="w-3.5 h-3.5" />
                {t('mytasks_undo')}
              </button>
            </div>
          ) : (
            <button onClick={function () { toggleDone(task) }} disabled={saving === task.id}
              className="mt-4 w-full inline-flex items-center justify-center gap-1.5 px-4 py-2.5 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl transition-colors disabled:opacity-50">
              <Icon name="check" className="w-4 h-4" />
              {t('mytasks_mark_done')}
            </button>
          )}
      </div>
    )
  }

  if (loading) {
    return <p className="text-sm text-gray-400 text-center py-12">{t('loading')}</p>
  }

  return (
    <div className="max-w-2xl mx-auto">
      <h2 className="text-xl font-bold text-gray-900">{t('mytasks_title')}</h2>

      {tasks.length > 0 && (
        <div className="mt-3 mb-5 bg-white border border-gray-200 rounded-2xl p-4 shadow-sm">
          <div className="flex items-baseline justify-between">
            <p className="text-sm font-semibold text-gray-800">{t('mytasks_progress_steps', { done: doneCount, total: tasks.length })}</p>
            <p className="text-xs font-bold text-emerald-600">{Math.round(doneCount / tasks.length * 100)}%</p>
          </div>
          <div className="mt-2 h-2 rounded-full bg-gray-100 overflow-hidden">
            <div className="h-full rounded-full bg-emerald-500 transition-all duration-500"
              style={{ width: (doneCount / tasks.length * 100) + '%' }} />
          </div>
        </div>
      )}
      {tasks.length === 0 && <div className="mb-4" />}

      {loadError && (
        <div className="px-3 py-2 mb-4 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-xs text-red-600">{loadError}</p>
        </div>
      )}

      {tasks.length === 0 && !loadError && (
        <div className="bg-white border border-gray-200 rounded-2xl p-8 text-center">
          <p className="text-sm text-gray-400">{t('mytasks_empty')}</p>
        </div>
      )}

      {/* Numbered timeline: a marker per step on the left, joined by a line */}
      <div>
        {visible.map(function (step, i) {
          var isTest = step.kind === 'test'
          var done = isTest ? step.score != null : !!step.completed_at
          var current = i === currentIndex
          var isLast = i === visible.length - 1 && lockedCount === 0
          var markerCls = done
            ? 'bg-emerald-500 text-white'
            : current
              ? (isTest ? 'bg-amber-500 text-white' : 'bg-slate-800 text-white')
              : isTest
                ? 'bg-amber-50 text-amber-700 border border-amber-300'
                : 'bg-white text-gray-500 border border-gray-300'
          return (
            <div key={step.kind + step.id} className="flex gap-3">
              <div className="flex flex-col items-center shrink-0">
                <span className={'w-7 h-7 inline-flex items-center justify-center text-xs font-bold mt-3 ' +
                  (isTest ? 'rounded-lg ' : 'rounded-full ') + markerCls}>
                  {done ? <Icon name="check" className="w-3.5 h-3.5" />
                    : isTest ? <Icon name="test" className="w-3.5 h-3.5" />
                    : i + 1}
                </span>
                {!isLast && <span className={'flex-1 w-0.5 mt-1 ' + (done ? 'bg-emerald-200' : 'bg-gray-200')} />}
              </div>
              <div className="flex-1 min-w-0 pb-3">
                {isTest ? renderTest(step, i) : renderTask(step, i)}
              </div>
            </div>
          )
        })}

        {/* What comes after a test the joiner has not been marked on yet */}
        {lockedCount > 0 && (
          <div className="flex gap-3">
            <span className="w-7 h-7 rounded-full bg-gray-100 text-gray-400 inline-flex items-center justify-center shrink-0 mt-2">
              <Icon name="lock" className="w-3.5 h-3.5" />
            </span>
            <div className="flex-1 rounded-2xl border border-dashed border-gray-300 bg-gray-50 px-4 py-3">
              <p className="text-xs text-gray-600">{t('mytasks_locked', { n: lockedCount })}</p>
            </div>
          </div>
        )}
      </div>

      {tasks.length > 0 && !hasTests && (
        <div className="mt-3 flex items-start gap-3 bg-indigo-50 border border-indigo-100 rounded-2xl p-4">
          <Icon name="test" className="w-5 h-5 text-indigo-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-bold text-indigo-900">{t('mytasks_test_title')}</p>
            <p className="text-xs text-indigo-700 mt-0.5">{allDone ? t('mytasks_test_ready_body') : t('mytasks_test_body')}</p>
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 bg-slate-800 text-white px-5 py-3 rounded-xl text-sm shadow-lg z-50">
          {toast}
        </div>
      )}
    </div>
  )
}
