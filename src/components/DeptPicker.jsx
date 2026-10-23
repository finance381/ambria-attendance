// DeptPicker.jsx
// Department filter you can type into, used on the admin Employees, Daily
// and Monthly pages in place of a plain <select>. Opens a list with a search
// box (every word typed must appear in the name); Enter picks the first
// match, Esc or a click outside closes it. Optional `counts` shows how many
// people each department has.
// value: department id as a string ('' = all departments).

import { useState, useEffect, useRef } from 'react'

export default function DeptPicker({ departments, value, onChange, counts, total, allLabel, className }) {
  var [open, setOpen] = useState(false)
  var [q, setQ] = useState('')
  var boxRef = useRef(null)

  useEffect(function () {
    if (!open) return
    function onDown(e) { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onDown)
    return function () { document.removeEventListener('mousedown', onDown) }
  }, [open])

  var words = q.toLowerCase().trim().split(/\s+/).filter(Boolean)
  var options = departments.filter(function (d) {
    var n = d.name.toLowerCase()
    return words.every(function (w) { return n.includes(w) })
  })
  var current = departments.find(function (d) { return String(d.id) === value })
  var label = allLabel || 'All departments'

  function pick(id) {
    onChange(id)
    setOpen(false)
    setQ('')
  }

  return (
    <div ref={boxRef} className="relative">
      <button type="button" onClick={function () { setOpen(!open) }}
        className={'min-w-44 px-3 inline-flex items-center justify-between gap-2 border bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ' +
          (value ? 'border-blue-400 text-gray-900 font-medium ' : 'border-gray-200 text-gray-800 ') +
          (className || 'h-10 rounded-xl')}>
        <span className="truncate">{current ? current.name : label}</span>
        <svg className={'w-4 h-4 text-gray-500 shrink-0 transition-transform ' + (open ? 'rotate-180' : '')} viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
      </button>
      {open && (
        <div className="absolute z-30 mt-1 left-0 w-72 max-w-[calc(100vw-2rem)] bg-white rounded-xl ring-1 ring-gray-200 shadow-lg p-2">
          <input autoFocus value={q} onChange={function (e) { setQ(e.target.value) }}
            onKeyDown={function (e) {
              if (e.key === 'Escape') setOpen(false)
              if (e.key === 'Enter' && options.length) pick(String(options[0].id))
            }}
            placeholder="Type to find a department…"
            className="w-full px-3 py-2 mb-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          <div className="max-h-64 overflow-y-auto">
            {!q && (
              <button type="button" onClick={function () { pick('') }}
                className={'w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm text-left hover:bg-gray-100 ' + (!value ? 'bg-blue-50 text-blue-700 font-semibold' : 'text-gray-800')}>
                {label}
                {total != null && <span className="text-xs text-gray-400 tabular-nums">{total}</span>}
              </button>
            )}
            {options.map(function (d) {
              var on = String(d.id) === value
              return (
                <button key={d.id} type="button" onClick={function () { pick(String(d.id)) }}
                  className={'w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-sm text-left hover:bg-gray-100 ' + (on ? 'bg-blue-50 text-blue-700 font-semibold' : 'text-gray-800')}>
                  <span className="truncate">{d.name}</span>
                  {counts && <span className="text-xs text-gray-400 tabular-nums">{counts[d.id] || 0}</span>}
                </button>
              )
            })}
            {options.length === 0 && <p className="px-3 py-3 text-sm text-gray-400">No department matches</p>}
          </div>
        </div>
      )}
    </div>
  )
}
