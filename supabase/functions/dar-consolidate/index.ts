import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'

serve(async (req) => {
    // Verify cron auth
    const authHeader = req.headers.get('Authorization')
    if (authHeader !== `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`) {
        return new Response('Unauthorized', { status: 401 })
    }

    const supabase = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const WA_TOKEN = Deno.env.get('WA_ACCESS_TOKEN')!
    const WA_PHONE_ID = Deno.env.get('WA_PHONE_NUMBER_ID')!

    // Today in IST
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })

    // Get all active groups with their expected staff
    const { data: groups } = await supabase
        .from('dar_groups')
        .select(`
            id, wa_group_id, group_name,
            dar_staff(wa_id, employees(name))
        `)
        .eq('is_active', true)
        .eq('dar_staff.is_active', true)

    // Get today's unprocessed messages
    const { data: messages } = await supabase
        .from('dar_messages')
        .select('wa_group_id, sender_wa_id, sender_name')
        .eq('dar_date', today)
        .eq('is_dar', true)
        .eq('processed', false)

    // Get recipients
    const recipientsRow = await supabase
        .from('app_config')
        .select('value')
        .eq('key', 'dar_report_recipients')
        .single()
    const recipients: string[] = JSON.parse(recipientsRow.data?.value || '[]')

    // Get template name
    const templateRow = await supabase
        .from('app_config')
        .select('value')
        .eq('key', 'dar_report_template_name')
        .single()
    const templateName = (templateRow.data?.value || 'dar_daily_report').replace(/"/g, '')

    for (const group of (groups || [])) {
        const groupMsgs = (messages || []).filter(m => m.wa_group_id === group.wa_group_id)
        const expectedStaff = group.dar_staff || []

        // Who submitted (deduplicate by wa_id)
        const submittedWaIds = new Set(groupMsgs.map(m => m.sender_wa_id))
        const submitted = expectedStaff.filter(s => submittedWaIds.has(s.wa_id))
        const missing = expectedStaff.filter(s => !submittedWaIds.has(s.wa_id))

        const submittedNames = submitted.map(s => s.employees?.name || s.wa_id)
        const missingNames = missing.map(s => s.employees?.name || s.wa_id)

        // Build simple summary
        let summary = `✅ ${submittedNames.length}/${expectedStaff.length} submitted`

        if (submittedNames.length > 0) {
            summary += `\n${submittedNames.join(', ')}`
        }

        if (missingNames.length > 0) {
            summary += `\n\n❌ Missing: ${missingNames.join(', ')}`
        } else {
            summary += `\n\n🎯 All submitted!`
        }

        // Store report
        await supabase.from('dar_reports').upsert({
            dar_group_id: group.id,
            report_date: today,
            total_expected: expectedStaff.length,
            total_submitted: submittedNames.length,
            missing_names: missingNames,
            summary: summary,
            raw_content: null,
            sent_to: recipients,
            sent_at: new Date().toISOString(),
        }, { onConflict: 'dar_group_id,report_date' })

        // Send to each management recipient
        for (const phone of recipients) {
            try {
                await fetch(
                    `https://graph.facebook.com/v21.0/${WA_PHONE_ID}/messages`,
                    {
                        method: 'POST',
                        headers: {
                            'Authorization': `Bearer ${WA_TOKEN}`,
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({
                            messaging_product: 'whatsapp',
                            to: phone,
                            type: 'template',
                            template: {
                                name: templateName,
                                language: { code: 'en' },
                                components: [{
                                    type: 'body',
                                    parameters: [
                                        { type: 'text', text: group.group_name },
                                        { type: 'text', text: today },
                                        { type: 'text', text: summary }
                                    ]
                                }]
                            }
                        }),
                    }
                )
                // Pace sends
                await new Promise(r => setTimeout(r, 1000))
            } catch (err) {
                console.error(`Failed to send to ${phone}:`, err)
            }
        }

        // Mark messages as processed
        const msgWaIds = groupMsgs.map(m => m.sender_wa_id)
        if (groupMsgs.length > 0) {
            await supabase
                .from('dar_messages')
                .update({ processed: true })
                .eq('wa_group_id', group.wa_group_id)
                .eq('dar_date', today)
                .eq('is_dar', true)
                .eq('processed', false)
        }
    }

    return new Response(JSON.stringify({ date: today, groups: groups?.length || 0 }), { status: 200 })
})