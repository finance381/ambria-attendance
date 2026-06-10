import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'

const MONTH_MAP: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
  january: 1, february: 2, march: 3, april: 4, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12
}

function parseDate(text: string, msgTimestamp: string): string {
  // Get IST "today" from message timestamp
  const msgDate = new Date(parseInt(msgTimestamp) * 1000)
  const istOffset = 5.5 * 60 * 60 * 1000
  const istNow = new Date(msgDate.getTime() + istOffset)
  const fallback = istNow.toISOString().slice(0, 10)
  const currentYear = istNow.getFullYear()

  // Only check first 5 lines for date
  const header = text.split('\n').slice(0, 5).join('\n')
  // Strip WhatsApp bold/italic markers
  const clean = header.replace(/\*/g, '').replace(/_/g, '')

  // Pattern 1: DD/MM/YYYY or DD/MM/YY or DD-MM-YYYY or DD-MM-YY
  const slashMatch = clean.match(/(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})/)
  if (slashMatch) {
    const d = parseInt(slashMatch[1])
    const m = parseInt(slashMatch[2])
    let y = parseInt(slashMatch[3])
    if (y < 100) y += 2000
    if (d >= 1 && d <= 31 && m >= 1 && m <= 12) {
      return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    }
  }

  // Pattern 2: DDth Month YYYY / DD Month YYYY / DD Month YY / DD Month
  const textMatch = clean.match(/(\d{1,2})(?:st|nd|rd|th)?\s*(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s*(\d{2,4})?/i)
  if (textMatch) {
    const d = parseInt(textMatch[1])
    const m = MONTH_MAP[textMatch[2].toLowerCase()]
    let y = textMatch[3] ? parseInt(textMatch[3]) : currentYear
    if (y < 100) y += 2000
    if (d >= 1 && d <= 31 && m) {
      return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    }
  }

  return fallback
}

function isDARMessage(text: string): boolean {
  if (!text || text.length < 20) return false
  const lower = text.toLowerCase()
  // Must contain DAR indicators
  const hasDar = lower.includes('dar') || lower.includes('punch in') || lower.includes('punch out') ||
    lower.includes("today's output") || lower.includes('activities performed')
  // Exclude known non-DAR patterns
  const isNonDar = lower.startsWith('poa') || lower.includes('this message was deleted') ||
    lower.includes('<media omitted>')
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

  // Report on yesterday + day-before (late submissions)
  const now = new Date()
  const istOffset = 5.5 * 60 * 60 * 1000
  const istNow = new Date(now.getTime() + istOffset)
  const reportDate = new Date(istNow.getTime() - 1 * 86400000).toISOString().slice(0, 10)

  // Load groups
  const { data: groups } = await supabase
    .from('dar_groups')
    .select('whatsapp_group_id, group_name')
    .eq('active', true)

  // Load phone map
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

  // Exclude employees with zero punches on reportDate (absent/leave)
  const { data: presentPunches } = await supabase
    .from('punches')
    .select('employee_id')
    .eq('attendance_date', reportDate)

  const presentIds = new Set((presentPunches || []).map((p: any) => p.employee_id))
  const absentEmps = (allEmps || []).filter(e => !presentIds.has(e.id))
  const activeEmps = (allEmps || []).filter(e => presentIds.has(e.id))
  const allEmpCodes = new Set(activeEmps.map(e => e.emp_code))

  // Fetch messages from each group (last 48h)
  const cutoffEpoch = Math.floor((now.getTime() - 72 * 60 * 60 * 1000) / 1000)

  // darDate -> Set of emp_codes who submitted
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
        // Skip old messages
        if (msg.timestamp && parseInt(msg.timestamp) < cutoffEpoch) continue

        const text = msg.text?.body || msg.text || ''
        if (!isDARMessage(text)) continue

        // Extract sender phone (strip @s.whatsapp.net, normalize)
        let from = (msg.from || '').replace(/@[a-z.]+$/i, '').replace(/^\+/, '')
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

      // Rate limit: 1 sec between group fetches
      await new Promise(r => setTimeout(r, 1000))
    } catch (err) {
      console.error(`Failed to fetch ${group.group_name}:`, err)
      console.error(`FETCH_FAIL: ${group.group_name}`)
    }
  }

  // Persist all matched DARs into daily_reports for compliance tracking
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

  // Log date distribution for debugging
  for (const [d, codes] of Object.entries(submittedByDate)) {
    console.log(`submittedByDate[${d}]: ${codes.size} employees`)
  }

  // Build report for today (primary)
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
  report += `─────────────────\n`

  if (todayMissing.length > 0) {
    // Group missing by department
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
      submitted: todaySubmitted.size,
      persisted: actualInserted,
      persisted_attempted: attemptedCount,
      sent_to: sentTo,
      unknown_phones: unknownPhones
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  )
})