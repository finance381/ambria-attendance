import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const VAPID_PUBLIC_KEY = Deno.env.get("VAPID_PUBLIC_KEY")!
const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY")!
// Apple's push service (iPhone/Safari) rejects a subject on a fake domain
// like ambria.local with 403 BadJwtToken; Google doesn't check. The project
// secret currently holds mailto:admin@ambria.local, so ignore any .local value.
const ENV_SUBJECT = Deno.env.get("VAPID_SUBJECT") || ""
const VAPID_SUBJECT = ENV_SUBJECT && !/\.local\b/i.test(ENV_SUBJECT)
  ? ENV_SUBJECT
  : "mailto:software@ambria.in"
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
const AUTH_KEY = Deno.env.get("SRK_AUTH")!

// Production (GitHub Pages) plus local `npm run dev`. Any other origin gets
// the production value back, so the browser blocks it.
const ALLOWED_ORIGINS = [
  'https://finance381.github.io',
  /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/,
]

function corsFor(req: Request) {
  const origin = req.headers.get('Origin') || ''
  const ok = ALLOWED_ORIGINS.some((o) => typeof o === 'string' ? o === origin : o.test(origin))
  return {
    'Access-Control-Allow-Origin': ok ? origin : 'https://finance381.github.io',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Vary': 'Origin',
  }
}

serve(async (req) => {
  const corsHeaders = corsFor(req)
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Verify caller is internal (pg_cron RPCs send service_role_key as Bearer)
    const authHeader = req.headers.get('Authorization') || ''
    const token = authHeader.replace('Bearer ', '')
    if (token !== AUTH_KEY) {
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

    // Send to every device at once, not one after another: callers (pg_net
    // from SQL functions) give up after a few seconds, and a sequential loop
    // over many devices never reached the stale-row cleanup below.
    const results = await Promise.allSettled(subs.map((sub) =>
      webPush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth }
        },
        payload,
        { timeout: 10000 }
      )
    ))

    // Why each failed device failed (push service status + reply), so a
    // "sent: 0" in net._http_response can be diagnosed from SQL.
    const errors: { status: number | null, service: string, reply: string }[] = []

    results.forEach((r, i) => {
      if (r.status === 'fulfilled') {
        sent++
        return
      }
      const err: any = r.reason
      errors.push({
        status: err?.statusCode ?? null,
        service: new URL(subs[i].endpoint).host,
        reply: String(err?.body || err?.message || '').slice(0, 200)
      })
      // 410 Gone or 404 = subscription expired, clean it up
      if (err?.statusCode === 410 || err?.statusCode === 404) {
        staleIds.push(subs[i].id)
      }
      failed++
    })

    // Clean up expired subscriptions
    if (staleIds.length > 0) {
      await supabase.from("push_subscriptions").delete().in("id", staleIds)
    }

    return new Response(JSON.stringify({ sent, failed, cleaned: staleIds.length, errors }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
