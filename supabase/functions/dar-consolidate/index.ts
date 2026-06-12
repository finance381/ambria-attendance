import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'

const MONTH_MAP: Record<string, number> = {
  // Standard abbreviations
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
  // Full names
  january: 1, february: 2, march: 3, april: 4, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
  // Known employee typos
  jyne: 6,    // Ompal
  jue: 6,     // autocorrect miss
  // Common truncations
  janu: 1, febr: 2, marc: 3, apri: 4,
  sept: 9, octo: 10, nove: 11, dece: 12,
}

// Build month regex from all keys (longest first to avoid partial matches)
const MONTH_NAMES = Object.keys(MONTH_MAP).sort((a, b) => b.length - a.length).join('|')

function parseDate(text: string, msgTimestamp: string): string {
  // Get IST "today" from message timestamp
  const msgDate = new Date(parseInt(msgTimestamp) * 1000)
  const istOffset = 5.5 * 60 * 60 * 1000
  const istNow = new Date(msgDate.getTime() + istOffset)
  const fallback = istNow.toISOString().slice(0, 10)
  const currentYear = istNow.getFullYear()
  const fallbackMs = new Date(fallback + 'T00:00:00Z').getTime()

  // Only check first 5 lines for date
  const header = text.split('\n').slice(0, 5).join('\n')

  // Aggressive cleanup:
  // 1. Strip WhatsApp bold/italic markers (* and _)
  // 2. Replace en-dash (–), em-dash (—), and other unicode dashes with space
  // 3. Replace zero-width spaces, non-breaking spaces, and other invisible chars with space
  // 4. Collapse multiple spaces
  const clean = header
    .replace(/\*/g, '')
    .replace(/_/g, '')
    .replace(/[\u2013\u2014\u2015\u2012\u2010]/g, ' ')
    .replace(/[\u200B\u200C\u200D\uFEFF\u00A0]/g, ' ')
    .replace(/\s+/g, ' ')

  // Helper: validate parsed date is within ±2 days of message date
  function validateDate(parsed: string): string {
    const parsedMs = new Date(parsed + 'T00:00:00Z').getTime()
    if (Math.abs(parsedMs - fallbackMs) > 2 * 86400000) return fallback
    return parsed
  }

  // Helper: format date string
  function fmt(y: number, m: number, d: number): string {
    return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
  }

  // ── Pattern 1: DD/MM/YYYY, DD-MM-YYYY, DD.MM.YYYY (numeric separators) ──
  const numMatch = clean.match(/(\d{1,2})\s*[\/\-\.]\s*(\d{1,2})\s*[\/\-\.]\s*(\d{2,4})/)
  if (numMatch) {
    const d = parseInt(numMatch[1])
    const m = parseInt(numMatch[2])
    let y = parseInt(numMatch[3])
    if (y < 100) y += 2000
    if (d >= 1 && d <= 31 && m >= 1 && m <= 12) {
      return validateDate(fmt(y, m, d))
    }
  }

  // ── Pattern 1b: DD MM YYYY (spaces as separators, all numeric) ──
  const spaceNumMatch = clean.match(/\b(\d{1,2})\s+(\d{1,2})\s+(\d{4})\b/)
  if (spaceNumMatch) {
    const d = parseInt(spaceNumMatch[1])
    const m = parseInt(spaceNumMatch[2])
    const y = parseInt(spaceNumMatch[3])
    if (d >= 1 && d <= 31 && m >= 1 && m <= 12) {
      return validateDate(fmt(y, m, d))
    }
  }

  // ── Pattern 2: YYYY-MM-DD / YYYY/MM/DD (ISO format) ──
  const isoMatch = clean.match(/(\d{4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})/)
  if (isoMatch) {
    const y = parseInt(isoMatch[1])
    const m = parseInt(isoMatch[2])
    const d = parseInt(isoMatch[3])
    if (y >= 2020 && y <= 2030 && m >= 1 && m <= 12 && d >= 1 && d <= 31) {
      return validateDate(fmt(y, m, d))
    }
  }

  // ── Pattern 3: DD[ordinal][sep]Month[sep][Year] (text month, DD first) ──
  // Handles: 9th june 2026, 9 th june 2026, 5.june.2026, 10june2026, 10-Jun-2026,
  //          10 Jun'26, DAR –9 th june 2026 (after en-dash → space cleanup)
  const textMonthRegex = new RegExp(
    '(\\d{1,2})' +
    '\\s*(?:st|nd|rd|th)?' +
    '[\\s.,\\-/]*' +
    '(' + MONTH_NAMES + ')' +
    '[\\s.,\\-/]*' +
    "(?:'?(\\d{2,4}))?",
    'i'
  )
  const textMatch = clean.match(textMonthRegex)
  if (textMatch) {
    const d = parseInt(textMatch[1])
    const m = MONTH_MAP[textMatch[2].toLowerCase()]
    let y = textMatch[3] ? parseInt(textMatch[3]) : currentYear
    if (y < 100) y += 2000
    if (d >= 1 && d <= 31 && m) {
      return validateDate(fmt(y, m, d))
    }
  }

  // ── Pattern 4: Month DD[,] [YYYY] (American: June 10, 2026 / June 10) ──
  const amRegex = new RegExp(
    '(' + MONTH_NAMES + ')' +
    '[\\s.,\\-/]+' +
    '(\\d{1,2})' +
    '(?:st|nd|rd|th)?' +
    '[\\s,]*' +
    "(?:'?(\\d{2,4}))?",
    'i'
  )
  const amMatch = clean.match(amRegex)
  if (amMatch) {
    const m = MONTH_MAP[amMatch[1].toLowerCase()]
    const d = parseInt(amMatch[2])
    let y = amMatch[3] ? parseInt(amMatch[3]) : currentYear
    if (y < 100) y += 2000
    if (d >= 1 && d <= 31 && m) {
      return validateDate(fmt(y, m, d))
    }
  }

  return fallback
}

