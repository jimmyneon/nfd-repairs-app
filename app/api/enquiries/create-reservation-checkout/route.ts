import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/resilience'
import { corsHeaders } from '@/lib/api-auth'
import { checkRateLimit, getClientIP } from '@/lib/rate-limit'

const TERMS_VERSION = 'repair-reservation-v1'

function configuredReservationAmount(): number {
  const parsed = Number(process.env.REPAIR_RESERVATION_AMOUNT || '10')
  if (!Number.isFinite(parsed) || parsed < 1 || parsed > 100) return 10
  return Math.round(parsed * 100) / 100
}

function cleanReference(value: string): string {
  return value.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 32)
}

async function getSumUpCheckout(checkoutId: string, apiKey: string) {
  const response = await fetch(`https://api.sumup.com/v0.1/checkouts/${encodeURIComponent(checkoutId)}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
    cache: 'no-store',
  })
  if (!response.ok) return null
  return response.json()
}

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, { status: 200, headers: corsHeaders(request) })
}

/**
 * POST /api/enquiries/create-reservation-checkout
 *
 * Creates a small generic paid reservation for an existing repair quote.
 * This is deliberately separate from the special-order-parts deposit workflow.
 * The amount is server-controlled (default £10) and is credited to the repair.
 *
 * Body: { enquiry_ref: string, terms_accepted: true }
 */
export async function POST(request: NextRequest) {
  const headers = corsHeaders(request)

  try {
    const ip = getClientIP(request)
    const rateLimit = await checkRateLimit(ip, 'reservation_checkout', 8)
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: 'Too many requests. Please wait a minute and try again.' },
        { status: 429, headers }
      )
    }

    const body = await request.json()
    const enquiryRef = String(body?.enquiry_ref || '').trim()
    const termsAccepted = body?.terms_accepted === true

    if (!enquiryRef) {
      return NextResponse.json({ error: 'enquiry_ref is required' }, { status: 400, headers })
    }
    if (!termsAccepted) {
      return NextResponse.json(
        { error: 'Please accept the repair reservation terms before paying.' },
        { status: 400, headers }
      )
    }

    const apiKey = process.env.SUMUP_API_KEY
    const merchantCode = process.env.SUMUP_MERCHANT_CODE
    if (!apiKey || !merchantCode) {
      return NextResponse.json(
        { error: 'Paid reservations are not configured yet.' },
        { status: 503, headers }
      )
    }

    const supabase = createServiceClient()
    const { data: enquiry, error: enquiryError } = await supabase
      .from('enquiries')
      .select('id, enquiry_ref, enquiry_type, status, converted_to_job, customer_name, device_make, device_model, quoted_price, reservation_checkout_id, reservation_payment_status, reservation_amount')
      .eq('enquiry_ref', enquiryRef)
      .single()

    if (enquiryError || !enquiry) {
      return NextResponse.json({ error: 'Repair quote not found.' }, { status: 404, headers })
    }
    if (enquiry.enquiry_type !== 'repair_quote') {
      return NextResponse.json({ error: 'Paid reservations are only available for repair quotes.' }, { status: 400, headers })
    }
    if (enquiry.status === 'rejected') {
      return NextResponse.json({ error: 'This quote has been dismissed.' }, { status: 409, headers })
    }
    if (enquiry.converted_to_job) {
      return NextResponse.json({ error: 'This repair is already a job.' }, { status: 409, headers })
    }
    if (enquiry.reservation_payment_status === 'PAID') {
      return NextResponse.json({
        success: true,
        already_paid: true,
        amount: Number(enquiry.reservation_amount || configuredReservationAmount()),
      }, { headers })
    }

    // Reuse a still-pending hosted checkout instead of creating duplicates.
    if (enquiry.reservation_checkout_id && enquiry.reservation_payment_status === 'PENDING') {
      const existing = await getSumUpCheckout(enquiry.reservation_checkout_id, apiKey)
      if (existing?.status === 'PENDING' && existing?.hosted_checkout_url) {
        return NextResponse.json({
          success: true,
          reused: true,
          checkout_id: existing.id,
          checkout_url: existing.hosted_checkout_url,
          amount: Number(existing.amount),
          currency: existing.currency,
          terms_version: TERMS_VERSION,
        }, { headers })
      }
    }

    const amount = configuredReservationAmount()
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://nfd-repairs-app.vercel.app'
    const websiteUrl = process.env.NEXT_PUBLIC_WEBSITE_URL || 'https://newforestdevicerepairs.co.uk'
    const reference = `NFD-RES-${cleanReference(enquiry.enquiry_ref)}-${Date.now().toString(36)}`.slice(0, 64)

    const sumUpResponse = await fetch('https://api.sumup.com/v0.1/checkouts', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        checkout_reference: reference,
        amount,
        currency: 'GBP',
        merchant_code: merchantCode,
        description: `Repair reservation ${enquiry.enquiry_ref}`,
        return_url: `${appUrl}/api/payments/sumup`,
        redirect_url: `${websiteUrl}/quote-v2/?reservation=return&ref=${encodeURIComponent(enquiry.enquiry_ref)}`,
        hosted_checkout: { enabled: true },
      }),
    })

    const checkout = await sumUpResponse.json().catch(() => null)
    if (!sumUpResponse.ok || !checkout?.id || !checkout?.hosted_checkout_url) {
      console.error('[reservation-checkout] SumUp checkout creation failed:', checkout)
      return NextResponse.json(
        { error: 'Could not start the reservation payment. Please try again.' },
        { status: 502, headers }
      )
    }

    const now = new Date().toISOString()
    const { error: updateError } = await supabase
      .from('enquiries')
      .update({
        commitment_type: 'reservation_pending',
        reservation_amount: amount,
        reservation_checkout_id: checkout.id,
        reservation_checkout_reference: reference,
        reservation_payment_status: checkout.status || 'PENDING',
        reservation_created_at: now,
        reservation_paid_at: null,
        reservation_terms_accepted_at: now,
        reservation_terms_version: TERMS_VERSION,
        updated_at: now,
      } as any)
      .eq('id', enquiry.id)

    if (updateError) {
      console.error('[reservation-checkout] Failed to save checkout:', updateError)
      return NextResponse.json(
        { error: 'Payment was created but we could not attach it to the quote. Please contact us before paying.' },
        { status: 500, headers }
      )
    }

    return NextResponse.json({
      success: true,
      checkout_id: checkout.id,
      checkout_url: checkout.hosted_checkout_url,
      amount,
      currency: 'GBP',
      terms_version: TERMS_VERSION,
    }, { headers })
  } catch (error) {
    console.error('[reservation-checkout] Unexpected error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers })
  }
}
