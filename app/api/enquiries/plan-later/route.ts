import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient, sendViaMacroDroid } from '@/lib/resilience'
import { corsHeaders } from '@/lib/api-auth'
import { checkRateLimit, getClientIP } from '@/lib/rate-limit'
import { getFirstName, safeDeviceLabel } from '@/lib/sms-template'
import { shortQuoteApprovalLink } from '@/lib/utils'

const MIN_DAYS_AHEAD = 3
const MAX_DAYS_AHEAD = 180
const REMINDER_LEAD_DAYS = 2

function isIsoDate(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
}

function dateOnlyUtc(value: string): Date {
  return new Date(`${value}T12:00:00Z`)
}

function calculateReminderAt(plannedRepairDate: string): string {
  const d = new Date(`${plannedRepairDate}T09:00:00Z`)
  d.setUTCDate(d.getUTCDate() - REMINDER_LEAD_DAYS)
  return d.toISOString()
}

function formatDate(value: string): string {
  return new Date(`${value}T12:00:00Z`).toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/London',
  })
}

function formatReminderDate(value: string): string {
  return new Date(value).toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/London',
  })
}

function repairLabel(value: string | null): string {
  if (!value) return 'repair'
  return value.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

function mergeReminderNote(existing: string | null, plannedRepairDate: string, reminderAt: string | null): string {
  const prefix = 'Remind Me Later:'
  const kept = String(existing || '')
    .split('\n')
    .filter(line => !line.trim().startsWith(prefix))
    .join('\n')
    .trim()
  const reminderText = reminderAt ? formatReminderDate(reminderAt) : 'not scheduled'
  const line = `${prefix} target repair ${formatDate(plannedRepairDate)}; automatic reminder ${reminderText}. No booking or deposit.`
  return [kept, line].filter(Boolean).join('\n')
}

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, { status: 200, headers: corsHeaders(request) })
}

/**
 * Saves a repair quote for later. The customer chooses the date they hope to
 * get the repair done; one service reminder is scheduled two days beforehand.
 * This does not book, approve or reserve the repair.
 */
