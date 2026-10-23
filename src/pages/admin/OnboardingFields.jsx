// OnboardingFields.jsx
// Shared form/tile pieces for the New Joiners tab: the task/test tile card and
// its sections, the "All + list" checkbox picker, the employee search picker,
// the delete-confirm dialog, plus the shared line Icon and empty-state card.
// Phones: bigger tile edit/delete tap targets and tighter tile stat gaps.

import { useState, useRef, useEffect } from 'react'
import { inputClass, toggle, ICONS } from './onboardingUtils'

export function Icon({ d, className }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" className={className || 'w-4 h-4'} aria-hidden="true">
      {d.map(function (path) { return <path key={path} d={path} /> })}
    </svg>
  )
}

// Plus icon for the primary "Add ..." buttons.
export var PLUS_ICON = ['M12 5v14', 'M5 12h14']

// White card with a soft icon tile and a short message, for empty lists.
export function EmptyState({ icon, title, body }) {
  return (
    <div className="bg-white rounded-2xl ring-1 ring-gray-200/70 shadow-sm text-center px-4 sm:px-6 py-10 sm:py-14">
      <span className="w-14 h-14 rounded-2xl bg-blue-50 text-blue-500 inline-flex items-center justify-center mb-3">
        <Icon d={icon} className="w-7 h-7" />
      </span>
      <p className="text-base font-semibold text-gray-800">{title}</p>
      {body && <p className="text-sm text-gray-500 mt-1">{body}</p>}
    </div>
  )
}

// Card used by both Tasks and Tests:
//   header   - type icon, title, kind label, edit/delete, description
//   stats    - label/value rows in a soft panel (values wrap, never cut off);
//              a stat with `chips` shows them as small chips instead of text
//   children - extra sections (people, attachments)
export function TileCard({ icon, kind, title, description, stats, onEdit, onDelete, children }) {
  return (
    <div className="bg-white rounded-2xl ring-1 ring-gray-200/70 shadow-sm hover:shadow-md transition-shadow flex flex-col overflow-hidden">
      <div className="p-4 pb-3">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
            <Icon d={icon} className="w-5 h-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-[15px] font-semibold text-gray-900 leading-snug break-words">{title}</h3>
            <p className="text-xs text-gray-500 mt-0.5">{kind}</p>
          </div>
          <div className="flex shrink-0 gap-1">
            <button onClick={onEdit} title="Edit" aria-label="Edit"
              className="w-9 h-9 sm:w-8 sm:h-8 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 inline-flex items-center justify-center transition-colors"><Icon d={ICONS.edit} /></button>
            <button onClick={onDelete} title="Delete" aria-label="Delete"
              className="w-9 h-9 sm:w-8 sm:h-8 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 inline-flex items-center justify-center transition-colors"><Icon d={ICONS.trash} /></button>
          </div>
        </div>
        {description && (
          <p className="text-[13px] text-gray-600 leading-relaxed mt-3 line-clamp-3 whitespace-pre-line" title={description}>{description}</p>
        )}

        {stats && stats.length > 0 && (
          <dl className="mt-3 rounded-xl bg-gray-50 px-3 py-1 divide-y divide-gray-100">
            {stats.map(function (st) {
              var hasChips = st.chips && st.chips.length > 0
              return (
                <div key={st.label} className="flex items-start justify-between gap-3 sm:gap-4 py-2">
                  <dt className="text-xs text-gray-500 shrink-0 pt-0.5">{st.label}</dt>
                  {hasChips ? (
                    <dd className="flex flex-wrap justify-end gap-1 min-w-0">
                      {st.chips.map(function (c) {
                        return <span key={c} className="text-[11px] font-semibold px-2 py-0.5 rounded-md bg-white text-gray-700 ring-1 ring-gray-200">{c}</span>
                      })}
                    </dd>
                  ) : (
                    <dd className={'text-[13px] font-medium text-right break-words min-w-0 ' + (st.muted ? 'text-gray-400' : (st.accent || 'text-gray-900'))}>{st.value}</dd>
                  )}
                </div>
              )
            })}
          </dl>
        )}
      </div>

      <div className="flex-1 flex flex-col">{children}</div>
    </div>
  )
}

export function TileSection({ label, count, children }) {
  return (
    <div className="px-4 py-3 border-t border-gray-100">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 mb-2 flex items-center">
        {label}{count != null && <span className="ml-1.5 px-1.5 py-px rounded-full bg-gray-100 text-[11px] font-semibold text-gray-500 normal-case tracking-normal">{count}</span>}
      </p>
      {children}
    </div>
  )
}

