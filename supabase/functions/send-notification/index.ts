import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const VAPID_PUBLIC_KEY = Deno.env.get("VAPID_PUBLIC_KEY")!
const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY")!
const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") || "mailto:admin@ambria.local"
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
    // Verify caller is internal (pg_cron RPCs send service_role_key as Bearer)
    const authHeader = req.headers.get('Authorization') || ''
    const token = authHeader.replace('Bearer ', '')
    if (token !== SUPABASE_SERVICE_ROLE_KEY) {
      return new Response(JSON.stringify({ 
        error: 'Unauthorized'
      }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const { employee_id, employee_ids, title, body, tag, url } = await req.json()

    // Validate
    const targetIds = employee_ids || (employee_id ? [employee_id] : [])
    if (targetIds.length === 0) {
      return new Response(JSON.stringify({ error: "No employee_id or employee_ids provided" }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    // Get all subscriptions for target employees
    const { data: subs, error: subErr } = await supabase
      .from("push_subscriptions")
      .select("id, employee_id, endpoint, p256dh, auth")
      .in("employee_id", targetIds)

    if (subErr || !subs || subs.length === 0) {
      return new Response(JSON.stringify({ sent: 0, message: "No subscriptions found" }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const webPush = await import("https://esm.sh/web-push@3.6.7")
    webPush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)

    const payload = JSON.stringify({
      title: title || "Ambria Attendance",
      body: body || "You have a notification",
      tag: tag || "ambria",
      url: url || "/ambria-attendance/"
    })

    let sent = 0
    let failed = 0
    const staleIds: number[] = []

    for (const sub of subs) {
      try {
        await webPush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth }
          },
          payload
        )
        sent++
      } catch (err: any) {
        // 410 Gone or 404 = subscription expired, clean it up
        if (err.statusCode === 410 || err.statusCode === 404) {
          staleIds.push(sub.id)
        }
        failed++
      }
    }

    // Clean up expired subscriptions
    if (staleIds.length > 0) {
      await supabase.from("push_subscriptions").delete().in("id", staleIds)
    }

    return new Response(JSON.stringify({ sent, failed, cleaned: staleIds.length }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})