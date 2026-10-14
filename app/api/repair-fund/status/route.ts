import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/resilience'
import { corsHeaders } from '@/lib/api-auth'
import { checkRateLimit, getClientIP } from '@/lib/rate-limit'
import { getFirstName } from '@/lib/sms-template'

export const dynamic = 'force-dynamic'

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, { status: 200, headers: corsHeaders(request) })
}

/**
 * GET /api/repair-fund/status?token=<fund_token>
 *
 * Public progress check for the customer's fund page. Deliberately
 * returns only first name — no phone/email leak.
 */
export async function GET(request: NextRequest) {
  const headers = corsHeaders(request)

  const ip = getClientIP(request)
  const rl = await checkRateLimit(ip, 'repair-fund-status', 30)
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429, headers })
  }

  const token = request.nextUrl.searchParams.get('token')?.trim() || ''
  if (!/^[\w-]{4,80}$/.test(token)) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 400, headers })
  }

  const supabase = createServiceClient()
  const { data: fund } = await supabase
    .from('repair_funds')
    .select(
      'customer_name, device_summary, repair_summary, target_amount_pence, balance_pence, allocated_pence, status, enquiry_ref'
    )
    .eq('fund_token', token)
    .single()

  if (!fund) {
    return NextResponse.json({ error: 'Fund not found' }, { status: 404, headers })
  }

  const { data: enquiry } = await supabase.from('enquiries').select('quote_action_token,converted_job_id').eq('enquiry_ref', fund.enquiry_ref).maybeSingle()
  const { data: job } = enquiry?.converted_job_id ? await supabase.from('jobs').select('quote_confirmed_at,quote_version,quote_accepted_version,status').eq('id', enquiry.converted_job_id).maybeSingle() : { data: null }
  const remaining = Math.max(fund.target_amount_pence - fund.balance_pence, 0)
  return NextResponse.json(
    {
      first_name: getFirstName(fund.customer_name),
      device: fund.device_summary,
      repair: fund.repair_summary,
      target_pence: fund.target_amount_pence,
      balance_pence: fund.balance_pence,
      allocated_pence: fund.allocated_pence,
      remaining_pence: remaining,
      percent: Math.min(
        Math.round((fund.balance_pence / fund.target_amount_pence) * 100),
        100
      ),
      status: fund.status,
      has_quote: Boolean(fund.enquiry_ref),
      can_redeem: Boolean(job?.quote_confirmed_at && job.quote_version === job.quote_accepted_version && job.status !== 'CANCELLED' && fund.balance_pence > 0),
      quote_url: enquiry?.quote_action_token ? `https://newforestdevicerepairs.co.uk/repair-quote/?ref=${encodeURIComponent(fund.enquiry_ref)}&t=${encodeURIComponent(enquiry.quote_action_token)}` : null,
    },
    { headers }
  )
}

