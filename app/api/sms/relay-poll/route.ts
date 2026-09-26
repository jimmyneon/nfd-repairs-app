import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient, supabaseRetry, fetchWithTimeout } from '@/lib/resilience'
import { requireCronSecret } from '@/lib/api-auth'

/**
 * POST /api/sms/relay-poll
 *
 * Cron endpoint that polls the NFD SMS Relay for:
 *   1. New inbound SMS (customer replies) → replayed through /api/sms/reply
 *   2. Status updates (SENT/DELIVERED/FAILED) → synced to sms_logs
 *
 * This replaces the MacroDroid webhook callbacks. Instead of MacroDroid
 * pushing to /api/macrodroid/sms-sent and /api/messages/incoming, the relay
 * holds the data and this cron polls for it.
 *
 * Recommended cron interval: every 30 seconds (or 1 minute minimum on
 * Supabase free tier).
 *
 * State tracking: the last-processed timestamps are stored in the
 * admin_settings table under keys 'relay_last_inbound_at' and
 * 'relay_last_status_at'.
 *
 * Auth: requires cron secret (same as other cron endpoints).
 */

export const maxDuration = 60

export async function POST(request: NextRequest) {
  const cronResponse = requireCronSecret(request)
  if (cronResponse) return cronResponse

  const relayUrl = process.env.RELAY_URL
  const relayAnonKey = process.env.RELAY_ANON_KEY
  const relayApiKey = process.env.RELAY_API_KEY

  if (!relayUrl || !relayAnonKey || !relayApiKey) {
    return NextResponse.json(
      { error: 'SMS relay not configured' },
      { status: 500 }
    )
  }

  const supabase = createServiceClient()
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

  const results = {
    inbound_processed: 0,
    inbound_errors: 0,
    status_updated: 0,
    status_errors: 0,
  }

  // ------------------------------------------------------------------
  // 1. Poll for new inbound SMS and replay through /api/sms/reply
  // ------------------------------------------------------------------
  try {
    const lastInboundAt = await getSetting(supabase, 'relay_last_inbound_at')
    console.log(`[relay-poll] Polling inbound since: ${lastInboundAt || 'beginning'}`)

    const inboundResponse = await fetchWithTimeout(
      `${relayUrl}/rest/v1/rpc/get_inbound`,
      {
        method: 'POST',
        headers: {
          'apikey': relayAnonKey,
          'Authorization': `Bearer ${relayAnonKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          api_key: relayApiKey,
          limit_count: 50,
          since: lastInboundAt,
        }),
      },
      15000
    )

    if (!inboundResponse.ok) {
      const errBody = await inboundResponse.text()
      console.error('[relay-poll] Inbound poll failed:', inboundResponse.status, errBody)
    } else {
      const inboundMessages = await inboundResponse.json() as Array<{
        id: string
        from_phone: string
        body: string
        received_at: string
      }>

      console.log(`[relay-poll] Got ${inboundMessages.length} new inbound messages`)

      for (const msg of inboundMessages) {
        try {
          // Replay through the existing /api/sms/reply handler
          // This reuses all the existing routing logic (quote acceptance,
          // job matching, orphan handling, etc.)
          const replyResponse = await fetchWithTimeout(
            `${appUrl}/api/sms/reply`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                phone: msg.from_phone,
                message: msg.body,
                timestamp: msg.received_at,
                source: 'relay',
              }),
            },
            30000
          )

          if (replyResponse.ok) {
            results.inbound_processed++
            console.log(`[relay-poll] Replayed inbound ${msg.id} from ${msg.from_phone}`)
          } else {
            results.inbound_errors++
            console.error(`[relay-poll] Failed to replay inbound ${msg.id}: ${replyResponse.status}`)
          }
        } catch (err: any) {
          results.inbound_errors++
          console.error(`[relay-poll] Error replaying inbound ${msg.id}:`, err.message)
        }
      }

      // Update the last-processed timestamp to the newest message
      if (inboundMessages.length > 0) {
        const newestAt = inboundMessages
          .map(m => m.received_at)
          .sort()
          .pop()!
        await setSetting(supabase, 'relay_last_inbound_at', newestAt)
        console.log(`[relay-poll] Updated last_inbound_at to ${newestAt}`)
      }
    }
  } catch (err: any) {
    console.error('[relay-poll] Inbound poll error:', err.message)
  }

  // ------------------------------------------------------------------
  // 2. Poll for status updates and sync to sms_logs
  // ------------------------------------------------------------------
  try {
    const lastStatusAt = await getSetting(supabase, 'relay_last_status_at')
    console.log(`[relay-poll] Polling status since: ${lastStatusAt || 'beginning'}`)

    const statusResponse = await fetchWithTimeout(
      `${relayUrl}/rest/v1/rpc/get_status_updates`,
      {
        method: 'POST',
        headers: {
          'apikey': relayAnonKey,
          'Authorization': `Bearer ${relayAnonKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          api_key: relayApiKey,
          since: lastStatusAt,
        }),
      },
      15000
    )

    if (!statusResponse.ok) {
      const errBody = await statusResponse.text()
      console.error('[relay-poll] Status poll failed:', statusResponse.status, errBody)
    } else {
      const updates = await statusResponse.json() as Array<{
        message_id: string
        status: string
        sent_at: string | null
        delivered_at: string | null
        error: string | null
        retry_count: number
        updated_at: string
      }>

      console.log(`[relay-poll] Got ${updates.length} status updates`)

      for (const update of updates) {
        try {
          // The repair app stores the relay message_id in sms_logs.error_message
          // as "relay_message_id:<uuid>" when the message is queued.
          // Find the sms_log by that reference.
          const { data: smsLog } = await supabaseRetry(() =>
            supabase
              .from('sms_logs')
              .select('id, status')
              .like('error_message', `%relay_message_id:${update.message_id}%`)
              .limit(1)
              .single()
          ) as { data: { id: string; status: string } | null }

          if (!smsLog) {
            console.warn(`[relay-poll] No sms_log found for relay message ${update.message_id}`)
            continue
          }

          // Map relay status to sms_logs status
          // PENDING/CLAIMED → keep as PENDING (don't update)
          // SENT → SENT
          // DELIVERED → DELIVERED
          // FAILED → FAILED (will be retried by relay)
          // DEAD → FAILED permanently
          const statusMap: Record<string, string> = {
            'SENT': 'SENT',
            'DELIVERED': 'DELIVERED',
            'FAILED': 'FAILED',
            'DEAD': 'FAILED',
          }

          const newStatus = statusMap[update.status]
          if (!newStatus) continue

          // Only update if the status actually changed
          if (smsLog.status === newStatus) continue

          await supabaseRetry(() =>
            supabase
              .from('sms_logs')
              .update({
                status: newStatus,
                sent_at: update.sent_at,
                delivered_at: update.delivered_at,
                error_message: update.error
                  ? `relay_${update.status}:${update.error}`
                  : `relay_${update.status}`,
              })
              .eq('id', smsLog.id)
          )

          results.status_updated++
          console.log(`[relay-poll] Updated sms_log ${smsLog.id} → ${newStatus}`)
        } catch (err: any) {
          results.status_errors++
          console.error(`[relay-poll] Error updating status for ${update.message_id}:`, err.message)
        }
      }

      // Update the last-processed timestamp
      if (updates.length > 0) {
        const newestAt = updates
          .map(u => u.updated_at)
          .sort()
          .pop()!
        await setSetting(supabase, 'relay_last_status_at', newestAt)
        console.log(`[relay-poll] Updated last_status_at to ${newestAt}`)
      }
    }
  } catch (err: any) {
    console.error('[relay-poll] Status poll error:', err.message)
  }

  console.log('[relay-poll] Done:', results)

  return NextResponse.json({
    success: true,
    ...results,
  })
}

/**
 * Read a value from the admin_settings table.
 */
async function getSetting(supabase: any, key: string): Promise<string | null> {
  try {
    const result = await supabaseRetry(() =>
      supabase.from('admin_settings').select('value').eq('key', key).single()
    ) as { data: { value: string } | null }
    return result.data?.value || null
  } catch {
    return null
  }
}

/**
 * Write a value to the admin_settings table (upsert).
 */
async function setSetting(supabase: any, key: string, value: string): Promise<void> {
  try {
    await supabaseRetry(() =>
      supabase.from('admin_settings').upsert({
        key,
        value,
        description: `SMS relay polling state: ${key}`,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'key' })
    )
  } catch (err: any) {
    console.error(`[relay-poll] Failed to save setting ${key}:`, err.message)
  }
}
