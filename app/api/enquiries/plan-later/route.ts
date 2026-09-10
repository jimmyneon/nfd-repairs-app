import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient, sendViaMacroDroid } from '@/lib/resilience'
import { corsHeaders } from '@/lib/api-auth'
import { checkRateLimit, getClientIP } from '@/lib/rate-limit'
import { getFirstName, safeDeviceLabel } from '@/lib/sms-template'
import { shortQuoteApprovalLink } from '@/lib/utils'

const MAX_DAYS_AHEAD = 180

function isIsoDate(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
}

function dateOnlyUtc(value: string): Date {
  return new Date(`${value}T12:00:00Z`)
}

function calculateReminderAt(followUpDate: string): string {
  // 09:00 UTC on the chosen date. This lands at 09:00 GMT / 10:00 BST,
  // safely inside the app's 08:00–20:00 UK SMS window year-round.
  return new Date(`${followUpDate}T09:00:00Z`).toISOString()
}

function formatDate(value: string): string {
  return new Date(`${value}T12:00:00Z`).toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'Europe/London',
  })
}

function repairLabel(value: string | null): string {
  if (!value) return 'repair'
  return value.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, { status: 200, headers: corsHeaders(request) })
}

/**
 * POST /api/enquiries/plan-later
 *
 * Saves a repair quote as a future follow-up. This is deliberately NOT a booking,
 * repair approval or paid reservation. The customer chooses when they want one
 * service reminder and pays £0. A real repair approval happens later via the quote.
 *
 * Body: {
 *   enquiry_ref: string,
 *   follow_up_date: YYYY-MM-DD,
 *   reminder_requested?: boolean
 * }
 */
