/** ISO timestamp → "9:05 AM" */
export function fmtTime(iso) {
  if (!iso) return '—'
  var d = new Date(iso)
  var h = d.getHours(), m = d.getMinutes()
  var ampm = h >= 12 ? 'PM' : 'AM'
  h = h % 12 || 12
  return h + ':' + String(m).padStart(2, '0') + ' ' + ampm
}

/** Date object → "2026-06-02" */
export function formatDate(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')
}

/** "14:30" time string → "2:30 PM" */
export function formatTime12(t) {
  if (!t) return '—'
  var parts = t.split(':')
  var h = parseInt(parts[0], 10)
  var m = parts[1]
  var ampm = h >= 12 ? 'PM' : 'AM'
  h = h % 12 || 12
  return h + ':' + m + ' ' + ampm
}

/** "2026-06-02" → "2 Jun 2026" */
export function formatDisplayDate(dateStr) {
  var d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

/** Multi-line text → bullet array */
export function formatBullets(text) {
  return text.split('\n').filter(function (l) { return l.trim() }).map(function (l) {
    var line = l.trim()
    if (line.startsWith('•') || line.startsWith('-') || line.startsWith('*')) {
      return '• ' + line.slice(1).trim()
    }
    return '• ' + line
  })
}