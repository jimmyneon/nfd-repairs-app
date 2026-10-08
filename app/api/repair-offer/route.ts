import { NextRequest, NextResponse } from 'next/server'
import { corsHeaders } from '@/lib/api-auth'
import { checkRateLimit, getClientIP } from '@/lib/rate-limit'
import { issueOffer, offerEligible, offerVariant, REPAIR_OFFER } from '@/lib/repair-offer'

export const dynamic = 'force-dynamic'
export async function OPTIONS(request: NextRequest) { return new NextResponse(null, { headers: corsHeaders(request) }) }
export async function POST(request: NextRequest) {
  const headers = { ...corsHeaders(request), 'Cache-Control': 'no-store' }
  try {
    const limit = await checkRateLimit(getClientIP(request), 'repair_offer', 30)
    if (!limit.allowed) return NextResponse.json({ error: 'Please try again shortly' }, { status: 429, headers })
    const { session_id, quote_key } = await request.json()
    if (typeof session_id !== 'string' || !/^[a-zA-Z0-9_-]{8,100}$/.test(session_id) || typeof quote_key !== 'string' || quote_key.length > 250) {
      return NextResponse.json({ error: 'Invalid selection' }, { status: 400, headers })
    }
    const secret = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!secret) throw new Error('Offer configuration unavailable')
    const res = await fetch('https://newforestdevicerepairs.co.uk/data/quote-catalogue.json', { cache: 'no-store' })
    if (!res.ok) throw new Error('Catalogue unavailable')
    const catalogue = await res.json()
    const quote = (catalogue.quotes || []).find((q: any) => q.quoteKey === quote_key)
    if (!offerEligible(quote)) return NextResponse.json({ eligible: false, campaign: REPAIR_OFFER.id }, { headers })
    return NextResponse.json({ eligible: true, variant: offerVariant(session_id, secret), campaign: REPAIR_OFFER.id,
      code: REPAIR_OFFER.code, amount: REPAIR_OFFER.amount, minimum: REPAIR_OFFER.minimum, price: quote.customerPriceGbp,
      expires: REPAIR_OFFER.expires, token: issueOffer(session_id, quote, secret) }, { headers })
  } catch {
    return NextResponse.json({ error: 'Offer unavailable; you can continue with your normal quote' }, { status: 503, headers })
  }
}
