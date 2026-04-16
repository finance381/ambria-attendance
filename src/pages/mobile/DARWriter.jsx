import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/useAuth'
import { useLanguage } from '../../lib/i18n'


function formatDate(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')
}

function formatTime12(t) {
  if (!t) return '—'
  var parts = t.split(':')
  var h = parseInt(parts[0], 10)
  var m = parts[1]
  var ampm = h >= 12 ? 'PM' : 'AM'
  h = h % 12 || 12
  return h + ':' + m + ' ' + ampm
}

function formatDisplayDate(dateStr) {
  var d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function DARWriter() {
  var { employee, session } = useAuth()
  var { t } = useLanguage()

  if (employee.emp_code !== 'AMB001') {
   return <Navigate to="/" replace />
 }

  var [selectedDate, setSelectedDate] = useState(formatDate(new Date()))
  var [punchIn, setPunchIn] = useState('')
  var [punchOut, setPunchOut] = useState('')
  var [punchManual, setPunchManual] = useState(false)
  var [tasks, setTasks] = useState('')
  var [loading, setLoading] = useState(false)
  var [saving, setSaving] = useState(false)
  var [existingDAR, setExistingDAR] = useState(null)
  var [history, setHistory] = useState([])
  var [historyLoading, setHistoryLoading] = useState(true)
  var [toast, setToast] = useState('')
  var [error, setError] = useState('')

  // Confirmation flow: null → 'first' → 'final'
  var [confirmStep, setConfirmStep] = useState(null)

  var showToast = useCallback(function (msg) {
    setToast(msg)
    setTimeout(function () { setToast('') }, 3000)
  }, [])

  // Fetch punches for selected date
  var fetchPunches = useCallback(async function (date) {
    setLoading(true)
    setExistingDAR(null)
    setPunchIn('')
    setPunchOut('')
    setPunchManual(false)
    setTasks('')
    setError('')
    setConfirmStep(null)

    var userId = session.user.id

    // Check if DAR already exists
    var { data: dar } = await supabase
      .from('daily_reports')
      .select('*')
      .eq('emp_code', employee.emp_code)
      .eq('report_date', date)
      .maybeSingle()

    if (dar) {
      setExistingDAR(dar)
      setLoading(false)
      return
    }

    // Fetch punches
    var { data: punches } = await supabase
      .from('punches')
      .select('punch_type, punched_at')
      .eq('employee_id', userId)
      .eq('attendance_date', date)
      .order('punched_at')

    if (punches && punches.length > 0) {
      var inPunch = punches.find(function (p) { return p.punch_type === 'in' })
      var outPunch = null
      for (var i = punches.length - 1; i >= 0; i--) {
        if (punches[i].punch_type === 'out') { outPunch = punches[i]; break }
      }

      if (inPunch) {
        var inTime = new Date(inPunch.punched_at)
        var hh = String(inTime.getHours()).padStart(2, '0')
        var mm = String(inTime.getMinutes()).padStart(2, '0')
        setPunchIn(hh + ':' + mm)
      }
      if (outPunch) {
        var outTime = new Date(outPunch.punched_at)
        var hh2 = String(outTime.getHours()).padStart(2, '0')
        var mm2 = String(outTime.getMinutes()).padStart(2, '0')
        setPunchOut(hh2 + ':' + mm2)
      }
      setPunchManual(false)
    } else {
      setPunchManual(true)
    }

    setLoading(false)
  }, [session, employee])

  // Load history
  var loadHistory = useCallback(async function () {
    setHistoryLoading(true)
    var { data } = await supabase
      .from('daily_reports')
      .select('report_date, punch_in, punch_out, tasks, submitted_at')
      .eq('emp_code', employee.emp_code)
      .order('report_date', { ascending: false })
      .limit(30)

    setHistory(data || [])
    setHistoryLoading(false)
  }, [employee])

  useEffect(function () { fetchPunches(selectedDate) }, [selectedDate, fetchPunches])
  useEffect(function () { loadHistory() }, [loadHistory])

  function handleDateChange(e) {
    setSelectedDate(e.target.value)
  }

  function handleSubmitClick() {
    setError('')
    if (!tasks.trim()) {
      setError(t('dar_err_tasks'))
      return
    }
    if (!punchIn) {
      setError(t('dar_err_punchin'))
      return
    }
    setConfirmStep('preview')
  }

  async function handleFinalSubmit() {
    setSaving(true)
    setError('')

    var { error: insertErr } = await supabase
      .from('daily_reports')
      .insert({
        emp_code: employee.emp_code,
        report_date: selectedDate,
        punch_in: punchIn,
        punch_out: punchOut || null,
        punch_times_manual: punchManual,
        tasks: tasks.trim()
      })

    setSaving(false)

    if (insertErr) {
      if (insertErr.code === '23505') {
        setError(t('dar_exists'))
      } else {
        setError(insertErr.message)
      }
      setConfirmStep(null)
      return
    }

    setConfirmStep(null)
    showToast(t('dar_submitted'))
    fetchPunches(selectedDate)
    loadHistory()
  }

  // Format tasks as bullets for preview
  function formatTasksBullets(text) {
    return text.split('\n').filter(function (l) { return l.trim() }).map(function (l) {
      var line = l.trim()
      if (line.startsWith('•') || line.startsWith('-') || line.startsWith('*')) {
        return '• ' + line.slice(1).trim()
      }
      return '• ' + line
    })
  }

  // ── Render existing DAR (read-only) ──
  if (!loading && existingDAR) {
    var bullets = formatTasksBullets(existingDAR.tasks)
    return (
      <div className="space-y-4">
        <h2 className="text-lg font-bold text-slate-800">{t('dar_title')}</h2>

        <div className="flex items-center gap-2">
          <input type="date" value={selectedDate} onChange={handleDateChange}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm flex-1" />
        </div>

        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 space-y-3">
          <div className="flex items-center gap-2 text-emerald-700 text-xs font-medium">
            <span>✅</span> {t('dar_exists')}
          </div>

          <div className="bg-white rounded-lg p-3 space-y-2 text-sm">
            <p className="font-semibold text-slate-700">DAR: {formatDisplayDate(existingDAR.report_date)}</p>
            <p className="text-slate-600">{t('dar_punch_in')}: {formatTime12(existingDAR.punch_in)}</p>
            <div>
              <p className="text-slate-600 font-medium mb-1">{t('dar_tasks')}:</p>
              {bullets.map(function (b, i) {
                return <p key={i} className="text-slate-600 pl-1">{b}</p>
              })}
            </div>
            <p className="text-slate-600">{t('dar_punch_out')}: {formatTime12(existingDAR.punch_out)}</p>
          </div>
        </div>

        {renderHistory()}
      </div>
    )
  }

  // ── Confirmation modal ──
  function renderConfirmation() {
    if (!confirmStep) return null

    var bullets = formatTasksBullets(tasks)

    if (confirmStep === 'preview') {
     return (
       <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
         <div className="bg-white rounded-2xl p-5 w-full max-w-sm space-y-4 max-h-[80vh] overflow-y-auto">
           <h3 className="text-base font-bold text-slate-800">{t('dar_preview')}</h3>

           <div className="bg-gray-50 rounded-lg p-4 space-y-2 text-sm border font-mono">
             <p className="font-semibold">DAR: {formatDisplayDate(selectedDate)}</p>
             <p>Name: {employee.name}</p>
             <p></p>
             <p>{t('dar_punch_in')}: {formatTime12(punchIn)}</p>
             <p></p>
             <p className="font-medium">{t('dar_tasks')}:</p>
             {bullets.map(function (b, i) {
               return <p key={i}>{b}</p>
             })}
             <p></p>
             {punchOut && <p>{t('dar_punch_out')}: {formatTime12(punchOut)}</p>}
           </div>

           <div className="flex gap-3">
             <button onClick={function () { setConfirmStep(null) }}
               className="flex-1 py-2.5 text-sm font-medium text-slate-600 bg-gray-100 rounded-xl">
               {t('dar_confirm_back')}
             </button>
             <button onClick={function () { setConfirmStep('first') }}
               className="flex-1 py-2.5 text-sm font-medium text-white bg-slate-800 rounded-xl">
               {t('dar_submit')}
             </button>
           </div>
         </div>
       </div>
     )
   }

    if (confirmStep === 'first') {
      return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
          <div className="bg-white rounded-2xl p-5 w-full max-w-sm space-y-4">
            <h3 className="text-base font-bold text-slate-800">{t('dar_confirm_title')}</h3>
            <p className="text-sm text-slate-600">{t('dar_confirm_msg')}</p>
            <div className="flex gap-3">
              <button onClick={function () { setConfirmStep(null) }}
                className="flex-1 py-2.5 text-sm font-medium text-slate-600 bg-gray-100 rounded-xl">
                {t('dar_confirm_back')}
              </button>
              <button onClick={function () { setConfirmStep('final') }}
                className="flex-1 py-2.5 text-sm font-medium text-white bg-amber-500 rounded-xl">
                {t('dar_confirm_yes')}
              </button>
            </div>
          </div>
        </div>
      )
    }

    if (confirmStep === 'final') {
      return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
          <div className="bg-white rounded-2xl p-5 w-full max-w-sm space-y-4">
            <h3 className="text-base font-bold text-red-600">{t('dar_confirm_final')}</h3>
            <p className="text-sm text-slate-600">{t('dar_confirm_final_msg')}</p>

            {/* DAR Preview */}
            <div className="bg-gray-50 rounded-lg p-3 space-y-1 text-sm border">
              <p className="font-semibold">DAR: {formatDisplayDate(selectedDate)}</p>
              <p className="text-slate-600">{t('dar_punch_in')}: {formatTime12(punchIn)}</p>
              {bullets.map(function (b, i) {
                return <p key={i} className="text-slate-600">{b}</p>
              })}
              {punchOut && <p className="text-slate-600">{t('dar_punch_out')}: {formatTime12(punchOut)}</p>}
            </div>

            <div className="flex gap-3">
              <button onClick={function () { setConfirmStep(null) }}
                className="flex-1 py-2.5 text-sm font-medium text-slate-600 bg-gray-100 rounded-xl">
                {t('dar_confirm_back')}
              </button>
              <button onClick={handleFinalSubmit} disabled={saving}
                className="flex-1 py-2.5 text-sm font-medium text-white bg-red-500 rounded-xl disabled:opacity-50">
                {saving ? t('saving') : t('dar_confirm_yes')}
              </button>
            </div>
          </div>
        </div>
      )
    }
  }

  // ── History section ──
  function renderHistory() {
    return (
      <div className="mt-6">
        <h3 className="text-sm font-bold text-slate-700 mb-3">{t('dar_history')}</h3>
        {historyLoading ? (
          <p className="text-xs text-gray-400">{t('loading')}</p>
        ) : history.length === 0 ? (
          <p className="text-xs text-gray-400">{t('dar_no_history')}</p>
        ) : (
          <div className="space-y-2">
            {history.map(function (dar) {
              var bullets = formatTasksBullets(dar.tasks)
              return (
                <details key={dar.report_date} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                  <summary className="px-4 py-3 text-sm font-medium text-slate-700 cursor-pointer flex items-center justify-between">
                    <span>{formatDisplayDate(dar.report_date)}</span>
                    <span className="text-xs text-gray-400">{bullets.length} tasks</span>
                  </summary>
                  <div className="px-4 pb-3 space-y-1 text-sm border-t border-gray-100 pt-2">
                    <p className="text-slate-500">{t('dar_punch_in')}: {formatTime12(dar.punch_in)}</p>
                    {bullets.map(function (b, i) {
                      return <p key={i} className="text-slate-600">{b}</p>
                    })}
                    {dar.punch_out && <p className="text-slate-500">{t('dar_punch_out')}: {formatTime12(dar.punch_out)}</p>}
                  </div>
                </details>
              )
            })}
          </div>
        )}
      </div>
    )
  }

  // ── Main form ──
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-bold text-slate-800">{t('dar_title')}</h2>

      {/* Date picker */}
      <div>
        <label className="text-xs font-medium text-slate-500 mb-1 block">{t('dar_date')}</label>
        <input type="date" value={selectedDate} onChange={handleDateChange}
          max={formatDate(new Date())}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
      </div>

      {loading ? (
        <div className="text-center py-8">
          <div className="w-6 h-6 border-2 border-slate-700 border-t-transparent rounded-full animate-spin mx-auto" />
        </div>
      ) : (
        <>
          {/* Punch times */}
          <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500">{t('dar_punch_in')}</span>
              {!punchManual && <span className="text-[10px] text-emerald-600">{t('dar_punch_auto')}</span>}
              {punchManual && <span className="text-[10px] text-amber-600">{t('dar_punch_manual')}</span>}
            </div>

            <input type="time" value={punchIn}
              onChange={function (e) { setPunchIn(e.target.value) }}
              readOnly={!punchManual}
              className={'w-full border rounded-lg px-3 py-2 text-sm ' +
                (punchManual ? 'border-amber-300 bg-amber-50' : 'border-gray-200 bg-gray-50 text-slate-600')} />

            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500">{t('dar_punch_out')}</span>
            </div>

            <input type="time" value={punchOut}
              onChange={function (e) { setPunchOut(e.target.value) }}
              readOnly={!punchManual}
              className={'w-full border rounded-lg px-3 py-2 text-sm ' +
                (punchManual ? 'border-amber-300 bg-amber-50' : 'border-gray-200 bg-gray-50 text-slate-600')} />
          </div>

          {/* Tasks */}
          <div>
            <label className="text-xs font-medium text-slate-500 mb-1 block">{t('dar_tasks')}</label>
            <textarea
              value={tasks}
              onChange={function (e) { setTasks(e.target.value) }}
              placeholder={t('dar_tasks_placeholder')}
              rows={6}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm resize-none placeholder:text-gray-300"
            />
          </div>

          {/* Error */}
          {error && <p className="text-xs text-red-500 font-medium">{error}</p>}

          {/* Submit */}
          <button onClick={handleSubmitClick}
            className="w-full py-3 bg-slate-800 text-white text-sm font-semibold rounded-xl active:bg-slate-700">
            {t('dar_preview')}
          </button>
        </>
      )}

      {renderHistory()}
      {renderConfirmation()}

      {/* Toast */}
      {toast && (
        <div className="fixed top-4 left-4 right-4 z-50 bg-emerald-600 text-white text-sm font-medium px-4 py-3 rounded-xl text-center shadow-lg">
          {toast}
        </div>
      )}
    </div>
  )
}
