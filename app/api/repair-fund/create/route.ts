import { NextRequest, NextResponse } from 'next/server'
import { randomBytes } from 'crypto'
import { createServiceClient } from '@/lib/resilience'
import { corsHeaders } from '@/lib/api-auth'
import { checkRateLimit, getClientIP } from '@/lib/rate-limit'

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

/**
 * POST /api/repair-fund/create
 *
 * Customer-facing: set up a "save up for your repair" fund. They get a
 * personal link they can top up whenever they like; once the balance
 * covers the repair, they book in. Money is only ever moved by Stripe
 * Checkout + the webhook — this route just creates the pot.
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

  const name = String(body.customer_name || '').trim()
  const phone = String(body.customer_phone || '').trim()
  const email = String(body.customer_email || '').trim() || null
  const device = String(body.device_summary || '').trim() || null
  const repair = String(body.repair_summary || '').trim() || null
  const enquiryRef = String(body.enquiry_ref || '').trim().toUpperCase() || null
  const targetPounds = Number(body.target_amount)

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

  const supabase = createServiceClient()

  // Reuse an existing open fund for the same phone + target instead of
  // letting repeat taps create duplicate pots.
  const { data: existing } = await supabase
    .from('repair_funds')
    .select('fund_token')
    .eq('customer_phone', phone)
    .eq('status', 'open')
    .order('created_at', { ascending: false })
    .limit(1)

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

  return NextResponse.json(
    { fund_token: fundToken, fund_url: `${SITE_BASE}/repair-fund/?f=${fundToken}` },
    { headers }
  )
}
