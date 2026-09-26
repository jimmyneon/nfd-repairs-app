import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/resilience'
import { checkRateLimit, getClientIP } from '@/lib/rate-limit'
import { isQuoteActionTokenValid } from '@/lib/job-utils'

export const dynamic = 'force-dynamic'

/**
 * POST /api/public/quote/[ref]/reject?t=<quote_action_token>
 *
 * Public endpoint for customers to reject their quote without signing in.
 * Token-authorised and rate limited (see approve route for details). A
 * valid token is ALWAYS required — NULL-token rows are not publicly
 * accessible.
 */
export async function POST(request: NextRequest, { params }: { params: { ref: string } }) {
  // Rate limit: quote reject attempts.
  const ip = getClientIP(request)
  const rl = await checkRateLimit(ip, 'quote:reject', 10)
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
  }

  const supabase = createServiceClient()

  try {
    const { ref } = params
    const token = new URL(request.url).searchParams.get('t')

    // Try enquiries table first
    const { data: enquiry, error: enquiryError } = await supabase
      .from('enquiries')
      .select('enquiry_ref,device_make,device_model,quote_action_token,quote_action_token_expires_at,quote_action_token_revoked_at')
      .eq('enquiry_ref', ref)
      .maybeSingle()

    if (enquiry && !enquiryError) {
      // Authorise: a valid token is always required. NULL-token rows are
      // not publicly accessible — staff must send a new secure link.
      if (!enquiry.quote_action_token ||
          !isQuoteActionTokenValid(token, enquiry.quote_action_token_expires_at, enquiry.quote_action_token_revoked_at) ||
          token !== enquiry.quote_action_token) {
        return NextResponse.json({ error: 'Invalid or expired quote link' }, { status: 403 })
      }

      const { error: updateErr } = await supabase
        .from('enquiries')
        .update({
          status: 'rejected',
          updated_at: new Date().toISOString(),
        })
        .eq('enquiry_ref', ref)

      if (updateErr) {
        return NextResponse.json({ error: 'Failed to reject quote' }, { status: 500 })
      }

      // Notify staff
      await supabase.from('notifications').insert({
        type: 'QUOTE_REJECTED',
        title: 'Quote Rejected',
        body: `${enquiry.enquiry_ref}: ${enquiry.device_make} ${enquiry.device_model} - Customer declined the quote`,
        is_read: false,
      })

      return NextResponse.json({ success: true })
    }

    // Fallback: jobs table by UUID
    const { data: job, error: jobError } = await supabase
      .from('jobs')
      .select('id,job_ref,device_make,device_model,quoted_price,price_total,quote_action_token,quote_action_token_expires_at,quote_action_token_revoked_at')
      .eq('id', ref)
      .maybeSingle()

    if (jobError || !job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 })
    }

    // Authorise: a valid token is always required. NULL-token rows are
    // not publicly accessible — staff must send a new secure link.
    if (!job.quote_action_token ||
        !isQuoteActionTokenValid(token, job.quote_action_token_expires_at, job.quote_action_token_revoked_at) ||
        token !== job.quote_action_token) {
      return NextResponse.json({ error: 'Invalid or expired quote link' }, { status: 403 })
    }

    const { error: updateError } = await supabase
      .from('jobs')
      .update({
        status: 'QUOTE_REJECTED',
        status_changed_at: new Date().toISOString(),
        quote_rejected_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', ref)

    if (updateError) {
      return NextResponse.json({ error: 'Failed to reject quote' }, { status: 500 })
    }

    await supabase.from('job_events').insert({
      job_id: ref,
      event_type: 'QUOTE_REJECTED',
      event_data: {
        quoted_price: job.quoted_price || job.price_total,
        rejected_by: 'customer',
      },
      created_at: new Date().toISOString(),
    } as any)

    await supabase.from('notifications').insert({
      type: 'QUOTE_REJECTED',
      title: 'Quote Rejected',
      body: `${job.job_ref}: ${job.device_make} ${job.device_model} - Customer declined the quote`,
      job_id: ref,
      is_read: false,
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error rejecting quote:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
