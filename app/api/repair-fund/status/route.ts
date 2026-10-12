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
      'customer_name, device_summary, repair_summary, target_amount_pence, balance_pence, status'
    )
    .eq('fund_token', token)
    .single()

  if (!fund) {
    return NextResponse.json({ error: 'Fund not found' }, { status: 404, headers })
  }

  const remaining = Math.max(fund.target_amount_pence - fund.balance_pence, 0)
  return NextResponse.json(
    {
      first_name: getFirstName(fund.customer_name),
      device: fund.device_summary,
      repair: fund.repair_summary,
      target_pence: fund.target_amount_pence,
      balance_pence: fund.balance_pence,
      remaining_pence: remaining,
      percent: Math.min(
        Math.round((fund.balance_pence / fund.target_amount_pence) * 100),
        100
      ),
      status: fund.status,
    },
    { headers }
  )
}
