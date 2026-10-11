// MarkTests.jsx
// Mobile "Tests to Mark" screen (/mark-tests). Shows every onboarding test the
// logged-in employee is the marker for, with the new joiners in that test's
// departments; the marker enters a score (and optional remarks) per joiner.
// Data + permission checks live in the tests_to_mark() / submit_test_score()
// RPCs — see migration 20261008060000_onboarding_test_results.sql.

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

export default function MarkTests() {
  var { t } = useLanguage()
  var navigate = useNavigate()
  var [groups, setGroups] = useState([])
  var [loading, setLoading] = useState(true)
  var [loadError, setLoadError] = useState('')
  var [toast, setToast] = useState('')

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
    return <p className="text-sm text-gray-400 text-center py-12">{t('loading')}</p>
  }

  return (
    <div>
      <button onClick={function () { navigate('/') }} className="text-xs text-gray-500 mb-3">← {t('back')}</button>
      <h2 className="text-lg font-bold text-gray-900 mb-4">{t('mt_title')}</h2>

      {loadError && (
        <div className="px-3 py-2 mb-4 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-xs text-red-600">{loadError}</p>
        </div>
      )}

      {groups.length === 0 && !loadError && (
        <div className="bg-white border border-gray-200 rounded-2xl p-8 text-center">
          <p className="text-sm text-gray-400">{t('mt_empty')}</p>
        </div>
      )}

      <div className="space-y-4">
        {groups.map(function (g) {
          var done = g.joiners.filter(function (j) { return j.score != null }).length
          return (
            <div key={g.test.id} className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-sm font-bold text-gray-900">{g.test.title}</h3>
                  <span className="text-[11px] font-semibold text-gray-500 shrink-0">
                    {t('mt_marked_count', { done: done, total: g.joiners.length })}
                  </span>
                </div>
                {g.test.description && <p className="text-xs text-gray-500 mt-1 whitespace-pre-line">{g.test.description}</p>}
              </div>
              <div className="divide-y divide-gray-100">
                {g.joiners.map(function (j) {
                  return (
                    <JoinerRow key={j.employee_id} joiner={j} maxScore={g.test.max_score} testId={g.test.id}
                      onSaved={function () { showToast(t('mt_saved')); load() }} />
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>

      {toast && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 bg-slate-800 text-white px-5 py-3 rounded-xl text-sm shadow-lg z-50">
          {toast}
        </div>
      )}
    </div>
  )
}

function JoinerRow({ joiner, maxScore, testId, onSaved }) {
  var { t } = useLanguage()
  var scored = joiner.score != null
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
    onSaved()
  }

  return (
    <div className="px-4 py-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-gray-900 truncate">{joiner.employee_name}</p>
          <p className="text-[11px] text-gray-400">
            {[joiner.emp_code, joiner.department_name, t('mt_joined', { date: formatDate(joiner.date_of_joining) })].filter(Boolean).join(' · ')}
          </p>
        </div>
        {scored && !editing && (
          <div className="text-right shrink-0">
            <p className="text-sm font-bold text-emerald-700">{joiner.score}<span className="text-gray-400 font-normal"> / {maxScore}</span></p>
            <button onClick={function () { setEditing(true) }} className="text-[11px] text-slate-600 underline">{t('mt_edit')}</button>
          </div>
        )}
      </div>

      {scored && !editing && joiner.remarks && (
        <p className="text-xs text-gray-500 mt-1.5 whitespace-pre-line">{joiner.remarks}</p>
      )}

      {editing && (
        <div className="mt-2.5 space-y-2">
          <div className="flex items-center gap-2">
            <input type="number" inputMode="numeric" min={0} max={maxScore} step={1} value={score}
              onChange={function (e) { setScore(e.target.value) }} placeholder={t('mt_score')}
              className="w-20 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-700" />
            <span className="text-sm text-gray-500">/ {maxScore}</span>
          </div>
          <input type="text" value={remarks} onChange={function (e) { setRemarks(e.target.value) }}
            placeholder={t('mt_remarks')} maxLength={300}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-700" />
          {error && <p className="text-xs text-red-600">{error}</p>}
          <div className="flex gap-2">
            {scored && (
              <button onClick={function () { setEditing(false); setScore(String(joiner.score)); setRemarks(joiner.remarks || ''); setError('') }}
                className="flex-1 py-2 text-sm text-gray-600 bg-gray-100 rounded-lg">{t('cancel')}</button>
            )}
            <button onClick={handleSave} disabled={saving}
              className="flex-1 py-2 text-sm text-white bg-slate-800 rounded-lg font-semibold disabled:opacity-40">
              {saving ? t('saving') : t('save')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
