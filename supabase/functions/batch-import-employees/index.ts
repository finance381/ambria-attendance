import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': 'https://finance381.github.io',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const anonClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    )

    const { data: { user: caller } } = await anonClient.auth.getUser()
    if (!caller) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const { data: callerProfile } = await anonClient
      .from('employees')
      .select('role')
      .eq('id', caller.id)
      .eq('active', true)
      .maybeSingle()

    if (!callerProfile || callerProfile.role !== 'admin') {
      return new Response(JSON.stringify({ error: 'Only admins can import employees' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const { employees: rows } = await req.json()

    if (!rows || !Array.isArray(rows) || rows.length === 0) {
      return new Response(JSON.stringify({ error: 'No employees provided' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    if (rows.length > 200) {
      return new Response(JSON.stringify({ error: 'Max 200 employees per batch' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const adminClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    const validRoles = ['staff', 'supervisor', 'manager', 'admin']
    const results: { name: string; emp_code?: string; error?: string }[] = []
    const createdAuthIds: string[] = []

    // Validate all rows first
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i]
      if (!r.name || !r.phone || !r.department_id || !r.role) {
        return new Response(JSON.stringify({
          error: `Row ${i + 1} (${r.name || 'unknown'}): missing required fields`
        }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }
      const clean = r.phone.replace(/[^0-9]/g, '')
      if (clean.length !== 10) {
        return new Response(JSON.stringify({
          error: `Row ${i + 1} (${r.name}): phone must be 10 digits`
        }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }
      if (!validRoles.includes(r.role)) {
        return new Response(JSON.stringify({
          error: `Row ${i + 1} (${r.name}): invalid role "${r.role}"`
        }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }
    }

    // Check all phones for duplicates in one query
    const phones = rows.map(r => r.phone.replace(/[^0-9]/g, ''))
    const { data: existingEmps } = await adminClient
      .from('employees')
      .select('phone, name')
      .in('phone', phones)

    if (existingEmps && existingEmps.length > 0) {
      const dupes = existingEmps.map(e => `${e.phone} (${e.name})`).join(', ')
      return new Response(JSON.stringify({
        error: `These phones already exist: ${dupes}`
      }), { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // Check for duplicate phones within the batch itself
    const phoneSet = new Set<string>()
    for (const p of phones) {
      if (phoneSet.has(p)) {
        return new Response(JSON.stringify({
          error: `Duplicate phone ${p} within the CSV`
        }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }
      phoneSet.add(p)
    }

    // Process all rows — create auth users + employee rows
    try {
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i]
        const cleanPhone = r.phone.replace(/[^0-9]/g, '')
        const fakeEmail = '91' + cleanPhone + '@att.ambria.local'

        // Generate emp_code via sequence
        const { data: empCode, error: codeErr } = await adminClient.rpc('next_emp_code')
        if (codeErr || !empCode) throw new Error(`Failed to generate emp_code for ${r.name}`)

        // Create auth user
        const { data: authData, error: authErr } = await adminClient.auth.admin.createUser({
          email: fakeEmail,
          password: 'ambria123',
          email_confirm: true,
        })
        if (authErr) throw new Error(`Auth failed for ${r.name}: ${authErr.message}`)

        createdAuthIds.push(authData.user.id)

        // Create employee row
        const { error: empErr } = await adminClient
          .from('employees')
          .insert({
            id: authData.user.id,
            emp_code: empCode,
            name: r.name.trim(),
            phone: cleanPhone,
            department_id: r.department_id,
            role: r.role,
            designation: r.designation || null,
            date_of_joining: r.date_of_joining || null,
            is_casual: false,
            active: true,
          })

        if (empErr) throw new Error(`Employee insert failed for ${r.name}: ${empErr.message}`)

        results.push({ name: r.name, emp_code: empCode })
      }

      // Log the batch import
      await adminClient.from('activity_log').insert({
        actor_id: caller.id,
        action: 'BATCH_IMPORT',
        details: { count: results.length, emp_codes: results.map(r => r.emp_code) }
      })

      return new Response(JSON.stringify({
        ok: true,
        imported: results.length,
        employees: results
      }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

    } catch (batchErr: any) {
      // Rollback: delete any auth users we already created
      for (const authId of createdAuthIds) {
        try {
          await adminClient.from('employees').delete().eq('id', authId)
          await adminClient.auth.admin.deleteUser(authId)
        } catch (_) { /* best effort cleanup */ }
      }

      return new Response(JSON.stringify({
        error: batchErr.message,
        rolled_back: createdAuthIds.length
      }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})