function initials(name) {
  var parts = name.trim().split(/\s+/)
  return ((parts[0] || '')[0] || '').concat((parts[1] || '')[0] || '').toUpperCase()
}

export function PeopleList({ people }) {
  if (people.length === 0) return <p className="text-[13px] text-gray-400">Not assigned</p>
  return (
    <div className="flex flex-col gap-2">
      {people.map(function (p) {
        return (
          <div key={p.id} className="flex items-center gap-2.5 min-w-0">
            <span className="w-7 h-7 rounded-full bg-blue-100 text-blue-700 text-[11px] font-bold flex items-center justify-center shrink-0">{initials(p.name)}</span>
            <span className="text-[13px] font-medium text-gray-900 truncate">{p.name}</span>
            {p.emp_code && <span className="text-[11px] text-gray-500 bg-gray-100 px-1.5 py-px rounded shrink-0">{p.emp_code}</span>}
          </div>
        )
      })}
    </div>
  )
}

export function AttachmentList({ docs, onOpen }) {
  if (docs.length === 0) return <p className="text-[13px] text-gray-400">No attachments</p>
  return (
    <div className="flex flex-col gap-1.5">
      {docs.map(function (d) {
        var isPdf = d.file_type === 'pdf'
        return (
          <button key={d.id} onClick={function () { onOpen(d) }} title="Open document"
            className="group/doc w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl ring-1 ring-gray-200 hover:ring-blue-200 hover:bg-blue-50/40 transition-colors text-left">
            <span className={'w-9 text-center text-[10px] font-bold uppercase py-0.5 rounded shrink-0 ' +
              (isPdf ? 'text-red-700 bg-red-50' : 'text-blue-700 bg-blue-50')}>{d.file_type || 'doc'}</span>
            <span className="text-[13px] font-medium text-gray-800 truncate flex-1">{d.title}</span>
            <span className="text-gray-400 group-hover/doc:text-blue-600 transition-colors"><Icon d={ICONS.open} /></span>
          </button>
        )
      })}
    </div>
  )
}

// Checkbox list with an "All" row on top. Empty selection = All.
export function MultiPick({ allLabel, options, selected, onChange }) {
  return (
    <div className="border border-gray-200 rounded-xl max-h-40 overflow-y-auto divide-y divide-gray-100">
      <label className="flex items-center gap-2 px-3 py-1.5 text-xs font-semibold text-gray-800 cursor-pointer hover:bg-gray-50">
        <input type="checkbox" checked={selected.length === 0} onChange={function () { onChange([]) }} />
        {allLabel}
      </label>
      {options.map(function (o) {
        return (
          <label key={o.value} className="flex items-center gap-2 px-3 py-1.5 text-xs text-gray-700 cursor-pointer hover:bg-gray-50">
            <input type="checkbox" checked={selected.includes(o.value)}
              onChange={function () { onChange(toggle(selected, o.value)) }} />
            {o.label}
          </label>
        )
      })}
    </div>
  )
}

