import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'

serve(async (req) => {
  const authHeader = req.headers.get('Authorization')
  if (authHeader !== `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`) {
    return new Response('Unauthorized', { status: 401 })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  const WHAPI_TOKEN = Deno.env.get('WHAPI_API_TOKEN')
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })

  // All active non-casual employees grouped by department
  const { data: employees } = await supabase
    .from('employees')
    .select('emp_code, name, department_id, departments(name)')
    .eq('active', true)
    .eq('is_casual', false)
    .order('department_id')
    .order('name')

  // Today's submitted DARs
  const { data: dars } = await supabase
    .from('daily_reports')
    .select('emp_code')
    .eq('report_date', today)

  const submittedCodes = new Set((dars || []).map(d => d.emp_code))

  // Group by department
  const deptMap: Record<string, { name: string, submitted: string[], missing: string[] }> = {}

  for (const emp of (employees || [])) {
    const deptName = (emp as any).departments?.name || 'Unassigned'
    if (!deptMap[deptName]) {
      deptMap[deptName] = { name: deptName, submitted: [], missing: [] }
    }
    if (submittedCodes.has(emp.emp_code)) {
      deptMap[deptName].submitted.push(emp.name)
    } else {
      deptMap[deptName].missing.push(emp.name)
    }
  }

  // Build report
  const totalExpected = (employees || []).length
  const totalSubmitted = submittedCodes.size
  const totalMissing = totalExpected - totalSubmitted

  let report = `📋 *DAR Report — ${today}*\n`
  report += `✅ Submitted: ${totalSubmitted}/${totalExpected}\n`
  report += `❌ Missing: ${totalMissing}\n`
  report += `─────────────────\n`

  for (const dept of Object.values(deptMap)) {
    report += `\n*${dept.name}*\n`
    if (dept.submitted.length > 0) {
      report += `✅ ${dept.submitted.join(', ')}\n`
    }
    if (dept.missing.length > 0) {
      report += `❌ ${dept.missing.join(', ')}\n`
    }
  }

  // Send via Whapi if token exists
  let sentTo: string[] = []
  if (WHAPI_TOKEN) {
    const recipientsRow = await supabase
      .from('app_config')
      .select('value')
      .eq('key', 'dar_report_recipients')
      .single()

    let recipients: string[] = []
    try {
      const raw = recipientsRow.data?.value
      recipients = JSON.parse(typeof raw === 'string' ? raw.replace(/^"|"$/g, '') : raw || '[]')
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
            to: phone + '@s.whatsapp.net',
            body: report,
          }),
        })
        sentTo.push(phone)
        await new Promise(r => setTimeout(r, 1000))
      } catch (err) {
        console.error(`Failed to send to ${phone}:`, err)
      }
    }
  }

  console.log(`DAR consolidate ${today}: ${totalSubmitted}/${totalExpected}, sent to ${sentTo.length} recipients`)

  return new Response(
    JSON.stringify({ date: today, expected: totalExpected, submitted: totalSubmitted, sent_to: sentTo }),
    { status: 200 }
  )
})