function isDARMessage(text: string): boolean {
  if (!text || text.length < 20) return false
  const lower = text.toLowerCase()
  const hasDar = lower.includes('dar') || lower.includes('punch in') || lower.includes('punch out') ||
    lower.includes("today's output") || lower.includes('activities performed')
  const isNonDar = lower.startsWith('poa') || lower.includes('this message was deleted') ||
    lower.includes('<media omitted>') || lower.includes('dar format')
  return hasDar && !isNonDar
}

serve(async (req) => {
  const authHeader = req.headers.get('Authorization')
  const authKey = Deno.env.get('SRK_AUTH') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  if (authHeader !== `Bearer ${authKey}`) {
    return new Response('Unauthorized', { status: 401 })
  }

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const WHAPI_TOKEN = Deno.env.get('WHAPI_API_TOKEN')!

  // Report on yesterday (IST)
  const now = new Date()
  const istOffset = 5.5 * 60 * 60 * 1000
  const istNow = new Date(now.getTime() + istOffset)
  const reportDate = new Date(istNow.getTime() - 1 * 86400000).toISOString().slice(0, 10)

  // Load groups
  const { data: groups } = await supabase
    .from('dar_groups')
    .select('whatsapp_group_id, group_name')
    .eq('active', true)

  // Load phone map (supports multiple phones per emp_code for alt numbers)
  const { data: phoneMap } = await supabase
    .from('dar_phone_map')
    .select('phone, emp_code, name')

  const phoneLookup: Record<string, { emp_code: string, name: string }> = {}
  for (const p of (phoneMap || [])) {
    const normalized = p.phone.replace(/^\+/, '')
    phoneLookup[normalized] = { emp_code: p.emp_code, name: p.name }
    if (normalized.length > 10) {
      phoneLookup[normalized.slice(-10)] = { emp_code: p.emp_code, name: p.name }
    }
  }

  // Load all active employees who must submit DARs, with department
  const { data: allEmps } = await supabase
    .from('employees')
    .select('id, emp_code, name, departments(name)')
    .eq('active', true)
    .eq('dar_required', true)

  // Exclude employees who are absent: zero punches OR total hours < 4 (absent threshold)
  const { data: punchData } = await supabase
    .from('punches')
    .select('employee_id, punch_type, punched_at')
    .eq('attendance_date', reportDate)

  // Calculate hours worked per employee
  const empPunches: Record<string, { ins: number[], outs: number[] }> = {}
  for (const p of (punchData || [])) {
    if (!empPunches[p.employee_id]) empPunches[p.employee_id] = { ins: [], outs: [] }
    const ts = new Date(p.punched_at).getTime()
    if (p.punch_type === 'IN') empPunches[p.employee_id].ins.push(ts)
    else empPunches[p.employee_id].outs.push(ts)
  }

  const presentIds = new Set<string>()
  for (const [empId, punches] of Object.entries(empPunches)) {
    const ins = punches.ins.sort((a, b) => a - b)
    const outs = punches.outs.sort((a, b) => a - b)
    let totalMs = 0
    // Pair each IN with the next OUT
    for (let i = 0; i < ins.length; i++) {
      const outTime = outs.find(o => o > ins[i])
      if (outTime) totalMs += outTime - ins[i]
    }
    const totalHours = totalMs / (1000 * 60 * 60)
    if (totalHours >= 4) presentIds.add(empId)
  }

  const absentEmps = (allEmps || []).filter(e => !presentIds.has(e.id))
  const activeEmps = (allEmps || []).filter(e => presentIds.has(e.id))
  const allEmpCodes = new Set(activeEmps.map(e => e.emp_code))

  // Fetch messages from each group (last 72h window)
  const cutoffEpoch = Math.floor((now.getTime() - 72 * 60 * 60 * 1000) / 1000)

  const submittedByDate: Record<string, Set<string>> = {}
  submittedByDate[reportDate] = new Set()

  let unknownPhones: string[] = []

  for (const group of (groups || [])) {
    try {
      const resp = await fetch(
        `https://gate.whapi.cloud/messages/list/${group.whatsapp_group_id}?count=500`,
        { headers: { 'Authorization': `Bearer ${WHAPI_TOKEN}` } }
      )
      if (!resp.ok) {
        console.error(`Whapi ${group.group_name}: HTTP ${resp.status} ${resp.statusText}`)
        continue
      }
      const data = await resp.json()
      const messages = data.messages || []
      console.log(`${group.group_name}: ${messages.length} msgs fetched`)

      for (const msg of messages) {
        if (msg.timestamp && parseInt(msg.timestamp) < cutoffEpoch) continue

        const text = msg.text?.body || msg.text || ''
        if (!isDARMessage(text)) continue

        // Extract sender phone (strip any @suffix: @s.whatsapp.net, @lid, etc.)
        let from = (msg.from || '').replace(/@.*$/, '').replace(/^\+/, '')
        if (!from) continue

        // Normalize: ensure 91 prefix
        if (from.length === 10) from = '91' + from

        const employee = phoneLookup[from] || phoneLookup[from.slice(-10)]
        if (!employee) {
          if (!unknownPhones.includes(from)) unknownPhones.push(from)
          continue
        }

        const darDate = parseDate(text, msg.timestamp || String(Math.floor(now.getTime() / 1000)))

        if (!submittedByDate[darDate]) submittedByDate[darDate] = new Set()
        submittedByDate[darDate].add(employee.emp_code)
      }

      await new Promise(r => setTimeout(r, 1000))
    } catch (err) {
      console.error(`Failed to fetch ${group.group_name}:`, err)
      console.error(`FETCH_FAIL: ${group.group_name}`)
    }
  }

  // Persist all matched DARs into daily_reports
  let attemptedCount = 0
  const { count: beforeCount } = await supabase
    .from('daily_reports')
    .select('*', { count: 'exact', head: true })
  for (const [darDate, empCodes] of Object.entries(submittedByDate)) {
    const rows = [...empCodes].map(code => ({
      emp_code: code,
      report_date: darDate,
      tasks: 'WhatsApp DAR (auto-logged)',
      submitted_at: new Date().toISOString()
    }))
    if (rows.length > 0) {
      const { error } = await supabase
        .from('daily_reports')
        .upsert(rows, { onConflict: 'emp_code,report_date', ignoreDuplicates: true })
      if (!error) attemptedCount += rows.length
      else console.error(`daily_reports upsert error for ${darDate}:`, error.message)
    }
  }
  const { count: afterCount } = await supabase
    .from('daily_reports')
    .select('*', { count: 'exact', head: true })
  const actualInserted = (afterCount || 0) - (beforeCount || 0)
  console.log(`Persisted ${actualInserted} new DAR records (${attemptedCount} attempted)`)

  for (const [d, codes] of Object.entries(submittedByDate)) {
    console.log(`submittedByDate[${d}]: ${codes.size} employees`)
  }

  // Build report
  const todaySubmitted = submittedByDate[reportDate] || new Set()
  const todaySubmittedActive = new Set([...todaySubmitted].filter(c => allEmpCodes.has(c)))
  const todayMissing = [...allEmpCodes].filter(c => !todaySubmitted.has(c))

  function empInfo(code: string): { name: string, dept: string } {
    const e = (allEmps || []).find(x => x.emp_code === code)
    return { name: e ? e.name : code, dept: e?.departments?.name || 'Other' }
  }

  let report = `📋 *DAR Report — ${reportDate}*\n`
  report += `✅ Submitted: ${todaySubmittedActive.size}/${allEmpCodes.size}\n`
  report += `❌ Missing: ${todayMissing.length}\n`
  report += `🏠 Absent/Leave: ${absentEmps.length}\n`
  report += `─────────────────\n`

  if (todayMissing.length > 0) {
    const missingByDept: Record<string, string[]> = {}
    for (const code of todayMissing) {
      const info = empInfo(code)
      if (!missingByDept[info.dept]) missingByDept[info.dept] = []
      missingByDept[info.dept].push(info.name)
    }

    report += `\n*❌ Missing Today:*\n`
    for (const dept of Object.keys(missingByDept).sort()) {
      report += `\n*${dept}*\n`
      for (const name of missingByDept[dept].sort()) {
        report += `• ${name}\n`
      }
    }
  }

  // Send via Whapi
  let sentTo: string[] = []
  const recipientsRow = await supabase
    .from('app_config')
    .select('value')
    .eq('key', 'dar_report_recipients')
    .single()

  let recipients: string[] = []
  try {
    const raw = recipientsRow.data?.value
    if (Array.isArray(raw)) {
      recipients = raw
    } else if (typeof raw === 'string') {
      recipients = JSON.parse(raw.replace(/^"|"$/g, ''))
    }
  } catch { recipients = [] }

  for (const phone of recipients) {
    try {
      await fetch('https://gate.whapi.cloud/messages/text', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${WHAPI_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          to: phone.includes('@') ? phone : phone + '@s.whatsapp.net',
          body: report,
        }),
      })
      sentTo.push(phone)
      await new Promise(r => setTimeout(r, 1000))
    } catch (err) {
      console.error(`Failed to send to ${phone}:`, err)
    }
  }

  console.log(report)
  if (unknownPhones.length > 0) {
    console.log(`Unknown phones (${unknownPhones.length}):`, unknownPhones.join(', '))
  }
  console.log(`Sent to ${sentTo.length} recipients`)

  return new Response(
    JSON.stringify({
      date: reportDate,
      expected: allEmpCodes.size,
      submitted: todaySubmittedActive.size,
      persisted: actualInserted,
      persisted_attempted: attemptedCount,
      sent_to: sentTo,
      unknown_phones: unknownPhones
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  )
})