export async function POST(request: NextRequest) {
  const headers = corsHeaders(request)

  try {
    const ip = getClientIP(request)
    const rateLimit = await checkRateLimit(ip, 'enquiries_plan_later', 10)
    if (!rateLimit.allowed) {
      return NextResponse.json({ error: 'Too many requests. Please wait a minute and try again.' }, { status: 429, headers })
    }

    const body = await request.json()
    const enquiryRef = String(body?.enquiry_ref || '').trim()
    const plannedRepairDate = body?.planned_repair_date || body?.follow_up_date
    const reminderRequested = body?.reminder_requested !== false

    if (!enquiryRef || !isIsoDate(plannedRepairDate)) {
      return NextResponse.json({ error: 'enquiry_ref and a valid planned_repair_date are required' }, { status: 400, headers })
    }

    const today = new Date()
    const candidate = dateOnlyUtc(plannedRepairDate)
    const minDate = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() + MIN_DAYS_AHEAD, 12))
    const maxDate = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() + MAX_DAYS_AHEAD, 12))

    if (Number.isNaN(candidate.getTime()) || candidate < minDate || candidate > maxDate) {
      return NextResponse.json({ error: `Please choose a repair date between ${MIN_DAYS_AHEAD} and ${MAX_DAYS_AHEAD} days from now.` }, { status: 400, headers })
    }

    const supabase = createServiceClient()
    const { data: enquiry, error: enquiryError } = await supabase
      .from('enquiries')
      .select('id, enquiry_ref, enquiry_type, status, converted_to_job, customer_name, customer_phone, device_make, device_model, repair_type, quoted_price, display_price, part_option, screen_option, warranty, estimated_time, quote_key, planned_repair_date, reminder_requested, additional_info')
      .eq('enquiry_ref', enquiryRef)
      .single()

    if (enquiryError || !enquiry) return NextResponse.json({ error: 'Enquiry not found' }, { status: 404, headers })
    if (enquiry.enquiry_type !== 'repair_quote') return NextResponse.json({ error: 'This action is only available for repair quotes.' }, { status: 400, headers })
    if (enquiry.status === 'rejected') return NextResponse.json({ error: 'This quote has been dismissed.' }, { status: 409, headers })
    if (enquiry.converted_to_job) return NextResponse.json({ error: 'This enquiry has already become a repair job.' }, { status: 409, headers })
    if (reminderRequested && !enquiry.customer_phone) return NextResponse.json({ error: 'A mobile number is required for a text reminder.' }, { status: 400, headers })

    if (enquiry.planned_repair_date === plannedRepairDate && Boolean(enquiry.reminder_requested) === reminderRequested) {
      return NextResponse.json({
        success: true,
        enquiry_ref: enquiryRef,
        planned_repair_date: plannedRepairDate,
        reminder_requested: reminderRequested,
        reminder_at: reminderRequested ? calculateReminderAt(plannedRepairDate) : null,
        already_saved: true,
      }, { headers })
    }

    const reminderAt = reminderRequested ? calculateReminderAt(plannedRepairDate) : null
    const now = new Date().toISOString()
    const additionalInfo = mergeReminderNote(enquiry.additional_info, plannedRepairDate, reminderAt)

    const { error: updateError } = await supabase
      .from('enquiries')
      .update({
        commitment_type: 'remind_later',
        planned_repair_date: plannedRepairDate,
        reminder_requested: reminderRequested,
        reminder_at: reminderAt,
        reminder_sent_at: null,
        reminder_cancelled_at: null,
        reminder_last_attempt_at: null,
        reminder_count: 0,
        proceed_with_repair: false,
        quote_source: 'remind_later',
        quote_sent_method: enquiry.customer_phone ? 'sms' : null,
        // Existing app UI still renders `screen_option`; preserve the richer
        // `part_option` while also filling that compatibility display field.
        screen_option: enquiry.screen_option || enquiry.part_option || null,
        additional_info: additionalInfo,
        status: 'pending',
        updated_at: now,
      } as any)
      .eq('id', enquiry.id)

    if (updateError) {
      console.error('[plan-later] Failed to update enquiry:', updateError)
      const migrationMissing = /column|schema cache|planned_repair|reminder_/i.test(updateError.message || '')
      return NextResponse.json({
        error: migrationMissing ? 'Quote reminder database migration has not been applied yet.' : 'Failed to save repair reminder.',
        migration_required: migrationMissing,
      }, { status: migrationMissing ? 503 : 500, headers })
    }

    let confirmationSmsSent = false
    if (enquiry.customer_phone) {
      const webhookUrl = process.env.MACRODROID_WEBHOOK_URL
      if (webhookUrl) {
        const firstName = getFirstName(enquiry.customer_name)
        const device = safeDeviceLabel(enquiry.device_make, enquiry.device_model) || 'device'
        const quoteLink = shortQuoteApprovalLink(enquiry.enquiry_ref)
        const priceText = enquiry.display_price
          ? ` ${enquiry.display_price}.`
          : enquiry.quoted_price ? ` £${enquiry.quoted_price}.` : ''
        const optionText = enquiry.part_option ? ` (${enquiry.part_option})` : ''
        const smsBody = `Hi ${firstName}! 👋\n\n💾 ${device} ${repairLabel(enquiry.repair_type)}${optionText}${priceText}\n\n📅 We'll remind you on ${formatReminderDate(reminderAt || `${plannedRepairDate}T09:00:00Z`)}\n\n🔗 ${quoteLink}\n\nNothing is booked and there's nothing to pay now. When you're ready, use the link to go ahead. If a part needs ordering, we'll let you know before asking for any deposit.\n\nNFD Repairs`

        try {
          const smsResult = await sendViaMacroDroid(webhookUrl, enquiry.customer_phone, smsBody)
          confirmationSmsSent = smsResult.ok
          await supabase.from('sms_logs').insert({
            template_key: 'QUOTE_REMIND_LATER_SAVED', body_rendered: smsBody,
            status: smsResult.ok ? 'SENT' : 'FAILED', sent_at: smsResult.ok ? new Date().toISOString() : null,
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
      planned_repair_date: plannedRepairDate,
      reminder_requested: reminderRequested,
      reminder_at: reminderAt,
      confirmation_sms_sent: confirmationSmsSent,
    }, { headers })
  } catch (error) {
    console.error('[plan-later] Unexpected error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers })
  }
}
