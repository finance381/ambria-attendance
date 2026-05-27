import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'

serve(async (req) => {
    try {
        const body = await req.json()

        const supabase = createClient(
            Deno.env.get('SUPABASE_URL')!,
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
        )

        const { data: darGroups } = await supabase
            .from('dar_groups')
            .select('wa_group_id')
            .eq('is_active', true)
        const knownGroupIds = new Set(darGroups?.map(g => g.wa_group_id) || [])

        const minLengthRow = await supabase
            .from('app_config')
            .select('value')
            .eq('key', 'dar_min_length')
            .single()
        const minLength = parseInt(
            (minLengthRow.data?.value || '20').replace(/"/g, '')
        )

        const messages = body.messages || []
        const toInsert: any[] = []

        for (const msg of messages) {
            if (msg.from_me) continue

            const chatId = msg.chat_id || ''
            if (!chatId.endsWith('@g.us')) continue
            if (!knownGroupIds.has(chatId)) continue

            if (msg.type !== 'text' && msg.type !== 'chat') continue

            const msgBody = msg.text?.body || msg.body || ''
            if (msgBody.length < minLength) continue

            const senderWaId = (msg.from || '').replace('@s.whatsapp.net', '')
            const senderName = msg.from_name || null

            const timestamp = msg.timestamp
                ? new Date(msg.timestamp * 1000)
                : new Date()
            const istDate = timestamp.toLocaleDateString('en-CA', {
                timeZone: 'Asia/Kolkata'
            })

            toInsert.push({
                wa_message_id: msg.id,
                wa_group_id: chatId,
                sender_wa_id: senderWaId,
                sender_name: senderName,
                content: msgBody,
                message_type: 'text',
                received_at: timestamp.toISOString(),
                dar_date: istDate,
                is_dar: true,
                processed: false,
            })
        }

        if (toInsert.length > 0) {
            const { error } = await supabase
                .from('dar_messages')
                .upsert(toInsert, { onConflict: 'wa_message_id' })
            if (error) console.error('DAR insert error:', error)
            else console.log('Inserted', toInsert.length, 'messages')
        }
    } catch (err) {
        console.error('Webhook error:', err)
    }

    return new Response('OK', { status: 200 })
})