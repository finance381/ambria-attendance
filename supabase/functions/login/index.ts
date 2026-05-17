import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "https://finance381.github.io",
  "Access-Control-Allow-Headers": "content-type, apikey, authorization",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MAX_ATTEMPTS = 5;
const WINDOW_MINUTES = 15;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  try {
    const { phone, password } = await req.json();
    if (!phone || !password) {
      return new Response(JSON.stringify({ error: "Phone and password required" }), {
        status: 400, headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    // Normalize phone: strip +91/0, prepend 91
    const digits = phone.replace(/[^0-9]/g, "");
    var normalized;
    if (digits.startsWith('91') && digits.length === 12) {
      normalized = digits.slice(2);
    } else if (digits.startsWith('0') && digits.length === 11) {
      normalized = digits.slice(1);
    } else {
      normalized = digits;
    }
    if (!/^\d{10}$/.test(normalized)) {
      return new Response(JSON.stringify({ error: "Invalid phone number" }), {
        status: 400, headers: { ...CORS, "Content-Type": "application/json" },
      });
    }
    const phone91 = `91${normalized}`;
    const email = `${phone91}@att.ambria.local`;

    // Admin client for rate limit checks
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SRK_AUTH")!;
    const adminClient = createClient(supabaseUrl, serviceKey);

    // Check rate limit
    const windowStart = new Date(Date.now() - WINDOW_MINUTES * 60 * 1000).toISOString();
    const { count } = await adminClient
      .from("login_attempts")
      .select("*", { count: "exact", head: true })
      .eq("phone", phone91)
      .gte("attempted_at", windowStart);

    if ((count ?? 0) >= MAX_ATTEMPTS) {
      return new Response(JSON.stringify({
        error: "Too many login attempts. Try again in 15 minutes.",
        retry_after_minutes: WINDOW_MINUTES,
      }), {
        status: 429, headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    // Attempt login using anon client (returns session)
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const anonClient = createClient(supabaseUrl, anonKey);
    const { data, error } = await anonClient.auth.signInWithPassword({ email, password });

    // Record attempt
    await adminClient.from("login_attempts").insert({
      phone: phone91,
      success: !error,
    });

    if (error) {
      return new Response(JSON.stringify({ error: "Invalid phone or password" }), {
        status: 401, headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
    }), {
      status: 200, headers: { ...CORS, "Content-Type": "application/json" },
    });

  } catch (e) {
    return new Response(JSON.stringify({ error: "Server error" }), {
      status: 500, headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
});