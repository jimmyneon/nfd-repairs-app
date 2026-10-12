import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/resilience'
import { corsHeaders } from '@/lib/api-auth'
import { checkRateLimit, getClientIP } from '@/lib/rate-limit'
import { getStripe } from '@/lib/stripe'

export const dynamic = 'force-dynamic'

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, { status: 200, headers: corsHeaders(request) })
}

/**
 * GET /api/payments/session-status?session_id=cs_...
 *
 * Lets success pages verify a payment genuinely completed instead of
 * trusting a URL parameter. Stripe is the source of truth; the payments
 * row adds local context (kind, what it was for).
 */
export async function GET(request: NextRequest) {
  const headers = corsHeaders(request)

  const ip = getClientIP(request)
  const rl = await checkRateLimit(ip, 'payments-session-status', 30)
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429, headers })
  }

  const sessionId = request.nextUrl.searchParams.get('session_id')
  if (!sessionId || !/^cs_[\w-]+$/.test(sessionId)) {
    return NextResponse.json({ error: 'Missing session_id' }, { status: 400, headers })
  }

  const stripe = getStripe()
  if (!stripe) {
    return NextResponse.json({ error: 'Payments not configured' }, { status: 503, headers })
  }

  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId)
    const supabase = createServiceClient()
    const { data: payment } = await supabase
      .from('payments')
      .select('kind, status, amount_pence, description')
      .eq('stripe_session_id', sessionId)
      .single()

    return NextResponse.json(
      {
        paid: session.payment_status === 'paid',
        payment_status: session.payment_status,
        session_status: session.status,
        kind: payment?.kind ?? session.metadata?.kind ?? null,
        amount_pence: payment?.amount_pence ?? session.amount_total,
        description: payment?.description ?? null,
      },
      { headers }
    )
  } catch (error: any) {
    console.error('[Payments] Session status error:', error.message)
    return NextResponse.json(
      { error: 'Could not verify payment' },
      { status: 404, headers }
    )
  }
}
