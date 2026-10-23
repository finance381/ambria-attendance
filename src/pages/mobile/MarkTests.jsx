// MarkTests.jsx
// Mobile "Tests to Mark" screen (/mark-tests). Shows every onboarding test the
// logged-in employee is the marker for, with the new joiners in that test's
// departments; the marker enters a score (and optional remarks) per joiner.
// Data + permission checks live in the tests_to_mark() / submit_test_score()
// RPCs — see migration 20261008060000_onboarding_test_results.sql.
// Layout: title, stats card (pending / marked / average), then per test
// a header card (collapsible)
// followed by one card per joiner. Pending joiners open with the score form;
// marked ones show their score and expand for remarks.
// Styling: soft neumorphism — raised .neu cards, pressed-in .neu-inset inputs.

import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useLanguage } from '../../lib/i18n'

// Group the flat RPC rows into [{ test, joiners: [...] }].
function groupByTest(rows) {
  var map = {}
  var order = []
  rows.forEach(function (r) {
    if (!map[r.test_id]) {
      map[r.test_id] = {
        test: { id: r.test_id, title: r.title, description: r.description, max_score: r.max_score },
        joiners: []
      }
      order.push(r.test_id)
    }
    map[r.test_id].joiners.push(r)
  })
  return order.map(function (id) { return map[id] })
}

function formatDate(d) {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
}

// Small stroke icons (24x24), same style as MyTasks.
function Icon({ name, className }) {
  var paths = {
    back: <path d="M15 18l-6-6 6-6" />,
    check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
    checkCircle: <><circle cx="12" cy="12" r="9" /><path d="M8.5 12.5l2.5 2.5 4.5-5" /></>,
    test: <><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" /><rect x="9" y="3" width="6" height="4" rx="1" /><path d="M9 13h6M9 17h4" /></>,
    chart: <path d="M6 20V14M12 20V8M18 20V4" />,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    edit: <><path d="M4 20h4L19 9l-4-4L4 16z" /><path d="M14 6l4 4" /></>,
    chevron: <path d="M9 6l6 6-6 6" />,
    chevronDown: <path d="M6 9l6 6 6-6" />
  }
  return (
    <svg className={className || 'w-4 h-4'} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>
  )
}

// Marked / total as a small ring, used in each test card's header.
function ProgressRing({ done, total }) {
  var r = 15
  var c = 2 * Math.PI * r
  var frac = total ? done / total : 0
  return (
    <div className="relative w-11 h-11 shrink-0">
      <svg viewBox="0 0 36 36" className="w-11 h-11 -rotate-90">
        <circle cx="18" cy="18" r={r} fill="none" stroke="currentColor" strokeWidth="3" className="text-slate-300/60" />
        <circle cx="18" cy="18" r={r} fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - frac)}
          className={'transition-all duration-500 ' + (frac === 1 ? 'text-emerald-500' : 'text-amber-500')} />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-[11px] font-semibold text-gray-700 tabular-nums">
        {done}/{total}
      </span>
    </div>
  )
}

