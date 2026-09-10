import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient, isWithinUKSendingHours, sendViaMacroDroid } from '@/lib/resilience'
import { requireCronSecret } from '@/lib/api-auth'
import { getFirstName, safeDeviceLabel } from '@/lib/sms-template'
import { shortQuoteApprovalLink } from '@/lib/utils'

export const maxDuration = 300

function repairLabel(value: string | null): string {
  if (!value) return 'repair'
  return value.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

function formatPlannedDate(value: string | null): string {
  if (!value) return 'the date you chose'
  try {
    return new Date(`${value}T12:00:00Z`).toLocaleDateString('en-GB', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      timeZone: 'Europe/London',
    })
  } catch {
    return value
  }
}

/**
 * GET /api/enquiries/send-plan-reminders
 *
 * Cron-only endpoint. Sends ONE neutral service reminder for a repair quote
 * when the customer explicitly asked to be reminded. It intentionally contains
 * no discounts, cross-sells or marketing copy.
 */
export async function GET(request: NextRequest) {
  const authResponse = requireCronSecret(request)
  if (authResponse) return authResponse

  try {
    if (!isWithinUKSendingHours()) {
      return NextResponse.json({
        success: true,
        sent: 0,
        skipped: true,
        message: 'Outside allowed UK sending hours (08:00–20:00).',
      })
    }

    const webhookUrl = process.env.MACRODROID_WEBHOOK_URL
    if (!webhookUrl) {
      return NextResponse.json({ error: 'SMS webhook not configured' }, { status: 500 })
    }

    const supabase = createServiceClient()
    const now = new Date().toISOString()

    const { data: reminders, error: fetchError } = await supabase
      .from('enquiries')
      .select('id, enquiry_ref, customer_name, customer_phone, device_make, device_model, repair_type, quoted_price, planned_visit_date, reminder_at, reminder_count, status, converted_to_job')
      .eq('enquiry_type', 'repair_quote')
      .eq('reminder_requested', true)
      .is('reminder_sent_at', null)
      .is('reminder_cancelled_at', null)
      .lte('reminder_at', now)
      .in('status', ['pending', 'approved', 'more_info_requested'])
      .eq('converted_to_job', false)
      .order('reminder_at', { ascending: true })
      .limit(20)

    if (fetchError) {
      console.error('[quote-reminders] Fetch failed:', fetchError)
      const migrationMissing = /column|schema cache|reminder_/i.test(fetchError.message || '')
      return NextResponse.json({
        error: migrationMissing
          ? 'Quote reminder database migration has not been applied yet.'
          : 'Failed to fetch due reminders.',
        migration_required: migrationMissing,
      }, { status: migrationMissing ? 503 : 500 })
    }

    if (!reminders || reminders.length === 0) {
      return NextResponse.json({ success: true, sent: 0, message: 'No quote reminders due.' })
    }

    let sent = 0
    let failed = 0
    const results: Array<Record<string, unknown>> = []

    for (let i = 0; i < reminders.length; i++) {
      const enquiry = reminders[i]

      if (!enquiry.customer_phone) {
        failed++
        results.push({ enquiry_ref: enquiry.enquiry_ref, status: 'SKIPPED', reason: 'no phone' })
        continue
      }

      const firstName = getFirstName(enquiry.customer_name)
      const device = safeDeviceLabel(enquiry.device_make, enquiry.device_model) || 'device'
      const repair = repairLabel(enquiry.repair_type)
      const plannedDate = formatPlannedDate(enquiry.planned_visit_date)
      const quoteLink = shortQuoteApprovalLink(enquiry.enquiry_ref)
      const priceText = enquiry.quoted_price ? ` Your saved price was £${enquiry.quoted_price}.` : ''

      const smsBody = `Hi ${firstName}, you asked us to remind you about your ${device} ${repair}. You were thinking of coming in around ${plannedDate}.${priceText}\n\nYour repair plan is here: ${quoteLink}\n\nIf your plans have changed, that's fine — just reply to this text.\n\nNFD Repairs`

      try {
        const smsResult = await sendViaMacroDroid(webhookUrl, enquiry.customer_phone, smsBody)
        const sentOk = smsResult.ok

        try {
          await supabase.from('sms_logs').insert({
            template_key: 'QUOTE_PLAN_REMINDER',
            body_rendered: smsBody,
            status: sentOk ? 'SENT' : 'FAILED',
            sent_at: sentOk ? new Date().toISOString() : null,
            error_message: sentOk ? null : String(smsResult.body || '').substring(0, 500),
          } as any)
        } catch (logError) {
          console.error('[quote-reminders] SMS log failed:', logError)
        }

        if (sentOk) {
          await supabase
            .from('enquiries')
            .update({
              reminder_sent_at: new Date().toISOString(),
              reminder_count: (enquiry.reminder_count || 0) + 1,
              updated_at: new Date().toISOString(),
            } as any)
            .eq('id', enquiry.id)

          sent++
          results.push({ enquiry_ref: enquiry.enquiry_ref, status: 'SENT' })
        } else {
          failed++
          results.push({ enquiry_ref: enquiry.enquiry_ref, status: 'FAILED' })
        }
      } catch (error) {
        console.error(`[quote-reminders] Send failed for ${enquiry.enquiry_ref}:`, error)
        failed++
        results.push({ enquiry_ref: enquiry.enquiry_ref, status: 'FAILED' })
      }

      // Keep MacroDroid traffic comfortably spaced.
      if (i < reminders.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 3000))
      }
    }

    return NextResponse.json({ success: true, sent, failed, total: reminders.length, results })
  } catch (error) {
    console.error('[quote-reminders] Unexpected error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