// Same as MultiPick (empty selection = "All"), shown as a tidy grid of
// equal-width toggle tiles under an "All" row: far less height than a
// checkbox list.
export function ChipPick({ allLabel, options, selected, onChange }) {
  var allOn = selected.length === 0
  function tick(on) {
    return (
      <span className={'shrink-0 w-4 h-4 rounded border inline-flex items-center justify-center ' +
        (on ? 'bg-blue-600 border-blue-600 text-white' : 'bg-white border-gray-300')}>
        {on && (
          <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"
            strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
        )}
      </span>
    )
  }
  return (
    <div className="border border-gray-200 rounded-xl p-2 space-y-2">
      <button type="button" onClick={function () { onChange([]) }}
        className={'w-full flex items-center gap-2 px-3 py-2 rounded-lg text-[13px] font-semibold text-left transition-colors ' +
          (allOn ? 'bg-blue-50 text-blue-800' : 'text-gray-700 hover:bg-gray-50')}>
        {tick(allOn)}
        <span className="flex-1">{allLabel}</span>
        {!allOn && <span className="text-xs font-medium text-gray-500">{selected.length} selected</span>}
      </button>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
        {options.map(function (o) {
          var on = selected.includes(o.value)
          return (
            <button key={o.value} type="button" onClick={function () { onChange(toggle(selected, o.value)) }}
              title={o.label}
              className={'flex items-center gap-2 px-2.5 py-2 rounded-lg border text-[13px] text-left transition-colors ' +
                (on ? 'border-blue-500 bg-blue-50 text-blue-800 font-semibold' : 'border-gray-200 text-gray-700 hover:border-gray-300 hover:bg-gray-50')}>
              {tick(on)}
              <span className="min-w-0 truncate">{o.label}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

// Search employees by name/code and pick them as chips. `selected` is an
// array of ids; with `single` a new pick replaces the old one.
// Keyboard: ↑/↓ move through results, Enter picks, Esc closes the list.
export function EmployeePicker({ employees, selected, onChange, single }) {
  var [search, setSearch] = useState('')
  var [active, setActive] = useState(0)
  var listRef = useRef(null)
  var q = search.trim().toLowerCase()
  var matches = q
    ? employees.filter(function (e) {
        return e.name.toLowerCase().includes(q) || (e.emp_code || '').toLowerCase().includes(q)
      }).slice(0, 30)
    : []
  var picked = employees.filter(function (e) { return selected.includes(e.id) })

  function pick(id) {
    onChange(single ? (selected.includes(id) ? [] : [id]) : toggle(selected, id))
    setSearch('')
    setActive(0)
  }

  function handleKeyDown(e) {
    if (matches.length === 0) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive(function (i) { return (i + 1) % matches.length })
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive(function (i) { return (i - 1 + matches.length) % matches.length })
    } else if (e.key === 'Enter') {
      // Pick the highlighted row instead of submitting the form.
      e.preventDefault()
      pick(matches[Math.min(active, matches.length - 1)].id)
    } else if (e.key === 'Escape') {
      e.preventDefault()
      setSearch('')
      setActive(0)
    }
  }

  // Keep the highlighted row visible inside the scrolling list.
  useEffect(function () {
    var row = listRef.current && listRef.current.children[active]
    if (row) row.scrollIntoView({ block: 'nearest' })
  }, [active])

  return (
    <div>
      {picked.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2">
          {picked.map(function (p) {
            return (
              <span key={p.id} className="flex items-center gap-1 text-[11px] font-semibold text-blue-700 bg-blue-50 ring-1 ring-blue-100 pl-2 pr-1 py-0.5 rounded-full">
                {p.name}
                <button type="button" onClick={function () { onChange(toggle(selected, p.id)) }}
                  className="w-4 h-4 rounded-full hover:bg-blue-100 text-blue-500 inline-flex items-center justify-center" aria-label={'Remove ' + p.name}>
                  <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
                </button>
              </span>
            )
          })}
        </div>
      )}
      <input type="text" value={search}
        onChange={function (e) { setSearch(e.target.value); setActive(0) }}
        onKeyDown={handleKeyDown}
        placeholder="Search employee by name or code" className={inputClass} />
      {matches.length > 0 && (
        <div ref={listRef} className="mt-1 border border-gray-200 rounded-xl shadow-sm max-h-40 overflow-y-auto">
          {matches.map(function (emp, i) {
            var isPicked = selected.includes(emp.id)
            return (
              <button type="button" key={emp.id} tabIndex={-1}
                onClick={function () { pick(emp.id) }}
                onMouseEnter={function () { setActive(i) }}
                className={'w-full text-left px-3 py-1.5 text-xs flex justify-between ' +
                  (i === active ? 'bg-blue-50 ' : '') + (isPicked ? 'font-semibold' : '')}>
                <span>{emp.name}</span>
                {isPicked ? (
                  <svg className="w-3.5 h-3.5 text-blue-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
                ) : (
                  <span className="text-gray-400">{emp.emp_code}</span>
                )}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

export function ConfirmDelete({ title, body, busy, onCancel, onConfirm }) {
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onCancel}>
      <div className="bg-white rounded-2xl w-full max-w-sm shadow-xl p-5" onClick={function (e) { e.stopPropagation() }}>
        <h3 className="text-base font-semibold text-gray-900 mb-1">{title}</h3>
        <p className="text-sm text-gray-500 mb-5">{body}</p>
        <div className="flex justify-end gap-2">
          <button onClick={onCancel}
            className="px-4 py-2 text-sm font-medium bg-white ring-1 ring-gray-200 text-gray-700 hover:bg-gray-50 rounded-lg transition-colors">Cancel</button>
          <button onClick={onConfirm} disabled={busy}
            className="px-4 py-2 text-sm text-white bg-red-600 rounded-lg hover:bg-red-700 shadow-sm shadow-red-600/30 disabled:opacity-40 transition-colors font-semibold">
            {busy ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  )
}
