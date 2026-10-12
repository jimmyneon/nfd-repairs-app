import { NextRequest, NextResponse } from 'next/server'
import { randomBytes } from 'crypto'
import { createServiceClient, sendSms, isSmsConfigured } from '@/lib/resilience'
import { corsHeaders } from '@/lib/api-auth'
import { checkRateLimit, getClientIP } from '@/lib/rate-limit'
import { isQuoteActionTokenValid } from '@/lib/job-utils'
import { getFirstName, renderSmsTemplate } from '@/lib/sms-template'

export const dynamic = 'force-dynamic'

const SITE_BASE = (
  process.env.NEXT_PUBLIC_SITE_URL || 'https://newforestdevicerepairs.co.uk'
).replace(/\/+$/, '')

const MIN_TARGET_POUNDS = 10
const MAX_TARGET_POUNDS = 2000

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, { status: 200, headers: corsHeaders(request) })
}

function isValidUkPhone(phone: string): boolean {
  const c = phone.replace(/[\s\-()]/g, '')
  return /^(07|\+447|447)\d{9}$/.test(c)
}

/** Text the customer their personal fund link — it IS their access token. */
async function sendFundLinkSms(
  supabase: ReturnType<typeof createServiceClient>,
  fund: { customer_name: string | null; customer_phone: string; device_summary: string | null },
  fundUrl: string
) {
  if (!isSmsConfigured()) return
  try {
    const { data: template } = await supabase
      .from('sms_templates')
      .select('body')
      .eq('key', 'FUND_LINK')
      .eq('is_active', true)
      .single()

    const vars = {
      first_name: getFirstName(fund.customer_name),
      device_summary: fund.device_summary || 'device',
      fund_link: fundUrl,
    }
    const message = template
      ? renderSmsTemplate(template.body, vars)
      : `Hi ${vars.first_name}! Your repair fund link: ${fundUrl}\n\nNFD Repairs`
    await sendSms(fund.customer_phone, message)
  } catch (err) {
    console.error('[RepairFund] Fund-link SMS failed:', err)
  }
}

/**
 * POST /api/repair-fund/create
 *
 * Two modes:
 *  - { enquiry_ref, t }               — create from a quote: customer/device/
 *    target are pulled from the enquiry (quote-token authorised, nothing is
 *    typed by the customer beyond what's already on file)
 *  - { customer_name, customer_phone, target_amount, ... } — manual fund
 *
 * Customers get a personal link they can top up whenever; the link is
 * texted to them because it IS the access credential.
 */
export async function POST(request: NextRequest) {
  const headers = corsHeaders(request)

  const ip = getClientIP(request)
  const rl = await checkRateLimit(ip, 'repair-fund-create', 5)
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429, headers })
  }

  const body = await request.json().catch(() => null)
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400, headers })
  }

  const supabase = createServiceClient()

  let name = String(body.customer_name || '').trim()
  let phone = String(body.customer_phone || '').trim()
  let email = String(body.customer_email || '').trim() || null
  let device = String(body.device_summary || '').trim() || null
  let repair = String(body.repair_summary || '').trim() || null
  let enquiryRef = String(body.enquiry_ref || '').trim().toUpperCase() || null
  let targetPounds = Number(body.target_amount)

  // ---- Create-from-quote mode --------------------------------------------
  if (enquiryRef || body.t) {
    if (!enquiryRef) {
      return NextResponse.json({ error: 'Missing enquiry_ref' }, { status: 400, headers })
    }
    const { data: enquiry } = await supabase
      .from('enquiries')
      .select(
        'enquiry_ref, customer_name, customer_phone, customer_email, device_make, device_model, repair_type, quoted_price, quote_action_token, quote_action_token_expires_at, quote_action_token_revoked_at'
      )
      .eq('enquiry_ref', enquiryRef)
      .maybeSingle()

    if (!enquiry) {
      return NextResponse.json({ error: 'Quote not found' }, { status: 404, headers })
    }
    const token = String(body.t || '')
    if (!enquiry.quote_action_token ||
        !isQuoteActionTokenValid(
          token,
          enquiry.quote_action_token_expires_at,
          enquiry.quote_action_token_revoked_at
        ) ||
        token !== enquiry.quote_action_token) {
      return NextResponse.json({ error: 'Invalid or expired quote link' }, { status: 403, headers })
    }

    name = enquiry.customer_name || name
    phone = enquiry.customer_phone || phone
    email = enquiry.customer_email || email
    device = device || [enquiry.device_make, enquiry.device_model].filter(Boolean).join(' ') || null
    repair = repair || enquiry.repair_type || null
    if (!Number.isFinite(targetPounds) || targetPounds <= 0) {
      targetPounds = Number(enquiry.quoted_price) || 0
    }
  }

  if (!name) {
    return NextResponse.json({ error: 'Name is required' }, { status: 400, headers })
  }
  if (!isValidUkPhone(phone)) {
    return NextResponse.json(
      { error: 'A valid UK mobile number is required' },
      { status: 400, headers }
    )
  }
  if (
    !Number.isFinite(targetPounds) ||
    targetPounds < MIN_TARGET_POUNDS ||
    targetPounds > MAX_TARGET_POUNDS
  ) {
    return NextResponse.json(
      { error: `Target must be between £${MIN_TARGET_POUNDS} and £${MAX_TARGET_POUNDS}` },
      { status: 400, headers }
    )
  }

  // Reuse an existing open fund for the same phone (or same quote) instead
  // of letting repeat taps create duplicate pots.
  let existingQuery = supabase
    .from('repair_funds')
    .select('fund_token')
    .eq('status', 'open')
    .order('created_at', { ascending: false })
    .limit(1)
  existingQuery = enquiryRef
    ? existingQuery.eq('enquiry_ref', enquiryRef)
    : existingQuery.eq('customer_phone', phone)
  const { data: existing } = await existingQuery

  if (existing && existing.length > 0) {
    const token = existing[0].fund_token
    return NextResponse.json(
      { fund_token: token, fund_url: `${SITE_BASE}/repair-fund/?f=${token}`, reused: true },
      { headers }
    )
  }

  const fundToken = randomBytes(18).toString('base64url')
  const { error } = await supabase.from('repair_funds').insert({
    fund_token: fundToken,
    customer_name: name,
    customer_phone: phone,
    customer_email: email,
    device_summary: device,
    repair_summary: repair,
    enquiry_ref: enquiryRef,
    target_amount_pence: Math.round(targetPounds * 100),
  })

  if (error) {
    console.error('[RepairFund] Create error:', error)
    return NextResponse.json({ error: 'Could not create fund' }, { status: 500, headers })
  }

  const fundUrl = `${SITE_BASE}/repair-fund/?f=${fundToken}`
  await sendFundLinkSms(supabase, { customer_name: name, customer_phone: phone, device_summary: device }, fundUrl)

  return NextResponse.json({ fund_token: fundToken, fund_url: fundUrl }, { headers })
}
