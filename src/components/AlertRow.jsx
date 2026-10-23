// AlertRow.jsx
// The compact one-row look shared by the Home-screen alerts (task due
// reminder, joiners behind on tasks, tests to mark): tinted icon, a bold
// title line, one muted sub line, and a chevron. Keeps the alerts short so
// the punch card stays near the top.
// `expanded` turns the chevron down (for rows that open a list below);
// `children` renders under the row, inside the same card.
// Styled as a raised neumorphic card (.neu) with a small raised icon tile.

var TONES = {
  red: { tile: 'text-red-600', title: 'text-red-800', ring: 'ring-red-100' },
  amber: { tile: 'text-amber-600', title: 'text-amber-800', ring: 'ring-amber-100' },
  indigo: { tile: 'text-indigo-600', title: 'text-indigo-900', ring: 'ring-indigo-100' },
  gray: { tile: 'text-gray-500', title: 'text-gray-800', ring: 'ring-gray-900/5' }
}

var PATHS = {
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  alert: <><path d="M12 9v4M12 17h.01" /><path d="M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" /></>,
  test: <><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" /><rect x="9" y="3" width="6" height="4" rx="1" /><path d="M9 13h6M9 17h4" /></>,
  chevron: <path d="M9 6l6 6-6 6" />
}

function Glyph({ name, className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{PATHS[name]}</svg>
  )
}

export function AlertRow({ tone, icon, title, sub, expanded, children }) {
  var c = TONES[tone] || TONES.gray
  return (
    <div className="neu rounded-2xl mb-3 overflow-hidden">
      <div className="flex items-center gap-3 px-3 py-2.5">
        <span className={'w-8 h-8 rounded-lg neu-sm inline-flex items-center justify-center shrink-0 ' + c.tile}>
          <Glyph name={icon} className="w-4 h-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className={'text-[13px] font-semibold truncate leading-tight ' + c.title}>{title}</p>
          {sub && <p className="text-[11px] text-slate-500 truncate mt-0.5">{sub}</p>}
        </div>
        <Glyph name="chevron" className={'w-4 h-4 text-slate-500 shrink-0 transition-transform ' + (expanded ? 'rotate-90' : '')} />
      </div>
      {children}
    </div>
  )
}
