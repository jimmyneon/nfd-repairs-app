import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

/**
 * GET /api/conversations/search?q=...
 *
 * Full-text search across all conversation messages.
 * Returns matching messages grouped by phone number with customer context.
 */
export async function GET(request: NextRequest) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  const { searchParams } = new URL(request.url)
  const q = searchParams.get('q')?.trim()

  if (!q || q.length < 2) {
    return NextResponse.json({ success: true, results: [] })
  }

  // Search across all conversation messages
  const { data: messages, error } = await supabase
    .from('conversation_messages')
    .select('*')
    .ilike('message', `%${q}%`)
    .order('created_at', { ascending: false })
    .limit(200)

  if (error) {
    console.error('[conversations/search] Query error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Group by phone
  const byPhone: Record<string, any> = {}
  for (const msg of messages || []) {
    const phone = msg.phone || '(unknown)'
    if (!byPhone[phone]) {
      byPhone[phone] = {
        phone,
        match_count: 0,
        first_match: msg.created_at,
        last_match: msg.created_at,
        sample_messages: [] as string[],
        job_id: msg.job_id,
        enquiry_id: msg.enquiry_id,
      }
    }
    byPhone[phone].match_count++
    byPhone[phone].first_match = msg.created_at > byPhone[phone].first_match ? msg.created_at : byPhone[phone].first_match
    byPhone[phone].last_match = msg.created_at < byPhone[phone].last_match ? msg.created_at : byPhone[phone].last_match
    if (byPhone[phone].sample_messages.length < 3) {
      byPhone[phone].sample_messages.push(msg.message?.substring(0, 120) || '')
    }
  }

  // Enrich with customer names
  const phoneList = Object.keys(byPhone).filter((p) => p && p !== '(unknown)')
  // Build alternate format variants for each phone
  const allPhoneVariants = new Set<string>()
  for (const p of phoneList) {
    allPhoneVariants.add(p)
    if (p.startsWith('+44')) allPhoneVariants.add('0' + p.slice(3))
    if (p.startsWith('07') && p.length === 11) allPhoneVariants.add('+44' + p.slice(1))
  }
  const phoneQueryList = Array.from(allPhoneVariants)

  if (phoneQueryList.length > 0) {
    const { data: jobs } = await supabase
      .from('jobs')
      .select('id, customer_name, customer_phone, job_ref')
      .in('customer_phone', phoneQueryList)

    const { data: enquiries } = await supabase
      .from('enquiries')
      .select('id, enquiry_ref, customer_name, customer_phone')
      .in('customer_phone', phoneQueryList)

    const nameByPhone: Record<string, any> = {}
    for (const j of jobs || []) {
      const normalized = j.customer_phone?.startsWith('07') ? '+44' + j.customer_phone.slice(1) : j.customer_phone
      if (!nameByPhone[normalized || j.customer_phone]) {
        nameByPhone[normalized || j.customer_phone] = { name: j.customer_name, job_ref: j.job_ref, job_id: j.id }
      }
    }
    for (const e of enquiries || []) {
      const normalized = e.customer_phone?.startsWith('07') ? '+44' + e.customer_phone.slice(1) : e.customer_phone
      if (!nameByPhone[normalized || e.customer_phone]) {
        nameByPhone[normalized || e.customer_phone] = { name: e.customer_name, enquiry_ref: e.enquiry_ref }
      }
    }

    for (const phone of Object.keys(byPhone)) {
      const info = nameByPhone[phone]
      if (info) {
        byPhone[phone].customer_name = info.name
        byPhone[phone].job_ref = info.job_ref
        byPhone[phone].job_id = info.job_id || byPhone[phone].job_id
        byPhone[phone].enquiry_ref = info.enquiry_ref
      }
    }
  }

  const results = Object.values(byPhone).sort((a: any, b: any) => b.match_count - a.match_count)

  return NextResponse.json({
    success: true,
    query: q,
    results,
    total_matches: messages?.length || 0,
  })
}
