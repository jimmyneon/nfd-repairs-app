import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

/**
 * GET /api/conversations
 *
 * Query params:
 *   ?phone=...      — filter by customer phone number
 *   ?job_id=...     — filter by job ID
 *   ?enquiry_id=... — filter by enquiry ID
 *   ?limit=...      — max results (default 100)
 *   ?unread_only=1  — only inbound messages after the last outbound
 *   ?search=...     — full-text search across message bodies
 *
 * Returns unified conversation messages from the conversation_messages view.
 */
export async function GET(request: NextRequest) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  const { searchParams } = new URL(request.url)
  const phone = searchParams.get('phone')
  const jobId = searchParams.get('job_id')
  const enquiryId = searchParams.get('enquiry_id')
  const limit = parseInt(searchParams.get('limit') || '100', 10)
  const unreadOnly = searchParams.get('unread_only') === '1'
  const search = searchParams.get('search')

  let query = supabase
    .from('conversation_messages')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (phone) {
    // Normalise phone for lookup
    const normalised = normaliseUkPhone(phone) || phone
    query = query.or(`phone.eq.${normalised},phone.eq.${phone}`)
  }
  if (jobId) query = query.eq('job_id', jobId)
  if (enquiryId) query = query.eq('enquiry_id', enquiryId)
  if (search) {
    query = query.ilike('message', `%${search}%`)
  }

  const { data, error } = await query

  if (error) {
    console.error('[conversations] Query error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  let messages = data || []

  // If unread_only, filter to inbound messages that have no subsequent outbound
  if (unreadOnly && messages.length > 0) {
    messages = filterUnreadConversations(messages)
  }

  return NextResponse.json({ success: true, messages })
}

/**
 * Given a list of messages (newest first), return only the inbound messages
 * that don't have a later outbound message from staff/system.
 * This identifies conversations where the customer is waiting for a reply.
 */
function filterUnreadConversations(messages: any[]): any[] {
  // Group by phone, then for each phone check if the most recent message is inbound
  const byPhone: Record<string, any[]> = {}
  for (const msg of messages) {
    const key = msg.phone || ''
    if (!byPhone[key]) byPhone[key] = []
    byPhone[key].push(msg)
  }

  const unread: any[] = []
  for (const [phone, msgs] of Object.entries(byPhone)) {
    // msgs are newest-first; if the newest is inbound, include all inbound
    // messages until the last outbound
    if (msgs[0]?.direction === 'inbound') {
      for (const m of msgs) {
        if (m.direction === 'inbound') {
          unread.push(m)
        } else {
          break // stop at first outbound
        }
      }
    }
  }

  return unread
}

function normaliseUkPhone(raw: string): string | null {
  const digits = raw.replace(/[^\d+]/g, '')
  if (/^\+447\d{9}$/.test(digits)) return digits
  if (/^00447\d{9}$/.test(digits)) return `+447${digits.slice(5)}`
  if (/^447\d{9}$/.test(digits)) return `+${digits}`
  if (/^07\d{9}$/.test(digits)) return `+44${digits.slice(1)}`
  return null
}