export default function MarkTests() {
  var { t } = useLanguage()
  var navigate = useNavigate()
  var [groups, setGroups] = useState([])
  var [loading, setLoading] = useState(true)
  var [loadError, setLoadError] = useState('')
  var [toast, setToast] = useState('')
  // Test ids whose joiner list is folded away
  var [collapsed, setCollapsed] = useState({})

  var showToast = useCallback(function (msg) {
    setToast(msg)
    setTimeout(function () { setToast('') }, 2500)
  }, [])

  var load = useCallback(async function () {
    var { data, error } = await supabase.rpc('tests_to_mark')
    setLoadError(error ? error.message : '')
    setGroups(groupByTest(data || []))
    setLoading(false)
  }, [])

  useEffect(function () { load() }, [load])

  if (loading) {
    return <p className="text-sm text-slate-500 text-center py-12">{t('loading')}</p>
  }

  // Stats across every test: pending, marked, and the average as a % of max
  var pendingTotal = 0
  var markedTotal = 0
  var pctSum = 0
  groups.forEach(function (g) {
    g.joiners.forEach(function (j) {
      if (j.score == null) { pendingTotal++; return }
      markedTotal++
      pctSum += g.test.max_score ? j.score / g.test.max_score : 0
    })
  })
  var avgPct = markedTotal ? Math.round(pctSum / markedTotal * 100) : null

  var stats = [
    { label: t('mt_stat_pending'), value: pendingTotal, icon: 'test', tile: 'neu-sm text-amber-600' },
    { label: t('mt_stat_marked'), value: markedTotal, icon: 'checkCircle', tile: 'neu-sm text-emerald-600' },
    { label: t('mt_stat_avg'), value: avgPct == null ? '—' : avgPct + '%', icon: 'chart', tile: 'neu-sm text-violet-600' }
  ]

  return (
    <div className="max-w-2xl mx-auto">
      <button onClick={function () { navigate('/') }}
        className="inline-flex items-center gap-1 text-xs font-medium text-slate-600 hover:text-slate-900 mb-2">
        <Icon name="back" className="w-3.5 h-3.5" />
        {t('back')}
      </button>

      <h2 className="text-[22px] font-bold text-slate-900 tracking-tight leading-tight">{t('mt_title')}</h2>

      {groups.length > 0 && (
        <div className="mt-4 mb-4 grid grid-cols-3 neu rounded-2xl text-gray-900 overflow-hidden">
          {stats.map(function (s, i) {
            return (
              <div key={s.label} className={'flex items-center gap-2 px-2.5 py-3.5 ' + (i > 0 ? 'border-l border-slate-300/50' : '')}>
                <span className={'w-8 h-8 rounded-lg inline-flex items-center justify-center shrink-0 ' + s.tile}>
                  <Icon name={s.icon} className="w-4 h-4" />
                </span>
                <div className="min-w-0">
                  <p className="text-lg font-bold tabular-nums leading-none">{s.value}</p>
                  <p className="text-[10px] text-slate-500 mt-1 truncate">{s.label}</p>
                </div>
              </div>
            )
          })}
        </div>
      )}
      {groups.length === 0 && <div className="mb-4" />}

      {loadError && (
        <div className="px-3 py-2 mb-4 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-xs text-red-600">{loadError}</p>
        </div>
      )}

      {groups.length === 0 && !loadError && (
        <div className="neu rounded-2xl p-8 text-center">
          <p className="text-sm text-slate-500">{t('mt_empty')}</p>
        </div>
      )}

      <div className="space-y-5">
        {groups.map(function (g) {
          var done = g.joiners.filter(function (j) { return j.score != null }).length
          var total = g.joiners.length
          var isOpen = !collapsed[g.test.id]
          // Joiners still waiting for a score first, then the marked ones
          var sorted = g.joiners.slice().sort(function (a, b) {
            return (a.score == null ? 0 : 1) - (b.score == null ? 0 : 1)
          })
          return (
            <section key={g.test.id} className="space-y-2.5">
              <button
                onClick={function () { setCollapsed(Object.assign({}, collapsed, { [g.test.id]: isOpen })) }}
                className="w-full text-left flex items-center gap-3 neu rounded-2xl px-4 py-3.5">
                <span className="w-11 h-11 rounded-xl neu-sm text-amber-600 inline-flex items-center justify-center shrink-0">
                  <Icon name="test" className="w-5 h-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <h3 className="text-[15px] font-bold text-gray-900 truncate leading-tight">{g.test.title}</h3>
                  <p className="flex items-center gap-1.5 mt-1 text-[11px] text-gray-500">
                    <span className="font-bold uppercase tracking-wide text-orange-700 bg-orange-50 px-1.5 py-0.5 rounded">{t('mytasks_test_label')}</span>
                    <span className="truncate">{t('mt_joiners', { n: total })} · {t('mt_max', { max: g.test.max_score })}</span>
                  </p>
                </div>
                <ProgressRing done={done} total={total} />
                <Icon name="chevron" className={'w-4 h-4 text-slate-500 shrink-0 transition-transform ' + (isOpen ? 'rotate-90' : '')} />
              </button>
              {g.test.description && isOpen && (
                <p className="px-1 text-xs text-gray-500 leading-relaxed whitespace-pre-line">{g.test.description}</p>
              )}

              {isOpen && sorted.map(function (j) {
                return (
                  <JoinerCard key={j.employee_id} joiner={j} maxScore={g.test.max_score} testId={g.test.id}
                    onSaved={function () { showToast(t('mt_saved')); load() }} />
                )
              })}
            </section>
          )
        })}
      </div>

      {toast && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 bg-slate-800 text-white px-5 py-3 rounded-xl text-sm shadow-lg z-50">
          {toast}
        </div>
      )}
    </div>
  )
}

