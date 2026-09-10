import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient, sendViaMacroDroid } from '@/lib/resilience'
import { requireStaffUser } from '@/lib/api-auth'
import { getFirstName, safeDeviceLabel } from '@/lib/sms-template'

/**
 * POST /api/enquiries/refund-reservation
 *
 * Staff-only full refund for the generic repair reservation. This deliberately
 * refuses to refund after the enquiry has been converted to a job; at that point
 * staff should review the repair/parts position before deciding what is owed.
 *
 * Body: { enquiry_ref: string, reason?: string }
 */
export async function POST(request: NextRequest) {
  const { response: authResponse } = await requireStaffUser(request)
  if (authResponse) return authResponse

  try {
    const body = await request.json().catch(() => ({}))
    const enquiryRef = String(body?.enquiry_ref || '').trim()
    const reason = String(body?.reason || 'Customer cancelled before repair work started').trim().slice(0, 500)

    if (!enquiryRef) {
      return NextResponse.json({ error: 'enquiry_ref is required' }, { status: 400 })
    }

    const apiKey = process.env.SUMUP_API_KEY
    const merchantCode = process.env.SUMUP_MERCHANT_CODE
    if (!apiKey || !merchantCode) {
      return NextResponse.json({ error: 'SumUp API credentials are not configured.' }, { status: 503 })
    }

    const supabase = createServiceClient()
    const { data: enquiry, error: enquiryError } = await supabase
      .from('enquiries')
      .select('id, enquiry_ref, customer_name, customer_phone, device_make, device_model, converted_to_job, reservation_amount, reservation_checkout_id, reservation_checkout_reference, reservation_transaction_id, reservation_payment_status, reservation_refunded_at')
      .eq('enquiry_ref', enquiryRef)
      .single()

    if (enquiryError || !enquiry) {
      return NextResponse.json({ error: 'Repair enquiry not found.' }, { status: 404 })
    }

    if (enquiry.converted_to_job) {
      return NextResponse.json(
        { error: 'This repair has already been converted to a job. Review work/parts before refunding.' },
        { status: 409 }
      )
    }

    if (enquiry.reservation_payment_status === 'REFUNDED' || enquiry.reservation_refunded_at) {
      return NextResponse.json({
        success: true,
        already_refunded: true,
        amount: Number(enquiry.reservation_amount || 0),
      })
    }

    if (enquiry.reservation_payment_status !== 'PAID' || !enquiry.reservation_checkout_id) {
      return NextResponse.json({ error: 'There is no paid repair reservation to refund.' }, { status: 409 })
    }

    // Re-fetch the checkout from SumUp. Local DB state alone is never used to
    // choose the transaction that receives the refund.
    const checkoutResponse = await fetch(
      `https://api.sumup.com/v0.1/checkouts/${encodeURIComponent(enquiry.reservation_checkout_id)}`,
      {
        headers: { Authorization: `Bearer ${apiKey}` },
        cache: 'no-store',
      }
    )

    if (!checkoutResponse.ok) {
      console.error('[reservation-refund] Could not retrieve checkout:', checkoutResponse.status)
      return NextResponse.json({ error: 'Could not verify the SumUp payment.' }, { status: 502 })
    }

    const checkout = await checkoutResponse.json()
    if (checkout?.merchant_code !== merchantCode) {
      return NextResponse.json({ error: 'SumUp merchant mismatch.' }, { status: 409 })
    }
    if (!enquiry.reservation_checkout_reference || checkout?.checkout_reference !== enquiry.reservation_checkout_reference) {
      return NextResponse.json({ error: 'SumUp checkout reference mismatch.' }, { status: 409 })
    }

    const amount = Number(enquiry.reservation_amount || 0)
    if (!amount || checkout?.currency !== 'GBP' || Math.abs(Number(checkout?.amount || 0) - amount) > 0.001) {
      return NextResponse.json({ error: 'SumUp checkout amount/currency mismatch.' }, { status: 409 })
    }

    const transactions: any[] = Array.isArray(checkout?.transactions) ? checkout.transactions : []
    const transaction = transactions.find(tx => tx?.id === enquiry.reservation_transaction_id)
      || transactions.find(tx => String(tx?.status || '').toUpperCase() === 'SUCCESSFUL')
      || transactions[0]

    if (!transaction?.id) {
      return NextResponse.json({ error: 'Could not identify the SumUp transaction to refund.' }, { status: 502 })
    }

    const refundResponse = await fetch(
      `https://api.sumup.com/v1.0/merchants/${encodeURIComponent(merchantCode)}/payments/${encodeURIComponent(transaction.id)}/refunds`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        // Amount is omitted intentionally: SumUp treats this as a full refund.
        body: JSON.stringify({}),
      }
    )

    if (!refundResponse.ok) {
      const errorText = await refundResponse.text().catch(() => '')
      console.error('[reservation-refund] SumUp refund failed:', refundResponse.status, errorText)
      return NextResponse.json(
        { error: 'SumUp did not accept the refund. No local refund has been recorded.' },
        { status: 502 }
      )
    }

    const now = new Date().toISOString()
    const { error: updateError } = await supabase
      .from('enquiries')
      .update({
        reservation_transaction_id: transaction.id,
        reservation_payment_status: 'REFUNDED',
        reservation_refunded_at: now,
        reservation_refund_amount: amount,
        commitment_type: 'reservation_refunded',
        proceed_with_repair: false,
        status: 'pending',
        updated_at: now,
      } as any)
      .eq('id', enquiry.id)

    if (updateError) {
      console.error('[reservation-refund] Refund succeeded but local update failed:', updateError)
      // Money has already moved. Return an explicit reconciliation error rather
      // than retrying automatically and risking a duplicate refund request.
      return NextResponse.json({
        error: 'Refund succeeded at SumUp but the local record needs manual reconciliation.',
        refund_succeeded: true,
        reconciliation_required: true,
      }, { status: 500 })
    }

    try {
      const device = safeDeviceLabel(enquiry.device_make, enquiry.device_model) || 'device'
      await supabase.from('notifications').insert({
        type: 'QUOTE_ACTION',
        title: `£${amount.toFixed(2)} reservation refunded`,
        body: `${enquiry.customer_name}'s generic repair reservation for ${device} was refunded. Reason: ${reason}`,
        is_read: false,
      } as any)
    } catch (notificationError) {
      console.error('[reservation-refund] Notification failed:', notificationError)
    }

    if (enquiry.customer_phone) {
      const webhookUrl = process.env.MACRODROID_WEBHOOK_URL
      if (webhookUrl) {
        const firstName = getFirstName(enquiry.customer_name)
        const device = safeDeviceLabel(enquiry.device_make, enquiry.device_model) || 'device'
        const smsBody = `Hi ${firstName}, your £${amount.toFixed(2)} repair reservation for your ${device} has been refunded to the payment method you used.\n\nYour repair quote is no longer reserved, but you're welcome to come back to us anytime.\n\nNFD Repairs`
        try {
          const smsResult = await sendViaMacroDroid(webhookUrl, enquiry.customer_phone, smsBody)
          await supabase.from('sms_logs').insert({
            template_key: 'REPAIR_RESERVATION_REFUNDED',
            body_rendered: smsBody,
            status: smsResult.ok ? 'SENT' : 'FAILED',
            sent_at: smsResult.ok ? new Date().toISOString() : null,
            error_message: smsResult.ok ? null : String(smsResult.body || '').substring(0, 500),
          } as any)
        } catch (smsError) {
          console.error('[reservation-refund] Customer SMS failed:', smsError)
        }
      }
    }

    return NextResponse.json({
      success: true,
      amount,
      transaction_id: transaction.id,
      reason,
    })
  } catch (error) {
    console.error('[reservation-refund] Unexpected error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
