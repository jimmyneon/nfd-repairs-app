import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

/**
 * GET /api/conversations/inbox
 *
 * Returns a grouped inbox view — one row per customer phone number with:
 *   phone, customer_name (from jobs/enquiries), last_message, last_direction,
 *   last_at, unread_count, job_id, job_ref, enquiry_id, enquiry_ref
 *
 * Query params:
 *   ?unread_only=1 — only show conversations with unread inbound messages
 *   ?limit=...     — max results (default 50)
 */
export async function GET(request: NextRequest) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  const { searchParams } = new URL(request.url)
  const unreadOnly = searchParams.get('unread_only') === '1'
  const limit = parseInt(searchParams.get('limit') || '50', 10)

  // Fetch recent conversation messages
  let query = supabase
    .from('conversation_messages')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(500)

  const { data: messages, error } = await query

  if (error) {
    console.error('[conversations/inbox] Query error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Group by phone
  const byPhone: Record<string, any[]> = {}
  for (const msg of messages || []) {
    const phone = msg.phone || '(unknown)'
    if (!byPhone[phone]) byPhone[phone] = []
    byPhone[phone].push(msg)
  }

  // Build inbox rows
  const rows: any[] = []
  for (const [phone, msgs] of Object.entries(byPhone)) {
    // msgs are newest-first
    const lastMsg = msgs[0]
    const lastInbound = msgs.find((m: any) => m.direction === 'inbound')
    const lastOutbound = msgs.find((m: any) => m.direction === 'outbound')

    // Count unread: inbound messages after the last outbound
    let unreadCount = 0
    for (const m of msgs) {
      if (m.direction === 'inbound') {
        unreadCount++
      } else if (m.direction === 'outbound') {
        break
      }
    }

    if (unreadOnly && unreadCount === 0) continue

    // Try to find a job or enquiry for this phone
    const jobId = msgs.find((m: any) => m.job_id)?.job_id
    const enquiryId = msgs.find((m: any) => m.enquiry_id)?.enquiry_id

    rows.push({
      phone,
      last_message: lastMsg.message?.substring(0, 120) || '',
      last_direction: lastMsg.direction,
      last_channel: lastMsg.channel,
      last_at: lastMsg.created_at,
      last_template_key: lastMsg.template_key,
      unread_count: unreadCount,
      job_id: jobId,
      enquiry_id: enquiryId,
      message_count: msgs.length,
    })
  }

  // Sort: unread first, then by most recent
  rows.sort((a, b) => {
    if (a.unread_count > 0 && b.unread_count === 0) return -1
    if (a.unread_count === 0 && b.unread_count > 0) return 1
    return new Date(b.last_at).getTime() - new Date(a.last_at).getTime()
  })

  // Enrich with customer names from jobs/enquiries
  const phoneList = rows.map((r) => r.phone).filter((p) => p && p !== '(unknown)')
  if (phoneList.length > 0) {
    const { data: jobs } = await supabase
      .from('jobs')
      .select('id, customer_name, customer_phone, job_ref')
      .in('customer_phone', phoneList)
      .order('created_at', { ascending: false })

    const { data: enquiries } = await supabase
      .from('enquiries')
      .select('id, enquiry_ref, customer_name, customer_phone')
      .in('customer_phone', phoneList)
      .order('created_at', { ascending: false })

    const nameByPhone: Record<string, { name: string; job_ref?: string; enquiry_ref?: string }> = {}
    for (const j of jobs || []) {
      if (!nameByPhone[j.customer_phone]) {
        nameByPhone[j.customer_phone] = { name: j.customer_name, job_ref: j.job_ref }
      }
    }
    for (const e of enquiries || []) {
      if (!nameByPhone[e.customer_phone]) {
        nameByPhone[e.customer_phone] = { name: e.customer_name, enquiry_ref: e.enquiry_ref }
      }
    }

    for (const row of rows) {
      const info = nameByPhone[row.phone]
      if (info) {
        row.customer_name = info.name
        row.job_ref = info.job_ref
        row.enquiry_ref = info.enquiry_ref
      }
    }
  }

  return NextResponse.json({
    success: true,
    conversations: rows.slice(0, limit),
    total_unread: rows.reduce((sum, r) => sum + r.unread_count, 0),
  })
}
