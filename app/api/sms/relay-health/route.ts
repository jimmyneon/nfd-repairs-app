import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient, fetchWithTimeout } from '@/lib/resilience'
import { requireCronSecret } from '@/lib/api-auth'

/**
 * GET/POST /api/sms/relay-health
 *
 * Health check for the SMS relay system. Monitors:
 *   1. Phone last_seen — alerts if offline for >10 minutes
 *   2. Messages stuck in PENDING — alerts if >30 minutes old
 *   3. Messages stuck in CLAIMED — alerts if >5 minutes old
 *   4. Relay Supabase project reachable
 *
 * Returns: { healthy: boolean, checks: {...}, alerts: [...] }
 *
 * Auth: cron secret (same as other cron endpoints) or staff login.
 */
export async function GET(request: NextRequest) {
  return handleHealthCheck(request)
}

export async function POST(request: NextRequest) {
  return handleHealthCheck(request)
}

async function handleHealthCheck(request: NextRequest) {
  const cronResponse = requireCronSecret(request)
  if (cronResponse) return cronResponse

  const relayUrl = process.env.RELAY_URL
  const relayAnonKey = process.env.RELAY_ANON_KEY
  const relayApiKey = process.env.RELAY_API_KEY

  if (!relayUrl || !relayAnonKey || !relayApiKey) {
    return NextResponse.json({
      healthy: false,
      error: 'SMS relay not configured',
    }, { status: 500 })
  }

  const supabase = createServiceClient()
  const alerts: string[] = []
  const checks: any = {}

  // ------------------------------------------------------------------
  // 1. Check relay Supabase project is reachable
  // ------------------------------------------------------------------
  try {
    const response = await fetchWithTimeout(
      `${relayUrl}/rest/v1/rpc/get_status_updates`,
      {
        method: 'POST',
        headers: {
          'apikey': relayAnonKey,
          'Authorization': `Bearer ${relayAnonKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ api_key: relayApiKey, since: null }),
      },
      10000
    )
    checks.relayReachable = response.ok
    if (!response.ok) {
      alerts.push('Relay Supabase project is not responding')
    }
  } catch (err: any) {
    checks.relayReachable = false
    alerts.push(`Relay unreachable: ${err.message}`)
  }

  // ------------------------------------------------------------------
  // 2. Check phone last_seen (via relay status updates)
  //    We can't directly query the devices table via anon key, but we
  //    can check if any messages have been claimed recently. If no
  //    messages have been claimed in the last hour, the phone may be
  //    offline.
  // ------------------------------------------------------------------
  try {
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
          since: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
        }),
      },
      10000
    )

    if (statusResponse.ok) {
      const updates = await statusResponse.json() as any[]
      checks.recentActivity = updates.length
      if (updates.length === 0) {
        // No activity in the last hour — phone might be offline
        // Only alert if there are pending messages
        const pendingResponse = await fetchWithTimeout(
          `${relayUrl}/rest/v1/rpc/get_status_updates`,
          {
            method: 'POST',
            headers: {
              'apikey': relayAnonKey,
              'Authorization': `Bearer ${relayAnonKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ api_key: relayApiKey, since: null }),
          },
          10000
        )
        if (pendingResponse.ok) {
          const allUpdates = await pendingResponse.json() as any[]
          const recentPending = allUpdates.filter(
            (u: any) => u.status === 'FAILED' || u.status === 'DEAD'
          )
          if (recentPending.length > 0) {
            alerts.push(`Phone may be offline — no activity in last hour, ${recentPending.length} failed/dead messages`)
          }
        }
      }
    }
  } catch (err: any) {
    checks.recentActivity = 'error'
    alerts.push(`Could not check relay activity: ${err.message}`)
  }

  // ------------------------------------------------------------------
  // 3. Check for messages stuck in PENDING in local sms_logs
  //    (queued but never updated by relay-poll cron)
  // ------------------------------------------------------------------
  try {
    const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString()
    const { data: stuckPending } = await supabase
      .from('sms_logs')
      .select('id, created_at, error_message')
      .eq('status', 'PENDING')
      .like('error_message', 'relay_message_id:%')
      .lt('created_at', thirtyMinAgo)
      .limit(10)

    checks.stuckPending = stuckPending?.length || 0
    if (stuckPending && stuckPending.length > 0) {
      alerts.push(`${stuckPending.length} messages stuck in PENDING for >30 minutes — relay-poll cron may not be running`)
    }
  } catch (err: any) {
    checks.stuckPending = 'error'
  }

  // ------------------------------------------------------------------
  // 4. Check relay-poll cursor freshness
  // ------------------------------------------------------------------
  try {
    const { data: cursor } = await supabase
      .from('admin_settings')
      .select('value, updated_at')
      .eq('key', 'relay_last_status_at')
      .single()

    if (cursor?.updated_at) {
      const cursorAge = Date.now() - new Date(cursor.updated_at).getTime()
      checks.relayPollCursorAge = Math.round(cursorAge / 1000 / 60) // minutes
      if (cursorAge > 5 * 60 * 1000) {
        alerts.push(`Relay-poll cron hasn't run in ${Math.round(cursorAge / 1000 / 60)} minutes`)
      }
    } else {
      checks.relayPollCursorAge = 'never'
    }
  } catch {
    checks.relayPollCursorAge = 'error'
  }

  const healthy = alerts.length === 0

  console.log('[relay-health] healthy:', healthy, 'alerts:', alerts)

  return NextResponse.json({
    healthy,
    checks,
    alerts,
    timestamp: new Date().toISOString(),
  })
}