function JoinerCard({ joiner, maxScore, testId, onSaved }) {
  var { t } = useLanguage()
  var scored = joiner.score != null
  // Pending joiners start open on the score form; marked ones start folded
  var [open, setOpen] = useState(!scored)
  var [editing, setEditing] = useState(!scored)
  var [score, setScore] = useState(scored ? String(joiner.score) : '')
  var [remarks, setRemarks] = useState(joiner.remarks || '')
  var [saving, setSaving] = useState(false)
  var [error, setError] = useState('')

  async function handleSave() {
    setError('')
    var n = Number(score)
    if (score === '' || !Number.isInteger(n) || n < 0 || n > maxScore) {
      return setError(t('mt_err_score', { max: maxScore }))
    }
    setSaving(true)
    var { error: rpcErr } = await supabase.rpc('submit_test_score', {
      p_test_id: testId,
      p_employee_id: joiner.employee_id,
      p_score: n,
      p_remarks: remarks
    })
    setSaving(false)
    if (rpcErr) return setError(rpcErr.message)
    setEditing(false)
    setOpen(false)
    onSaved()
  }

  function startEdit() {
    setOpen(true)
    setEditing(true)
  }

  function cancelEdit() {
    setEditing(false)
    setScore(String(joiner.score))
    setRemarks(joiner.remarks || '')
    setError('')
  }

  var initials = (joiner.employee_name || '?').trim().split(/\s+/).slice(0, 2)
    .map(function (w) { return w[0] }).join('').toUpperCase()
  // Score colour by percentage: 60%+ green, 40%+ amber, below that red
  var pct = scored ? joiner.score / maxScore : 0
  var scoreCls = pct >= 0.6 ? 'bg-emerald-50 text-emerald-700 ring-emerald-200'
    : pct >= 0.4 ? 'bg-amber-50 text-amber-700 ring-amber-200'
    : 'bg-red-50 text-red-700 ring-red-200'
  var showForm = open && editing

  return (
    <div className={'neu rounded-2xl overflow-hidden ' +
      (showForm ? 'outline-2 outline-violet-300/70' : '')}>
      <div className="flex items-center gap-3 px-4 py-3">
        <span className={'w-10 h-10 rounded-full text-sm font-bold inline-flex items-center justify-center shrink-0 ' +
          (scored ? 'bg-sky-100 text-sky-800' : 'bg-violet-100 text-violet-700')}>
          {initials}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-gray-900 truncate leading-tight">{joiner.employee_name}</p>
          <p className="text-[11px] text-gray-500 truncate mt-1">
            {[joiner.emp_code, joiner.department_name, t('mt_joined', { date: formatDate(joiner.date_of_joining) })].filter(Boolean).join(' · ')}
          </p>
        </div>
        {scored ? (
          <div className="flex items-center gap-1.5 shrink-0">
            <span className={'text-sm font-bold tabular-nums px-2 py-1 rounded-lg ring-1 mr-1 ' + scoreCls}>
              {joiner.score} <span className="font-medium opacity-70">/ {maxScore}</span>
            </span>
            <button onClick={startEdit} aria-label={t('mt_edit')}
              className="w-7 h-7 inline-flex items-center justify-center rounded-lg neu-press text-gray-600">
              <Icon name="edit" className="w-4 h-4" />
            </button>
            <button onClick={function () { setOpen(!open); if (open) cancelEdit() }} aria-label={t('mt_details')}
              className="w-7 h-7 inline-flex items-center justify-center rounded-lg neu-press text-gray-600">
              <Icon name="chevron" className={'w-4 h-4 transition-transform ' + (open ? 'rotate-90' : '')} />
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-1 shrink-0">
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-lg bg-orange-50 text-orange-700 ring-1 ring-inset ring-orange-200/80">
              <Icon name="clock" className="w-3.5 h-3.5" />
              {t('mt_stat_pending')}
            </span>
            <button onClick={function () { setOpen(!open) }} aria-label={t('mt_details')}
              className="w-7 h-7 inline-flex items-center justify-center rounded-lg neu-press text-violet-600">
              <Icon name="chevronDown" className={'w-4 h-4 transition-transform ' + (open ? 'rotate-180' : '')} />
            </button>
          </div>
        )}
      </div>

      {/* Marked, opened: the remarks they were given */}
      {open && scored && !editing && (
        <div className="mx-3 mb-3 px-3 py-2.5 rounded-xl neu-inset text-xs text-gray-600 whitespace-pre-line">
          {joiner.remarks ? joiner.remarks : <span className="text-slate-500">{t('mt_no_remarks')}</span>}
        </div>
      )}

      {showForm && (
        <div className="mx-3 mb-3 p-1">
          <div className="flex gap-2.5">
            <label className="w-24 shrink-0">
              <span className="block text-[11px] font-medium text-gray-600 mb-1">{t('mt_score')}</span>
              <span className="h-10 flex items-center border-0 neu-inset rounded-xl focus-within:outline-2 focus-within:outline-blue-400/60">
                <input type="number" inputMode="numeric" min={0} max={maxScore} step={1} value={score}
                  onChange={function (e) { setScore(e.target.value) }}
                  className="w-full min-w-0 pl-2.5 bg-transparent text-base font-semibold text-gray-900 focus:outline-none" />
                <span className="pr-2.5 text-sm text-slate-500 shrink-0">/ {maxScore}</span>
              </span>
            </label>
            <label className="flex-1 min-w-0">
              <span className="block text-[11px] font-medium text-gray-600 mb-1">{t('mt_remarks')}</span>
              <input type="text" value={remarks} onChange={function (e) { setRemarks(e.target.value) }}
                placeholder={t('mt_remarks_ph')} maxLength={300}
                className="w-full h-10 px-2.5 border-0 neu-inset rounded-xl text-base text-gray-900 placeholder:text-sm placeholder:text-slate-500 outline-none focus:outline-2 focus:outline-blue-400/60" />
            </label>
          </div>
          {error && <p className="text-xs text-red-600 mt-2">{error}</p>}
          <div className="flex justify-end gap-2 mt-3">
            {scored && (
              <button onClick={cancelEdit}
                className="h-9 px-4 text-sm font-medium text-gray-700 neu-press rounded-xl">
                {t('cancel')}
              </button>
            )}
            <button onClick={handleSave} disabled={saving}
              className="h-9 px-5 inline-flex items-center gap-1.5 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-md shadow-blue-600/30 disabled:opacity-40">
              <Icon name="check" className="w-4 h-4" />
              {saving ? t('saving') : t('save')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
