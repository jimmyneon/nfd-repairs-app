import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient, sendSms, isSmsConfigured } from '@/lib/resilience'
import { corsHeaders } from '@/lib/api-auth'
import { checkRateLimit, getClientIP } from '@/lib/rate-limit'
import { getFirstName } from '@/lib/sms-template'

export const dynamic = 'force-dynamic'

const SITE_BASE = (
  process.env.NEXT_PUBLIC_SITE_URL || 'https://newforestdevicerepairs.co.uk'
).replace(/\/+$/, '')

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, { status: 200, headers: corsHeaders(request) })
}

function isValidUkPhone(phone: string): boolean {
  const c = phone.replace(/[\s\-()]/g, '')
  return /^(07|\+447|447)\d{9}$/.test(c)
}

/**
 * POST /api/repair-fund/recover
 *
 * "Lost my link" flow: the fund URL carries the secret token, so recovery
 * means texting the link to the number on file. The response is identical
 * whether or not a fund exists — phone numbers can't be probed.
 */
export async function POST(request: NextRequest) {
  const headers = corsHeaders(request)

  const ip = getClientIP(request)
  const rl = await checkRateLimit(ip, 'repair-fund-recover', 3)
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429, headers })
  }

  const body = await request.json().catch(() => null)
  const phone = String(body?.customer_phone || '').trim()

  const generic = () =>
    NextResponse.json(
      { ok: true, message: "If we have a fund for that number, we've texted the link." },
      { headers }
    )

  if (!phone || !isValidUkPhone(phone)) return generic()

  try {
    const supabase = createServiceClient()
    const { data: funds } = await supabase
      .from('repair_funds')
      .select('fund_token, customer_name, device_summary')
      .eq('customer_phone', phone)
      .in('status', ['open', 'funded'])
      .order('created_at', { ascending: false })
      .limit(3)

    if (funds?.length && isSmsConfigured()) {
      const firstName = getFirstName(funds[0].customer_name)
      const lines = funds.map(
        (f, i) =>
          `${funds.length > 1 ? `Fund ${i + 1} (${f.device_summary || 'device'}): ` : ''}${SITE_BASE}/repair-fund/?f=${f.fund_token}`
      )
      await sendSms(
        phone,
        `Hi ${firstName}! Here${funds.length > 1 ? ' are your repair fund links' : "'s your repair fund link"}:\n\n${lines.join('\n\n')}\n\nNFD Repairs`
      )
    }
  } catch (err) {
    console.error('[RepairFund] Recover error:', err)
  }

  return generic()
}
