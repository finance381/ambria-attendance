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
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
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
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const { data: callerProfile } = await anonClient
      .from('employees')
      .select('role')
      .eq('id', caller.id)
      .eq('active', true)
      .maybeSingle()

    if (!callerProfile || callerProfile.role !== 'admin') {
      return new Response(JSON.stringify({ error: 'Only admins can create employees' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const { name, phone, department_id, role, designation, date_of_joining } = await req.json()

    if (!name || !phone || !department_id || !role) {
      return new Response(JSON.stringify({ error: 'Missing required fields: name, phone, department_id, role' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const cleanPhone = phone.replace(/[^0-9]/g, '')
    if (cleanPhone.length !== 10) {
      return new Response(JSON.stringify({ error: 'Phone must be 10 digits' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const validRoles = ['staff', 'supervisor', 'manager', 'admin']
    if (!validRoles.includes(role)) {
      return new Response(JSON.stringify({ error: 'Invalid role' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const adminClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    const { data: existingEmp } = await adminClient
      .from('employees')
      .select('id, name')
      .eq('phone', cleanPhone)
      .maybeSingle()

    if (existingEmp) {
      return new Response(JSON.stringify({ error: 'Phone already registered to ' + existingEmp.name }), {
        status: 409,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const { data: seqRow, error: seqError } = await adminClient
      .rpc('next_emp_code')

    if (seqError || !seqRow) {
      return new Response(JSON.stringify({ error: 'Failed to generate emp_code' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }
    const empCode = seqRow

    const fakeEmail = '91' + cleanPhone + '@att.ambria.local'
    const initialPassword = 'ambria123'

    const { data: authData, error: authError } = await adminClient.auth.admin.createUser({
      email: fakeEmail,
      password: initialPassword,
      email_confirm: true,
    })

    if (authError) {
      return new Response(JSON.stringify({ error: 'Auth creation failed: ' + authError.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const { data: empData, error: empError } = await adminClient
      .from('employees')
      .insert({
        id: authData.user.id,
        emp_code: empCode,
        name: name.trim(),
        phone: cleanPhone,
        department_id: department_id,
        role: role,
        designation: designation || null,
        date_of_joining: date_of_joining || null,
        is_casual: false,
        active: true,
      })
      .select('id, emp_code, name')
      .single()

    if (empError) {
      await adminClient.auth.admin.deleteUser(authData.user.id)
      return new Response(JSON.stringify({ error: 'Employee creation failed: ' + empError.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    await adminClient.from('activity_log').insert({
      actor_id: caller.id,
      action: 'CREATE_EMPLOYEE',
      target_employee_id: empData.id,
      details: { emp_code: empCode, name: name.trim(), role: role }
    })

    return new Response(JSON.stringify({
      id: empData.id,
      emp_code: empData.emp_code,
      name: empData.name,
      initial_password: initialPassword,
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})