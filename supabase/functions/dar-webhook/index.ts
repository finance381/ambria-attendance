import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'

const VERIFY_TOKEN = Deno.env.get('WA_VERIFY_TOKEN')!

serve(async (req) => {
    // --- Webhook Verification (GET) ---
    if (req.method === 'GET') {
        const url = new URL(req.url)
        const mode = url.searchParams.get('hub.mode')
        const token = url.searchParams.get('hub.verify_token')
        const challenge = url.searchParams.get('hub.challenge')

        if (mode === 'subscribe' && token === VERIFY_TOKEN) {
            return new Response(challenge, { status: 200 })
        }
        return new Response('Forbidden', { status: 403 })
    }

    // --- Incoming Message Webhook (POST) ---
    try {
        const body = await req.json()

        const supabase = createClient(
            Deno.env.get('SUPABASE_URL')!,
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
        )

        // Load known DAR group IDs
        const { data: darGroups } = await supabase
            .from('dar_groups')
            .select('wa_group_id')
            .eq('is_active', true)
        const knownGroupIds = new Set(darGroups?.map(g => g.wa_group_id) || [])

        // Load min length config
        const minLengthRaw = await supabase
            .from('app_config')
            .select('value')
            .eq('key', 'dar_min_length')
            .single()
        const minLength = parseInt(
            (minLengthRaw.data?.value || '20').replace(/"/g, '')
        )

        const toInsert: any[] = []

        for (const entry of body.entry || []) {
            for (const change of entry.changes || []) {
                if (change.field !== 'messages') continue
                const value = change.value
                if (!value?.messages) continue

                for (const msg of value.messages) {
                    if (msg.type !== 'text') continue

                    // Group messages have group context
                    const groupId = msg.group_id || null
                    if (!groupId || !knownGroupIds.has(groupId)) continue

                    const msgBody = msg.text?.body || ''
                    if (msgBody.length < minLength) continue

                    const senderWaId = msg.from || ''
                    const senderName = value.contacts?.find(
                        (c: any) => c.wa_id === senderWaId
                    )?.profile?.name || null

                    // Compute IST date
                    const istDate = new Date(
                        parseInt(msg.timestamp) * 1000
                    ).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })

                    toInsert.push({
                        wa_message_id: msg.id,
                        wa_group_id: groupId,
                        sender_wa_id: senderWaId,
                        sender_name: senderName,
                        content: msgBody,
                        message_type: 'text',
                        received_at: new Date(
                            parseInt(msg.timestamp) * 1000
                        ).toISOString(),
                        dar_date: istDate,
                        is_dar: true,
                        processed: false,
                    })
                }
            }
        }

        if (toInsert.length > 0) {
            const { error } = await supabase
                .from('dar_messages')
                .upsert(toInsert, { onConflict: 'wa_message_id' })
            if (error) console.error('DAR insert error:', error)
        }
    } catch (err) {
        console.error('Webhook processing error:', err)
    }

    // Meta requires 200 within 5 seconds or retries
    return new Response('OK', { status: 200 })
})