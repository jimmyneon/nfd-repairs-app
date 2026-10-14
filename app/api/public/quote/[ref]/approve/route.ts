import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/resilience'
import { checkRateLimit, getClientIP } from '@/lib/rate-limit'
import { isQuoteActionTokenValid } from '@/lib/job-utils'
import { normalizePublicQuoteRef } from '@/lib/public-quote-options'

export const dynamic = 'force-dynamic'

/**
 * POST /api/public/quote/[ref]/approve?t=<quote_action_token>
 *
 * Public endpoint for customers to approve their quote without signing in.
 *
 * SECURITY: the `ref` identifies the quote; the `t` (quote_action_token)
 * authorises the action. A valid token is ALWAYS required — rows with a
 * NULL token are not publicly accessible (staff must send a new secure
 * link to generate one). Rate limited.
 */
export async function POST(request: NextRequest, { params }: { params: { ref: string } }) {
  // Rate limit: quote approve attempts.
  const ip = getClientIP(request)
  const rl = await checkRateLimit(ip, 'quote:approve', 10)
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
  }

  const supabase = createServiceClient()

  try {
    const ref = normalizePublicQuoteRef(params.ref)
    const token = new URL(request.url).searchParams.get('t')
    const body = await request.json().catch(() => ({}))
    if (body.additional_repairs?.length) return NextResponse.json({ error: 'Save options using the verified options endpoint first' }, { status: 400 })
    const newAddOns: Array<{ repair: string; displayName: string; price: number }> = []

    // Try enquiries table first
    const { data: enquiry, error: enquiryError } = await supabase
      .from('enquiries')
      .select('enquiry_ref,status,converted_job_id,quote_confirmed_at,device_make,device_model,quoted_price,additional_repairs,quote_action_token,quote_action_token_expires_at,quote_action_token_revoked_at')
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

      // Cached approval pages cannot accept or downgrade a current confirmed job.
      if (enquiry.converted_job_id || enquiry.quote_confirmed_at || ['cancelled', 'rejected'].includes(enquiry.status)) {
        return NextResponse.json({ error: 'Open your current repair link to review the latest details.' }, { status: 409 })
      }
      if (enquiry.status === 'approved') return NextResponse.json({ success: true })
      const existingAddOns = enquiry.additional_repairs || []
      const allAddOns = [...existingAddOns, ...newAddOns]

      const { error: updateErr } = await supabase
        .from('enquiries')
        .update({
          status: 'approved',
          additional_repairs: allAddOns,
          updated_at: new Date().toISOString(),
        })
        .eq('enquiry_ref', ref)

      if (updateErr) {
        return NextResponse.json({ error: 'Failed to approve quote' }, { status: 500 })
      }

      // Notify staff
      const totalPrice = (enquiry.quoted_price || 0) + allAddOns.reduce((s: number, r: any) => s + r.price, 0)
      const notifBody = `${enquiry.enquiry_ref}: ${enquiry.device_make} ${enquiry.device_model} - Customer approved the quote (£${totalPrice})${newAddOns.length > 0 ? ` (+${newAddOns.length} add-on${newAddOns.length > 1 ? 's' : ''})` : ''}`
      await supabase.from('notifications').insert({
        type: 'QUOTE_APPROVED',
        title: 'Quote Approved',
        body: notifBody,
        is_read: false,
      })

      // MacroDroid webhook
      try {
        await fetch('https://trigger.macrodroid.com/4e59ada0-b4c6-443d-b189-3c7aa21a8454/repair-request', {
          method: 'POST',
          body: `https://nfd-repairs-app.vercel.app/app/enquiries?ref=${enquiry.enquiry_ref}`,
        })
      } catch (e) {
        console.error('[MacroDroid] Failed to send webhook:', e)
      }

      // Push notification
      try {
        await fetch('https://notify-50nol3u3c-jimmys-projects-9bf84ee4.vercel.app/api/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            app_id: 'nfd-repairs',
            title: 'Quote Approved',
            body: notifBody,
            category: 'status_update',
            priority: 'high',
            deep_link: 'https://nfd-repairs-app.vercel.app/admin',
          }),
        })
      } catch (e) {
        console.error('[Notify] Failed to send push:', e)
      }

      return NextResponse.json({ success: true })
    }

    // Fallback: jobs table by UUID
    const { data: job, error: jobError } = await supabase
      .from('jobs')
      .select('id,job_ref,device_make,device_model,quoted_price,price_total,additional_issues,quote_action_token,quote_action_token_expires_at,quote_action_token_revoked_at')
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

    return NextResponse.json({ error: 'Open your current repair link to review and accept the latest details.' }, { status: 409 })
  } catch (error) {
    console.error('Error approving quote:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

