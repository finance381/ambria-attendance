import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'

serve(async (req) => {
  const authHeader = req.headers.get('Authorization')
  const authKey = Deno.env.get('SRK_AUTH') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  if (authHeader !== `Bearer ${authKey}`) {
    return new Response('Unauthorized', { status: 401 })
  }

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const WHAPI_TOKEN = Deno.env.get('WHAPI_API_TOKEN')!

  // Determine the 15-day window
  // Runs on 3rd  → covers 16th–end of prev month
  // Runs on 17th → covers 1st–15th of current month
  const now = new Date()
  const istOffset = 5.5 * 60 * 60 * 1000
  const istNow = new Date(now.getTime() + istOffset)
  const day = istNow.getDate()
  const year = istNow.getFullYear()
  const month = istNow.getMonth() // 0-indexed

  let fromDate: string
  let toDate: string
  let periodLabel: string

  const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  if (day <= 15) {
    // Running on 3rd: report on 16th–end of previous month
    const prevMonth = month === 0 ? 11 : month - 1
    const prevYear = month === 0 ? year - 1 : year
    const lastDay = new Date(prevYear, prevMonth + 1, 0).getDate()
    fromDate = `${prevYear}-${String(prevMonth + 1).padStart(2, '0')}-16`
    toDate = `${prevYear}-${String(prevMonth + 1).padStart(2, '0')}-${lastDay}`
    periodLabel = `${monthNames[prevMonth]} 16–${lastDay}, ${prevYear}`
  } else {
    // Running on 17th: report on 1st–15th of current month
    fromDate = `${year}-${String(month + 1).padStart(2, '0')}-01`
    toDate = `${year}-${String(month + 1).padStart(2, '0')}-15`
    periodLabel = `${monthNames[month]} 1–15, ${year}`
  }

  console.log(`Bi-weekly DAR report: ${fromDate} to ${toDate}`)

  // Single RPC call — same source of truth as admin dashboard
  const { data: rpcResult, error: rpcError } = await supabase.rpc('dar_compliance', {
    p_from_date: fromDate,
    p_to_date: toDate
  })

  if (rpcError) {
    console.error('dar_compliance RPC error:', rpcError)
    return new Response(JSON.stringify({ error: rpcError.message }), { status: 500 })
  }

  interface RpcRow {
    employee_id: string
    emp_code: string
    name: string
    department_id: number
    department_name: string
    days_present: number
    days_submitted: number
    dar_cutoff: string
    compliance_pct: number
  }

  const results: RpcRow[] = rpcResult || []

  // Sort worst compliance first
  results.sort((a, b) => a.compliance_pct - b.compliance_pct)

  const totalEmployees = results.length
  const totalPresent = results.reduce((s, r) => s + r.days_present, 0)
  const totalSubmitted = results.reduce((s, r) => s + r.days_submitted, 0)
  const overallPct = totalPresent > 0 ? Math.min(100, Math.round((totalSubmitted / totalPresent) * 100)) : 0
  const perfect = results.filter(r => r.compliance_pct >= 100).length
  const below50 = results.filter(r => r.compliance_pct < 50).length
  const zero = results.filter(r => r.compliance_pct === 0 && r.days_present > 0).length

  // Build report message
  let report = `📊 *Bi-Weekly DAR Compliance Report*\n`
  report += `📅 *${periodLabel}*\n`
  report += `─────────────────\n`
  report += `👥 Staff: ${totalEmployees}\n`
  report += `✅ Overall: ${overallPct}%\n`
  report += `🏆 100% compliance: ${perfect}\n`
  report += `⚠️ Below 50%: ${below50}\n`
  if (zero > 0) report += `❌ Zero submissions: ${zero}\n`
  report += `─────────────────\n`

  // Group by department
  const byDept: Record<string, RpcRow[]> = {}
  for (const r of results) {
    const dept = r.department_name || 'Other'
    if (!byDept[dept]) byDept[dept] = []
    byDept[dept].push(r)
  }

  for (const dept of Object.keys(byDept).sort()) {
    const deptEmps = byDept[dept]
    const deptPresent = deptEmps.reduce((s, r) => s + r.days_present, 0)
    const deptSubmitted = deptEmps.reduce((s, r) => s + r.days_submitted, 0)
    const deptPct = deptPresent > 0 ? Math.min(100, Math.round((deptSubmitted / deptPresent) * 100)) : 0

    report += `\n*${dept}* (${deptPct}%)\n`
    for (const r of deptEmps) {
      const icon = r.compliance_pct >= 90 ? '✅' : r.compliance_pct >= 50 ? '⚠️' : '❌'
      report += `${icon} ${r.name}: ${r.compliance_pct}% (${r.days_submitted}/${r.days_present})\n`
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
  console.log(`Sent to ${sentTo.length} recipients`)

  return new Response(
    JSON.stringify({
      period: periodLabel,
      from: fromDate,
      to: toDate,
      total_employees: totalEmployees,
      overall_pct: overallPct,
      perfect_compliance: perfect,
      below_50: below50,
      sent_to: sentTo
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  )
})