// MiniIcon.jsx
// Small line icons (24x24, stroke = currentColor) for the staff mobile
// screens, used where the UI previously showed emoji (status notes, close
// buttons, stat cards, the camera button). Size and colour come from
// className, e.g. <MiniIcon name="pin" className="w-3.5 h-3.5 text-emerald-600" />.

var PATHS = {
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  checkCircle: <><circle cx="12" cy="12" r="9" /><path d="M8.5 12.5l2.5 2.5 4.5-5" /></>,
  x: <path d="M6 6l12 12M18 6L6 18" />,
  xCircle: <><circle cx="12" cy="12" r="9" /><path d="M9 9l6 6M15 9l-6 6" /></>,
  alert: <><path d="M12 9v4M12 17h.01" /><path d="M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" /></>,
  pin: <><path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z" /><circle cx="12" cy="9.5" r="2.5" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  hourglass: <><path d="M6 3h12M6 21h12" /><path d="M7 3c0 5 10 5 10 9s-10 4-10 9M17 3c0 5-10 5-10 9s10 4 10 9" /></>,
  offline: <><path d="M2 8.5a15 15 0 0 1 4-2.4M9.5 5.2A15 15 0 0 1 22 8.5M5 12a10 10 0 0 1 3.5-2.1M15.5 9.9A10 10 0 0 1 19 12M8.5 15.5a5 5 0 0 1 7 0" /><path d="M12 19h.01M3 3l18 18" /></>,
  sync: <><path d="M20 11a8 8 0 0 0-14.3-4.9L4 8" /><path d="M4 4v4h4M4 13a8 8 0 0 0 14.3 4.9L20 16" /><path d="M20 20v-4h-4" /></>,
  note: <><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" /><path d="M14 3v6h6M8 13h8M8 17h5" /></>,
  camera: <><path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z" /><circle cx="12" cy="13.5" r="3.5" /></>,
  ban: <><circle cx="12" cy="12" r="9" /><path d="M5.6 5.6l12.8 12.8" /></>,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></>,
  sunrise: <><path d="M3 18h18M7 18a5 5 0 0 1 10 0" /><path d="M12 3v5M9.5 5.5L12 3l2.5 2.5M4.9 11.1l1.4 1.4M19.1 11.1l-1.4 1.4" /></>,
  sunset: <><path d="M3 18h18M7 18a5 5 0 0 1 10 0" /><path d="M12 3v5M9.5 5.5L12 8l2.5-2.5M4.9 11.1l1.4 1.4M19.1 11.1l-1.4 1.4" /></>,
  chart: <path d="M5 20V13M12 20V6M19 20v-9" />,
  trend: <><path d="M3 17l6-6 4 4 8-8" /><path d="M15 7h6v6" /></>,
  flag: <><path d="M5 21V4" /><path d="M5 4h11l-2 4 2 4H5" /></>
}

export default function MiniIcon({ name, className }) {
  return (
    <svg className={className || 'w-4 h-4'} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{PATHS[name]}</svg>
  )
}
