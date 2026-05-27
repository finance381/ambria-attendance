import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'

serve(async (_req) => {
    const supabase = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const WHAPI_TOKEN = Deno.env.get('WHAPI_API_TOKEN')!

    const now = new Date()
    const today = now.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
    const yesterdayDate = new Date(now.getTime() - 86400000)
    const yesterday = yesterdayDate.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })

    // Min message length for DAR
    const minLengthRow = await supabase
        .from('app_config')
        .select('value')
        .eq('key', 'dar_min_length')
        .single()
    const minLength = parseInt(
        String(minLengthRow.data?.value || '50').replace(/"/g, '')
    )

    // Get active groups with staff
    const { data: groups } = await supabase
        .from('dar_groups')
        .select(`
            id, wa_group_id, group_name,
            dar_staff(wa_id, employees(name))
        `)
        .eq('is_active', true)
        .eq('dar_staff.is_active', true)

    // Recipients
    const recipientsRow = await supabase
        .from('app_config')
        .select('value')
        .eq('key', 'dar_report_recipients')
        .single()
    const recipientVal = recipientsRow.data?.value
    const recipients: string[] = typeof recipientVal === 'string'
        ? JSON.parse(recipientVal.replace(/^"|"$/g, ''))
        : (Array.isArray(recipientVal) ? recipientVal : [])

    const reportParts: string[] = []

    for (const group of (groups || [])) {
        const expectedStaff = group.dar_staff || []

        // Fetch today's messages from Whapi
        let groupMessages: any[] = []
        try {
            const resp = await fetch(
                `https://gate.whapi.cloud/messages/list/${group.wa_group_id}?count=200`,
                {
                    headers: { 'Authorization': `Bearer ${WHAPI_TOKEN}` }
                }
            )
            const data = await resp.json()
            groupMessages = data.messages || []
        } catch (err) {
            console.error(`Failed to fetch messages for ${group.group_name}:`, err)
            continue
        }

        // Filter: today's text messages, not from bot, meets min length
        const todayMessages = groupMessages.filter((msg: any) => {
            if (msg.from_me) return false
            if (msg.type !== 'text' && msg.type !== 'chat') return false
            const msgDate = new Date(msg.timestamp * 1000)
                .toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
            if (msgDate !== today) return false
            const body = msg.text?.body || msg.body || ''
            if (body.length < minLength) return false
            return true
        })

        // Store in dar_messages for record
        const toInsert = todayMessages.map((msg: any) => ({
            wa_message_id: msg.id,
            wa_group_id: group.wa_group_id,
            sender_wa_id: (msg.from || '').replace('@s.whatsapp.net', ''),
            sender_name: msg.from_name || null,
            content: msg.text?.body || msg.body || '',
            message_type: 'text',
            received_at: new Date(msg.timestamp * 1000).toISOString(),
            dar_date: today,
            is_dar: true,
            processed: true,
        }))

        if (toInsert.length > 0) {
            await supabase
                .from('dar_messages')
                .upsert(toInsert, { onConflict: 'wa_message_id' })
        }

        // Match senders to staff
        const submittedWaIds = new Set(
            todayMessages.map((m: any) => (m.from || '').replace('@s.whatsapp.net', ''))
        )
        const submitted = expectedStaff.filter(s => submittedWaIds.has(s.wa_id))
        const missing = expectedStaff.filter(s => !submittedWaIds.has(s.wa_id))

        const submittedNames = submitted.map(s => s.employees?.name || s.wa_id)
        const missingNames = missing.map(s => s.employees?.name || s.wa_id)

        const groupSummary = `*${group.group_name}*\n✅ ${submittedNames.length}/${expectedStaff.length}: ${submittedNames.length > 0 ? submittedNames.join(', ') : 'None'}${missingNames.length > 0 ? '\n❌ Missing: ' + missingNames.join(', ') : '\n🎯 All submitted!'}`

        reportParts.push(groupSummary)

        await supabase.from('dar_reports').upsert({
            dar_group_id: group.id,
            report_date: yesterday,
            total_expected: expectedStaff.length,
            total_submitted: submittedNames.length,
            missing_names: missingNames,
            summary: groupSummary,
            raw_content: null,
            sent_to: recipients,
            sent_at: new Date().toISOString(),
        }, { onConflict: 'dar_group_id,report_date' })
    }

    // Send one consolidated message to each recipient
    if (reportParts.length > 0) {
        const fullReport = `📋 *DAR Report — ${yesterday}*\n\n${reportParts.join('\n\n─────────────\n\n')}`

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
                        body: fullReport,
                    }),
                })
                await new Promise(r => setTimeout(r, 1500))
            } catch (err) {
                console.error(`Failed to send to ${phone}:`, err)
            }
        }
    }

    console.log('DAR consolidation done:', today, groups?.length || 0, 'groups', reportParts.length, 'reports')
    return new Response(JSON.stringify({ date: today, groups: groups?.length || 0 }), { status: 200 })
})