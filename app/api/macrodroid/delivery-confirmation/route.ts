import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'

/**
 * POST /api/macrodroid/delivery-confirmation
 *
 * Receives a delivery confirmation from MacroDroid after an SMS has been
 * successfully delivered (or failed). This updates the matching sms_logs
 * entry so we have a full audit trail.
 *
 * Accepts both JSON and form-encoded payloads.
 *
 * Expected payload:
 *   {
 *     phone: string,         // recipient phone
 *     message: string,       // the message text that was sent
 *     status: string,        // "delivered" | "failed" | "sent"
 *     timestamp?: string,    // Unix timestamp or ISO date
 *   }
 */
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  })
}

export async function POST(request: NextRequest) {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    // Parse body
    const rawBody = await request.text()
    let phone: string | undefined
    let message: string | undefined
    let status: string | undefined
    let timestamp: string | undefined

    if (rawBody.includes('=') && (rawBody.includes('&') || !rawBody.includes('{'))) {
      const params = new URLSearchParams(rawBody)
      phone = params.get('phone') || undefined
      message = params.get('message') || undefined
      status = params.get('status') || undefined
      timestamp = params.get('timestamp') || undefined
    } else {
      try {
        const body = JSON.parse(rawBody)
        phone = body.phone
        message = body.message
        status = body.status
        timestamp = body.timestamp
      } catch {
        return NextResponse.json(
          { error: 'Invalid request format — send JSON or form-encoded' },
          { status: 400 }
        )
      }
    }

    if (!phone || !message) {
      return NextResponse.json(
        { error: 'Missing required fields: phone, message' },
        { status: 400 }
      )
    }

    const messageHash = crypto.createHash('sha256').update(message).digest('hex').substring(0, 16)
    const deliveredAt = parseTimestamp(timestamp) || new Date().toISOString()
    const deliveryStatus = (status || 'delivered').toLowerCase()

    // Find the matching sms_log entry by message_hash (preferred) or by
    // matching the body text + phone within the last 10 minutes
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString()

    // Try hash match first
    let logEntry: any = null
    const { data: byHash } = await supabase
      .from('sms_logs')
      .select('id, status, delivered_at')
      .eq('message_hash', messageHash)
      .gte('created_at', tenMinutesAgo)
      .order('created_at', { ascending: false })
      .limit(1)

    if (byHash && byHash.length > 0) {
      logEntry = byHash[0]
    } else {
      // Fallback: match by body text
      const { data: byBody } = await supabase
        .from('sms_logs')
        .select('id, status, delivered_at')
        .eq('body_rendered', message)
        .gte('created_at', tenMinutesAgo)
        .order('created_at', { ascending: false })
        .limit(1)

      if (byBody && byBody.length > 0) {
        logEntry = byBody[0]
      }
    }

    if (!logEntry) {
      console.log('[delivery-confirmation] No matching sms_log found for', phone, `(${message.length} chars)`)
      return NextResponse.json({
        success: false,
        message: 'No matching SMS log found (may be older than 10 minutes or text mismatch)',
      }, { status: 404 })
    }

    // Update the log with delivery confirmation
    const { error: updateError } = await supabase
      .from('sms_logs')
      .update({
        delivery_status: deliveryStatus,
        delivered_at: deliveryStatus === 'delivered' ? deliveredAt : null,
      })
      .eq('id', logEntry.id)

    if (updateError) {
      console.error('[delivery-confirmation] Update failed:', updateError)
      return NextResponse.json(
        { error: 'Failed to update delivery status' },
        { status: 500 }
      )
    }

    console.log(`[delivery-confirmation] Updated log ${logEntry.id} → ${deliveryStatus}`)

    return NextResponse.json({
      success: true,
      log_id: logEntry.id,
      delivery_status: deliveryStatus,
      delivered_at: deliveryStatus === 'delivered' ? deliveredAt : null,
    })
  } catch (error) {
    console.error('[delivery-confirmation] Error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

function parseTimestamp(ts?: string): string | null {
  if (!ts) return null
  if (/^\d+$/.test(ts)) {
    return new Date(parseInt(ts) * 1000).toISOString()
  }
  try {
    return new Date(ts).toISOString()
  } catch {
    return null
  }
}
