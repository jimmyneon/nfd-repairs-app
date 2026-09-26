import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { checkRateLimit, getClientIP } from '@/lib/rate-limit'
import { isQuoteActionTokenValid } from '@/lib/job-utils'

export const dynamic = 'force-dynamic'

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

/**
 * GET /api/public/quote/[ref]?t=<quote_action_token>
 *
 * Public endpoint for customers to view their quote without signing in.
 *
 * SECURITY:
 *  - The `ref` (enquiry_ref or job id) is only an identifier, NOT the
 *    authorisation key. Authorisation requires the matching `t`
 *    (quote_action_token) for that exact enquiry/job, which is a long
 *    cryptographically-random value tied to the record with expiry/revocation.
 *  - Rows with a NULL quote_action_token are NOT publicly accessible. If a
 *    legacy link predates token issuance, staff must send a new secure link
 *    (which generates the token). There is no insecure fallback.
 *  - Returns ONLY customer-facing quote fields (no PII, no staff notes,
 *    no internal fields).
 */
export async function GET(request: NextRequest, { params }: { params: { ref: string } }) {
  // Rate limit: quote view loads.
  const ip = getClientIP(request)
  const rl = await checkRateLimit(ip, 'quote:view', 20)
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
  }

  try {
    const supabase = getAdminClient()
    const { ref } = params
    const token = new URL(request.url).searchParams.get('t')

    // Try enquiries table first (ref is enquiry_ref for quote approvals)
    const { data: enquiry, error: enquiryError } = await supabase
      .from('enquiries')
      .select('enquiry_ref,device_make,device_model,repair_type,device_category,quoted_price,quoted_price_high,quote_type,part_option,screen_option,display_price,warranty,estimated_time,additional_repairs,status,quote_action_token,quote_action_token_expires_at,quote_action_token_revoked_at')
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

      return NextResponse.json({
        job_ref: enquiry.enquiry_ref,
        device_make: enquiry.device_make,
        device_model: enquiry.device_model,
        issue: enquiry.repair_type,
        device_category: enquiry.device_category,
        quoted_price: enquiry.quoted_price,
        quoted_price_high: enquiry.quoted_price_high,
        price_total: enquiry.quoted_price,
        quote_type: enquiry.quote_type,
        part_option: enquiry.part_option || enquiry.screen_option,
        display_price: enquiry.display_price,
        warranty: enquiry.warranty,
        estimated_time: enquiry.estimated_time,
        additional_repairs: enquiry.additional_repairs || [],
        requires_parts_order: false,
        status: enquiry.status,
      })
    }

    // Fallback: try jobs table by UUID
    const { data: job, error: jobError } = await supabase
      .from('jobs')
      .select('id,job_ref,device_make,device_model,issue,device_type,quoted_price,price_total,requires_parts_order,additional_issues,status,quote_action_token,quote_action_token_expires_at,quote_action_token_revoked_at')
      .eq('id', ref)
      .maybeSingle()

    if (jobError || !job) {
      return NextResponse.json({ error: 'Quote not found' }, { status: 404 })
    }

    // Authorise: a valid token is always required. NULL-token rows are
    // not publicly accessible — staff must send a new secure link.
    if (!job.quote_action_token ||
        !isQuoteActionTokenValid(token, job.quote_action_token_expires_at, job.quote_action_token_revoked_at) ||
        token !== job.quote_action_token) {
      return NextResponse.json({ error: 'Invalid or expired quote link' }, { status: 403 })
    }

    // Return only customer-facing fields from the job
    return NextResponse.json({
      job_ref: job.job_ref,
      device_make: job.device_make,
      device_model: job.device_model,
      issue: job.issue,
      device_category: job.device_type,
      quoted_price: job.quoted_price,
      price_total: job.price_total,
      quote_type: null,
      part_option: null,
      display_price: null,
      warranty: null,
      estimated_time: null,
      additional_repairs: job.additional_issues || [],
      requires_parts_order: job.requires_parts_order,
      status: job.status,
    })
  } catch (err: any) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
