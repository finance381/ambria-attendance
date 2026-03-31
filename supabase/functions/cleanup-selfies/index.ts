import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

Deno.serve(async (req) => {
  try {
    // Verify this is called by cron or admin (not random users)
    const authHeader = req.headers.get('Authorization')
    const cronSecret = Deno.env.get('CRON_SECRET')

    // Allow either: valid cron secret OR authenticated admin
    let isAuthorized = false

    if (cronSecret && req.headers.get('x-cron-secret') === cronSecret) {
      isAuthorized = true
    }

    if (!isAuthorized && authHeader) {
      const anonClient = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_ANON_KEY')!,
        { global: { headers: { Authorization: authHeader } } }
      )
      const { data: { user } } = await anonClient.auth.getUser()
      if (user) {
        const { data: profile } = await anonClient
          .from('employees')
          .select('role')
          .eq('id', user.id)
          .eq('active', true)
          .maybeSingle()
        if (profile && profile.role === 'admin') {
          isAuthorized = true
        }
      }
    }

    if (!isAuthorized) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    const adminClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    // Get retention days from config
    const { data: configRow } = await adminClient
      .from('app_config')
      .select('value')
      .eq('key', 'photo_retention_days')
      .maybeSingle()

    const retentionDays = configRow ? parseInt(configRow.value, 10) : 90
    const cutoffDate = new Date()
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays)
    const cutoffStr = cutoffDate.toISOString().slice(0, 10)

    // Find punches with selfies older than retention period
    const { data: oldPunches, error: queryError } = await adminClient
      .from('punches')
      .select('id, selfie_path')
      .not('selfie_path', 'is', null)
      .lt('attendance_date', cutoffStr)
      .limit(500)  // batch to avoid timeout

    if (queryError) {
      return new Response(JSON.stringify({ error: queryError.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    if (!oldPunches || oldPunches.length === 0) {
      return new Response(JSON.stringify({
        message: 'No selfies to clean up',
        cutoff_date: cutoffStr,
        retention_days: retentionDays
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    // Collect valid file paths
    const filePaths: string[] = []
    const punchIds: number[] = []

    for (const punch of oldPunches) {
      if (punch.selfie_path && punch.selfie_path.trim() !== '') {
        filePaths.push(punch.selfie_path)
        punchIds.push(punch.id)
      }
    }

    // Delete files from storage in batches of 100
    let deletedFiles = 0
    let failedFiles = 0

    for (let i = 0; i < filePaths.length; i += 100) {
      const batch = filePaths.slice(i, i + 100)
      const { data: deleteResult, error: deleteError } = await adminClient.storage
        .from('selfies')
        .remove(batch)

      if (deleteError) {
        failedFiles += batch.length
      } else {
        deletedFiles += (deleteResult || []).length
      }
    }

    // Clear selfie_path on the punch records (keep the record, just remove the file reference)
    if (punchIds.length > 0) {
      await adminClient
        .from('punches')
        .update({ selfie_path: null })
        .in('id', punchIds)
    }

    // Log the cleanup
    await adminClient.from('activity_log').insert({
      actor_id: '00000000-0000-0000-0000-000000000000',  // system action
      action: 'SELFIE_CLEANUP',
      details: {
        cutoff_date: cutoffStr,
        retention_days: retentionDays,
        files_deleted: deletedFiles,
        files_failed: failedFiles,
        records_cleared: punchIds.length
      }
    })

    return new Response(JSON.stringify({
      success: true,
      cutoff_date: cutoffStr,
      retention_days: retentionDays,
      files_deleted: deletedFiles,
      files_failed: failedFiles,
      records_cleared: punchIds.length
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    })

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    })
  }
})