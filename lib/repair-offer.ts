import { createHmac, timingSafeEqual } from 'node:crypto'

export const REPAIR_OFFER = { id: 'october-2026-price-help-v1', code: 'OCT5', amount: 5, minimum: 75, expires: '2026-11-01T00:00:00.000Z' } as const
type Claims = { campaign: string; session: string; quote: string; price: number; expires: string }
function signature(value: string, secret: string) { return createHmac('sha256', secret).update(value).digest('base64url') }
export function offerVariant(session: string, secret: string): 'offer' | 'control' {
  return createHmac('sha256', secret).update(REPAIR_OFFER.id + ':' + session).digest()[0] % 2 ? 'offer' : 'control'
}
export function offerEligible(quote: any, now = Date.now()) {
  return now < Date.parse(REPAIR_OFFER.expires) && quote?.enabled !== false && quote?.priceType === 'fixed'
    && Number.isFinite(quote.customerPriceGbp) && quote.customerPriceGbp >= REPAIR_OFFER.minimum
    && !/diagnostic|assessment/i.test([quote.displayPrice, quote.repair, quote.partGrade].join(' '))
}
export function issueOffer(session: string, quote: any, secret: string, now = Date.now()) {
  if (!secret || !offerEligible(quote, now) || offerVariant(session, secret) !== 'offer') return null
  const claims: Claims = { campaign: REPAIR_OFFER.id, session, quote: quote.quoteKey, price: quote.customerPriceGbp, expires: REPAIR_OFFER.expires }
  const encoded = Buffer.from(JSON.stringify(claims)).toString('base64url')
  return encoded + '.' + signature(encoded, secret)
}
export function verifyOffer(token: unknown, quoteKey: unknown, verifiedPrice: unknown, secret: string, now = Date.now()): Claims | null {
  if (typeof token !== 'string' || token.length > 2000 || !secret) return null
  try {
    const [encoded, supplied, extra] = token.split('.')
    if (!encoded || !supplied || extra) return null
    const expected = Buffer.from(signature(encoded, secret))
    const received = Buffer.from(supplied)
    if (expected.length !== received.length || !timingSafeEqual(expected, received)) return null
    const claims: Claims = JSON.parse(Buffer.from(encoded, 'base64url').toString())
    if (claims.campaign !== REPAIR_OFFER.id || claims.expires !== REPAIR_OFFER.expires || now >= Date.parse(claims.expires)
      || claims.quote !== quoteKey || claims.price !== verifiedPrice || claims.price < REPAIR_OFFER.minimum
      || typeof claims.session !== 'string' || offerVariant(claims.session, secret) !== 'offer') return null
    return claims
  } catch { return null }
}
