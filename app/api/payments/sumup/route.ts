import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient, sendViaMacroDroid } from '@/lib/resilience'
import { getFirstName, safeDeviceLabel } from '@/lib/sms-template'

/**
 * SumUp checkout-status webhook.
 *
 * SumUp's webhook payload is only a notification. We do not trust the payload
 * as proof of payment: every event is verified by retrieving the checkout from
 * SumUp's API before changing the repair enquiry.
 */
export async function POST(request: NextRequest) {
  try {
    const event = await request.json().catch(() => null)
    if (!event || event.event_type !== 'CHECKOUT_STATUS_CHANGED' || !event.id) {
      // SumUp recommends silently ignoring unknown future event types.
      return new NextResponse(null, { status: 204 })
    }

    const apiKey = process.env.SUMUP_API_KEY
    const merchantCode = process.env.SUMUP_MERCHANT_CODE
    if (!apiKey || !merchantCode) {
      console.error('[sumup-webhook] SumUp API credentials are not configured')
      return new NextResponse(null, { status: 503 })
    }

    const checkoutResponse = await fetch(
      `https://api.sumup.com/v0.1/checkouts/${encodeURIComponent(String(event.id))}`,
      {
        headers: { Authorization: `Bearer ${apiKey}` },
        cache: 'no-store',
      }
    )

    if (!checkoutResponse.ok) {
      console.error('[sumup-webhook] Could not verify checkout:', checkoutResponse.status)
      // Non-2xx asks SumUp to retry the webhook later.
      return new NextResponse(null, { status: 502 })
    }

    const checkout = await checkoutResponse.json()
    if (!checkout?.id) return new NextResponse(null, { status: 502 })

    // A webhook id alone is never sufficient proof. The checkout retrieved from
    // SumUp must belong to our configured merchant.
    if (checkout.merchant_code !== merchantCode) {
      console.error('[sumup-webhook] Merchant mismatch for checkout', checkout.id)
      return new NextResponse(null, { status: 403 })
    }

    const supabase = createServiceClient()
    const { data: enquiry, error: enquiryError } = await supabase
      .from('enquiries')
      .select('id, enquiry_ref, customer_name, customer_phone, device_make, device_model, repair_type, reservation_amount, reservation_checkout_id, reservation_checkout_reference, reservation_transaction_id, reservation_payment_status')
      .eq('reservation_checkout_id', checkout.id)
      .single()

    if (enquiryError || !enquiry) {
      console.error('[sumup-webhook] No enquiry found for checkout', checkout.id)
      return new NextResponse(null, { status: 404 })
    }

    if (!enquiry.reservation_checkout_reference || checkout.checkout_reference !== enquiry.reservation_checkout_reference) {
      console.error('[sumup-webhook] Checkout reference mismatch', checkout.id)
      return new NextResponse(null, { status: 409 })
    }

    const expectedAmount = Number(enquiry.reservation_amount || 0)
    const actualAmount = Number(checkout.amount || 0)
    if (checkout.currency !== 'GBP' || !expectedAmount || Math.abs(expectedAmount - actualAmount) > 0.001) {
      console.error('[sumup-webhook] Amount/currency mismatch', {
        checkout: checkout.id,
        expectedAmount,
        actualAmount,
        currency: checkout.currency,
      })
      return new NextResponse(null, { status: 409 })
    }

    const checkoutStatus = String(checkout.status || 'PENDING').toUpperCase()
    const now = new Date().toISOString()

    if (checkoutStatus !== 'PAID') {
      await supabase
        .from('enquiries')
        .update({
          reservation_payment_status: checkoutStatus,
          commitment_type: checkoutStatus === 'FAILED' || checkoutStatus === 'EXPIRED'
            ? 'reservation_failed'
            : 'reservation_pending',
          updated_at: now,
        } as any)
        .eq('id', enquiry.id)

      return new NextResponse(null, { status: 204 })
    }

    // A paid checkout should contain the successful ECOM transaction. We retain
    // its id so a later staff-authorised refund can be made against the exact payment.
    const transactions: any[] = Array.isArray(checkout.transactions) ? checkout.transactions : []
    const successfulTransaction = transactions.find(tx => String(tx?.status || '').toUpperCase() === 'SUCCESSFUL')
      || transactions[0]

    if (!successfulTransaction?.id) {
      console.error('[sumup-webhook] Paid checkout has no transaction id yet', checkout.id)
      // Ask SumUp to retry; the transaction may not have propagated into the checkout response yet.
      return new NextResponse(null, { status: 502 })
    }

    // Idempotency: webhook retries must never send a second confirmation or
    // create a second staff action once payment is already recorded.
    if (enquiry.reservation_payment_status === 'PAID') {
      // Backfill transaction id if an earlier webhook version did not record it.
      if (!enquiry.reservation_transaction_id) {
        await supabase
          .from('enquiries')
          .update({ reservation_transaction_id: successfulTransaction.id, updated_at: now } as any)
          .eq('id', enquiry.id)
      }
      return new NextResponse(null, { status: 204 })
    }

    const { error: paidUpdateError } = await supabase
      .from('enquiries')
      .update({
        reservation_payment_status: 'PAID',
        reservation_paid_at: now,
        reservation_transaction_id: successfulTransaction.id,
        commitment_type: 'paid_reservation',
        proceed_with_repair: true,
        status: 'approved',
        reminder_cancelled_at: now,
        updated_at: now,
      } as any)
      .eq('id', enquiry.id)

    if (paidUpdateError) {
      console.error('[sumup-webhook] Failed to record paid reservation:', paidUpdateError)
      return new NextResponse(null, { status: 500 })
    }

    try {
      const device = safeDeviceLabel(enquiry.device_make, enquiry.device_model) || 'device'
      await supabase.from('notifications').insert({
        type: 'CUSTOMER_PROCEED',
        title: `£${actualAmount.toFixed(2)} repair reservation paid`,
        body: `${enquiry.customer_name} paid a repair reservation for ${device}. Check stock/parts and send next steps.`,
        is_read: false,
      } as any)
    } catch (notificationError) {
      console.error('[sumup-webhook] Staff notification failed:', notificationError)
    }

    if (enquiry.customer_phone) {
      const webhookUrl = process.env.MACRODROID_WEBHOOK_URL
      if (webhookUrl) {
        const firstName = getFirstName(enquiry.customer_name)
        const device = safeDeviceLabel(enquiry.device_make, enquiry.device_model) || 'device'
        const smsBody = `✅ Thanks ${firstName} — your £${actualAmount.toFixed(2)} repair reservation for your ${device} is confirmed. It comes off the final repair bill.\n\nWe'll check parts availability and text you with the next step.\n\nNFD Repairs`

        try {
          const smsResult = await sendViaMacroDroid(webhookUrl, enquiry.customer_phone, smsBody)
          await supabase.from('sms_logs').insert({
            template_key: 'REPAIR_RESERVATION_PAID',
            body_rendered: smsBody,
            status: smsResult.ok ? 'SENT' : 'FAILED',
            sent_at: smsResult.ok ? new Date().toISOString() : null,
            error_message: smsResult.ok ? null : String(smsResult.body || '').substring(0, 500),
          } as any)
        } catch (smsError) {
          console.error('[sumup-webhook] Customer confirmation SMS failed:', smsError)
        }
      }
    }

    return new NextResponse(null, { status: 204 })
  } catch (error) {
    console.error('[sumup-webhook] Unexpected error:', error)
    return new NextResponse(null, { status: 500 })
  }
}