export async function POST(request: NextRequest) {
  const headers = corsHeaders(request)

  try {
    const ip = getClientIP(request)
    const rateLimit = await checkRateLimit(ip, 'enquiries_plan_later', 10)
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: 'Too many requests. Please wait a minute and try again.' },
        { status: 429, headers }
      )
    }

    const body = await request.json()
    const enquiryRef = String(body?.enquiry_ref || '').trim()
    const followUpDate = body?.follow_up_date || body?.planned_visit_date
    const reminderRequested = body?.reminder_requested !== false

    if (!enquiryRef || !isIsoDate(followUpDate)) {
      return NextResponse.json(
        { error: 'enquiry_ref and a valid follow_up_date are required' },
        { status: 400, headers }
      )
    }

    const today = new Date()
    const candidate = dateOnlyUtc(followUpDate)
    const tomorrow = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() + 1, 12))
    const maxDate = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() + MAX_DAYS_AHEAD, 12))

    if (Number.isNaN(candidate.getTime()) || candidate < tomorrow || candidate > maxDate) {
      return NextResponse.json(
        { error: `Please choose a date between tomorrow and ${MAX_DAYS_AHEAD} days from now.` },
        { status: 400, headers }
      )
    }

    const supabase = createServiceClient()
    const { data: enquiry, error: enquiryError } = await supabase
      .from('enquiries')
      .select('id, enquiry_ref, enquiry_type, status, converted_to_job, customer_name, customer_phone, device_make, device_model, repair_type, quoted_price, follow_up_date, reminder_requested')
      .eq('enquiry_ref', enquiryRef)
      .single()

    if (enquiryError || !enquiry) {
      return NextResponse.json({ error: 'Enquiry not found' }, { status: 404, headers })
    }

    if (enquiry.enquiry_type !== 'repair_quote') {
      return NextResponse.json({ error: 'This action is only available for repair quotes.' }, { status: 400, headers })
    }

    if (enquiry.converted_to_job) {
      return NextResponse.json(
        { error: 'This enquiry has already become a repair job.' },
        { status: 409, headers }
      )
    }

    if (reminderRequested && !enquiry.customer_phone) {
      return NextResponse.json(
        { error: 'A mobile number is required for a text reminder.' },
        { status: 400, headers }
      )
    }

    // Idempotency: a double-tap should not send a second confirmation SMS.
    if (enquiry.follow_up_date === followUpDate && Boolean(enquiry.reminder_requested) === reminderRequested) {
      return NextResponse.json({
        success: true,
        enquiry_ref: enquiryRef,
        follow_up_date: followUpDate,
        reminder_requested: reminderRequested,
        already_saved: true,
      }, { headers })
    }

    const reminderAt = reminderRequested ? calculateReminderAt(followUpDate) : null
    const now = new Date().toISOString()

    const { error: updateError } = await supabase
      .from('enquiries')
      .update({
        commitment_type: 'follow_up',
        follow_up_date: followUpDate,
        reminder_requested: reminderRequested,
        reminder_at: reminderAt,
        reminder_sent_at: null,
        reminder_cancelled_at: null,
        reminder_last_attempt_at: null,
        reminder_count: 0,
        // This is a retained lead, not a booking or repair approval.
        proceed_with_repair: false,
        quote_source: 'planned_follow_up',
        quote_sent_method: enquiry.customer_phone ? 'sms' : null,
        status: 'pending',
        updated_at: now,
      } as any)
      .eq('id', enquiry.id)

    if (updateError) {
      console.error('[plan-later] Failed to update enquiry:', updateError)
      const migrationMissing = /column|schema cache|follow_up|reminder_/i.test(updateError.message || '')
      return NextResponse.json(
        {
          error: migrationMissing
            ? 'Quote reminder database migration has not been applied yet.'
            : 'Failed to save follow-up.',
          migration_required: migrationMissing,
        },
        { status: migrationMissing ? 503 : 500, headers }
      )
    }

    try {
      const device = safeDeviceLabel(enquiry.device_make, enquiry.device_model) || 'device'
      const price = enquiry.quoted_price ? ` — £${enquiry.quoted_price}` : ''
      await supabase.from('notifications').insert({
        type: 'QUOTE_ACTION',
        title: `Future quote follow-up: ${formatDate(followUpDate)}`,
        body: `${enquiry.customer_name} saved their ${device} ${repairLabel(enquiry.repair_type)} quote${price} and asked to be contacted on ${formatDate(followUpDate)}. No action needed now.`,
        is_read: false,
      } as any)
    } catch (e) {
      console.error('[plan-later] Notification insert failed:', e)
    }

    let confirmationSmsSent = false
    if (enquiry.customer_phone) {
      const webhookUrl = process.env.MACRODROID_WEBHOOK_URL
      if (webhookUrl) {
        const firstName = getFirstName(enquiry.customer_name)
        const device = safeDeviceLabel(enquiry.device_make, enquiry.device_model) || 'device'
        const quoteLink = shortQuoteApprovalLink(enquiry.enquiry_ref)
        const priceText = enquiry.quoted_price ? ` Your saved quote is £${enquiry.quoted_price}.` : ''
        const reminderText = reminderRequested
          ? ` We'll text you again on ${formatDate(followUpDate)}.`
          : ''
        const smsBody = `Hi ${firstName}, we've saved your ${device} repair for later.${priceText}${reminderText}\n\nYour quote: ${quoteLink}\n\nNothing to pay now. If you decide to go ahead, use the quote link. We'll confirm any parts needed before ordering them.\n\nNFD Repairs`

        try {
          const smsResult = await sendViaMacroDroid(webhookUrl, enquiry.customer_phone, smsBody)
          confirmationSmsSent = smsResult.ok
          await supabase.from('sms_logs').insert({
            template_key: 'QUOTE_FOLLOW_UP_SAVED',
            body_rendered: smsBody,
            status: smsResult.ok ? 'SENT' : 'FAILED',
            sent_at: smsResult.ok ? new Date().toISOString() : null,
            error_message: smsResult.ok ? null : String(smsResult.body || '').substring(0, 500),
          } as any)
        } catch (smsError) {
          console.error('[plan-later] Confirmation SMS failed:', smsError)
        }
      }
    }

    return NextResponse.json({
      success: true,
      enquiry_ref: enquiryRef,
      follow_up_date: followUpDate,
      reminder_requested: reminderRequested,
      reminder_at: reminderAt,
      confirmation_sms_sent: confirmationSmsSent,
    }, { headers })
  } catch (error) {
    console.error('[plan-later] Unexpected error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers })
  }
}
