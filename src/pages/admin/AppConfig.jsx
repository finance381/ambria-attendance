import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'

var CONFIG_FIELDS = [
  {
    key: 'claim_limit',
    label: 'Monthly Claim Limit',
    desc: 'Max missed-punch claims any employee can submit per month. Applies to all roles equally.',
    type: 'int',
    min: 0,
    max: 99,
    unit: 'claims/month',
    fallback: '4'
  },
  {
    key: 'half_day_threshold_hours',
    label: 'Present — Minimum Hours',
    desc: 'Total worked hours ≥ this value marks the day as Present.',
    type: 'float',
    min: 0.5,
    max: 24,
    step: 0.5,
    unit: 'hours',
    fallback: '4'
  },
  {
    key: 'absent_threshold_hours',
    label: 'Half Day — Minimum Hours',
    desc: 'Total worked hours ≥ this value (but below Present threshold) marks the day as Half Day. Below this = Absent.',
    type: 'float',
    min: 0,
    max: 24,
    step: 0.5,
    unit: 'hours',
    fallback: '0.5'
  },
  {
    key: 'annual_leaves',
    label: 'Annual Leaves',
    desc: 'Total leave days per employee per fiscal year (April–March). Each Absent day deducts 1 leave.',
    type: 'int',
    min: 0,
    max: 365,
    unit: 'leaves/year',
    fallback: '24'
  },
  {
    key: 'annual_half_days',
    label: 'Annual Half Days',
    desc: 'Total half-day allowance per employee per fiscal year (April–March).',
    type: 'int',
    min: 0,
    max: 99,
    unit: 'half days/year',
    fallback: '6'
  },
]

export default function AppConfig() {
  var [values, setValues] = useState({})
  var [original, setOriginal] = useState({})
  var [loading, setLoading] = useState(true)
  var [saving, setSaving] = useState(false)
  var [toast, setToast] = useState('')
  var [error, setError] = useState('')

  var showToast = useCallback(function (msg) {
    setToast(msg)
    setTimeout(function () { setToast('') }, 2500)
  }, [])

  var loadConfig = useCallback(async function () {
    var keys = CONFIG_FIELDS.map(function (f) { return f.key })
    var { data, error: fetchErr } = await supabase
      .from('app_config')
      .select('key, value')
      .in('key', keys)

    var map = {}
    CONFIG_FIELDS.forEach(function (f) { map[f.key] = f.fallback })
    if (data) {
      data.forEach(function (row) { map[row.key] = row.value })
    }
    setValues(map)
    setOriginal(map)
    setLoading(false)
    if (fetchErr) setError(fetchErr.message)
  }, [])

  useEffect(function () { loadConfig() }, [loadConfig])

  function handleChange(key, val) {
    setValues(function (prev) { return { ...prev, [key]: val } })
  }

  var hasChanges = CONFIG_FIELDS.some(function (f) {
    return values[f.key] !== original[f.key]
  })

  async function handleSave() {
    setError('')

    // Validate half day < present
    var present = parseFloat(values.half_day_threshold_hours)
    var halfday = parseFloat(values.absent_threshold_hours)
    if (isNaN(present) || isNaN(halfday)) return setError('Thresholds must be valid numbers')
    if (halfday >= present) return setError('Half Day hours must be less than Present hours')

    var claimLimit = parseInt(values.claim_limit, 10)
    if (isNaN(claimLimit) || claimLimit < 0) return setError('Claim limit must be 0 or more')

    setSaving(true)

    // Upsert each changed key
    var changed = CONFIG_FIELDS.filter(function (f) {
      return values[f.key] !== original[f.key]
    })

    for (var i = 0; i < changed.length; i++) {
      var f = changed[i]
      var { error: upsertErr } = await supabase
        .from('app_config')
        .upsert({ key: f.key, value: values[f.key] }, { onConflict: 'key' })

      if (upsertErr) {
        setSaving(false)
        return setError('Failed to save ' + f.label + ': ' + upsertErr.message)
      }
    }

    setSaving(false)
    setOriginal({ ...values })
    showToast(changed.length + ' setting' + (changed.length > 1 ? 's' : '') + ' saved')
  }

  if (loading) {
    return <p className="text-sm text-gray-400 text-center py-12">Loading…</p>
  }

  return (
    <div>
      <div className="mb-5">
        <h2 className="text-lg font-bold text-gray-900">App Configuration</h2>
        <p className="text-xs text-gray-500">
          System-wide settings that control attendance rules and claim limits for all employees.
        </p>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl shadow-sm divide-y divide-gray-100">
        {CONFIG_FIELDS.map(function (f) {
          var val = values[f.key] || ''
          var changed = val !== original[f.key]

          return (
            <div key={f.key} className="px-5 py-4 flex items-start gap-6">
              <div className="flex-1 min-w-0">
                <label className="block text-sm font-semibold text-gray-900 mb-0.5">
                  {f.label}
                  {changed && (
                    <span className="ml-2 text-[10px] font-bold uppercase text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded-full">
                      modified
                    </span>
                  )}
                </label>
                <p className="text-xs text-gray-500 leading-relaxed">{f.desc}</p>
              </div>
              <div className="w-28 flex-shrink-0">
                <input
                  type="number"
                  value={val}
                  min={f.min}
                  max={f.max}
                  step={f.step || 1}
                  onChange={function (e) { handleChange(f.key, e.target.value) }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-right font-mono focus:outline-none focus:ring-2 focus:ring-slate-700"
                />
                <p className="text-[10px] text-gray-400 text-right mt-1">
                  {f.unit}
                </p>
              </div>
            </div>
          )
        })}
      </div>

      {error && (
        <div className="mt-4 px-4 py-3 bg-red-50 border border-red-200 rounded-xl">
          <p className="text-xs text-red-600">{error}</p>
        </div>
      )}

      <div className="mt-4 flex items-center justify-between">
        <p className="text-[10px] text-gray-400">
          Changes take effect immediately for all new attendance calculations.
        </p>
        <button
          onClick={handleSave}
          disabled={!hasChanges || saving}
          className="px-5 py-2.5 text-sm text-white bg-slate-800 rounded-lg hover:bg-slate-900 disabled:opacity-40 transition-colors font-medium"
        >
          {saving ? 'Saving…' : 'Save Changes'}
        </button>
      </div>

      {toast && (
        <div className="fixed bottom-6 right-6 bg-slate-800 text-white px-5 py-3 rounded-xl text-sm shadow-lg z-50">
          ✓ {toast}
        </div>
      )}
    </div>
  )
}

