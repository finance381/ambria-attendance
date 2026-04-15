import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SRK_AUTH")!

const corsHeaders = {
  'Access-Control-Allow-Origin': 'https://finance381.github.io',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization') || ''
    const token = authHeader.replace('Bearer ', '')
    if (token !== SUPABASE_SERVICE_ROLE_KEY) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    // Today's date IST
    const now = new Date()
    const istOffset = 5.5 * 60 * 60 * 1000
    const ist = new Date(now.getTime() + istOffset)
    const today = ist.toISOString().slice(0, 10)
    const monthStart = today.slice(0, 7) + '-01'

    // Total active employees
    const { count: totalEmp } = await supabase
      .from('employees')
      .select('id', { count: 'exact', head: true })
      .eq('active', true)
      .eq('is_casual', false)

    // Today's punched-in employees
    const { data: todayPunches } = await supabase
      .from('punches')
      .select('employee_id')
      .eq('attendance_date', today)
      .eq('punch_type', 'in')

    const punchedIds = [...new Set((todayPunches || []).map(p => p.employee_id))]
    const presentCount = punchedIds.length
    const absentCount = (totalEmp || 0) - presentCount

    // Pending claims
    const { count: pendingClaims } = await supabase
      .from('missed_claims')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending')

    // Open punches (no out after in)
    const { data: openPunches } = await supabase.rpc('open_punches')
    const openCount = openPunches ? openPunches.length : 0

    // Top 5 absentees this month
    const { data: allEmps } = await supabase
      .from('employees')
      .select('id, name, emp_code')
      .eq('active', true)
      .eq('is_casual', false)

    const { data: monthPunches } = await supabase
      .from('punches')
      .select('employee_id, attendance_date')
      .gte('attendance_date', monthStart)
      .lte('attendance_date', today)
      .eq('punch_type', 'in')

    const { data: monthOverrides } = await supabase
      .from('attendance_overrides')
      .select('employee_id, attendance_date')
      .gte('attendance_date', monthStart)
      .lte('attendance_date', today)

    // Count days with activity per employee
    const activityMap: Record<string, Set<string>> = {}
    for (const p of (monthPunches || [])) {
      if (!activityMap[p.employee_id]) activityMap[p.employee_id] = new Set()
      activityMap[p.employee_id].add(p.attendance_date)
    }
    for (const o of (monthOverrides || [])) {
      if (!activityMap[o.employee_id]) activityMap[o.employee_id] = new Set()
      activityMap[o.employee_id].add(o.attendance_date)
    }

    // Calculate business days so far this month (7-day week)
    const start = new Date(monthStart + 'T00:00:00')
    const end = new Date(today + 'T00:00:00')
    let totalDays = 0
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) totalDays++

    const absentees = (allEmps || []).map(e => {
      const activeDays = activityMap[e.id] ? activityMap[e.id].size : 0
      return { name: e.name, emp_code: e.emp_code, absents: totalDays - activeDays }
    }).sort((a, b) => b.absents - a.absents).slice(0, 5)

    const absenteeRows = absentees.map((a, i) =>
      `<tr><td style="padding:8px 12px;border-bottom:1px solid #eee;color:#666">${i + 1}</td><td style="padding:8px 12px;border-bottom:1px solid #eee;font-weight:600">${a.name}</td><td style="padding:8px 12px;border-bottom:1px solid #eee;font-family:monospace;color:#888">${a.emp_code}</td><td style="padding:8px 12px;border-bottom:1px solid #eee;color:#e74c3c;font-weight:700;text-align:center">${a.absents}</td></tr>`
    ).join('')

    const dateFormatted = new Date(today).toLocaleDateString('en-IN', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
    })

    const html = `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#fff">
      <div style="background:#1e293b;padding:24px 30px;border-radius:8px 8px 0 0">
        <h1 style="color:#fff;margin:0;font-size:20px">Ambria Attendance — Daily Report</h1>
        <p style="color:#94a3b8;margin:6px 0 0;font-size:13px">${dateFormatted}</p>
      </div>

      <div style="padding:24px 30px">
        <table style="width:100%;border-collapse:collapse;margin-bottom:24px">
          <tr>
            <td style="padding:16px;background:#f0fdf4;border-radius:8px;text-align:center;width:25%">
              <div style="font-size:28px;font-weight:700;color:#1e293b">${totalEmp || 0}</div>
              <div style="font-size:11px;color:#64748b;margin-top:4px">TOTAL</div>
            </td>
            <td style="width:8px"></td>
            <td style="padding:16px;background:#f0fdf4;border-radius:8px;text-align:center;width:25%">
              <div style="font-size:28px;font-weight:700;color:#22c55e">${presentCount}</div>
              <div style="font-size:11px;color:#64748b;margin-top:4px">PRESENT</div>
            </td>
            <td style="width:8px"></td>
            <td style="padding:16px;background:#fef2f2;border-radius:8px;text-align:center;width:25%">
              <div style="font-size:28px;font-weight:700;color:#ef4444">${absentCount}</div>
              <div style="font-size:11px;color:#64748b;margin-top:4px">ABSENT</div>
            </td>
            <td style="width:8px"></td>
            <td style="padding:16px;background:#fffbeb;border-radius:8px;text-align:center;width:25%">
              <div style="font-size:28px;font-weight:700;color:#f59e0b">${pendingClaims || 0}</div>
              <div style="font-size:11px;color:#64748b;margin-top:4px">PENDING CLAIMS</div>
            </td>
          </tr>
        </table>

        ${openCount > 0 ? `<p style="background:#fef3c7;padding:10px 14px;border-radius:6px;font-size:13px;color:#92400e">⚠️ <strong>${openCount}</strong> unresolved punch-in(s) from today</p>` : ''}

        <h3 style="font-size:14px;color:#1e293b;margin:20px 0 10px;border-bottom:2px solid #e2e8f0;padding-bottom:8px">Top Absentees This Month</h3>
        <table style="width:100%;border-collapse:collapse;font-size:13px">
          <tr style="background:#f8fafc">
            <th style="padding:8px 12px;text-align:left;color:#94a3b8;font-size:11px">#</th>
            <th style="padding:8px 12px;text-align:left;color:#94a3b8;font-size:11px">NAME</th>
            <th style="padding:8px 12px;text-align:left;color:#94a3b8;font-size:11px">CODE</th>
            <th style="padding:8px 12px;text-align:center;color:#94a3b8;font-size:11px">ABSENTS</th>
          </tr>
          ${absenteeRows}
        </table>

        <p style="margin-top:24px;font-size:12px;color:#94a3b8;text-align:center">
          <a href="https://finance381.github.io/ambria-attendance/admin" style="color:#3b82f6;text-decoration:none">Open Admin Dashboard →</a>
        </p>
      </div>

      <div style="background:#f8fafc;padding:16px 30px;border-radius:0 0 8px 8px;text-align:center">
        <p style="margin:0;font-size:11px;color:#94a3b8">Ambria Cuisines — Automated Daily Report</p>
      </div>
    </div>`

    // Send via Resend
    const emailRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: 'Ambria Attendance <reports@ambria.in>',
        to: ['hr@ambria.in'],
        subject: `Attendance Report — ${dateFormatted}`,
        html: html
      })
    })

    const emailData = await emailRes.json()

    return new Response(JSON.stringify({ success: true, email: emailData }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})