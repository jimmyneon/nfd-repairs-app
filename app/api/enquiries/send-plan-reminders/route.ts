import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient, isWithinUKSendingHours, sendSms } from '@/lib/resilience'
import { requireCronSecret } from '@/lib/api-auth'
import { getFirstName, safeDeviceLabel } from '@/lib/sms-template'
import { shortQuoteApprovalLink } from '@/lib/utils'
import { generateQuoteActionToken, quoteActionTokenExpiry, isQuoteActionTokenValid } from '@/lib/job-utils'

export const maxDuration = 300

function repairLabel(value: string | null): string {
  if (!value) return 'repair'
  return value.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

function formatDate(value: string | null): string {
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
 * Cron-only endpoint. Sends one neutral service reminder two days before the
 * repair date selected by the customer. No discounts, cross-sells or marketing.
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
    const nowDate = new Date()
    const now = nowDate.toISOString()
    const today = nowDate.toISOString().slice(0, 10)
    const oneHourAgo = new Date(nowDate.getTime() - 60 * 60 * 1000).toISOString()

    const { data: reminders, error: fetchError } = await supabase
      .from('enquiries')
      .select('id, enquiry_ref, customer_name, customer_phone, device_make, device_model, repair_type, quoted_price, display_price, part_option, planned_repair_date, reminder_at, reminder_count, reminder_last_attempt_at, status, converted_to_job, proceed_with_repair, quote_action_token, quote_action_token_expires_at, quote_action_token_revoked_at')
      .eq('enquiry_type', 'repair_quote')
      .eq('commitment_type', 'remind_later')
      .eq('reminder_requested', true)
      .is('reminder_sent_at', null)
      .is('reminder_cancelled_at', null)
      .lte('reminder_at', now)
      .gte('planned_repair_date', today)
      .in('status', ['pending', 'more_info_requested'])
      .or('converted_to_job.is.null,converted_to_job.eq.false')
      .or('proceed_with_repair.is.null,proceed_with_repair.eq.false')
      .or(`reminder_last_attempt_at.is.null,reminder_last_attempt_at.lt.${oneHourAgo}`)
      .order('reminder_at', { ascending: true })
      .limit(20)

    if (fetchError) {
      console.error('[quote-reminders] Fetch failed:', fetchError)
      const migrationMissing = /column|schema cache|planned_repair|reminder_/i.test(fetchError.message || '')
      return NextResponse.json({
        error: migrationMissing
          ? 'Quote reminder database migration has not been applied yet.'
          : 'Failed to fetch due reminders.',
        migration_required: migrationMissing,
      }, { status: migrationMissing ? 503 : 500 })
    }

    if (!reminders || reminders.length === 0) {
      return NextResponse.json({ success: true, sent: 0, message: 'No repair reminders due.' })
    }

    let sent = 0
    let failed = 0
    const results: Array<Record<string, unknown>> = []

    for (let i = 0; i < reminders.length; i++) {
      const enquiry = reminders[i]
      const attemptAt = new Date().toISOString()

      await supabase
        .from('enquiries')
        .update({ reminder_last_attempt_at: attemptAt, updated_at: attemptAt } as any)
        .eq('id', enquiry.id)

      if (!enquiry.customer_phone) {
        await supabase
          .from('enquiries')
          .update({ reminder_cancelled_at: attemptAt, updated_at: attemptAt } as any)
          .eq('id', enquiry.id)
        failed++
        results.push({ enquiry_ref: enquiry.enquiry_ref, status: 'CANCELLED', reason: 'no phone' })
        continue
      }

      const firstName = getFirstName(enquiry.customer_name)
      const device = safeDeviceLabel(enquiry.device_make, enquiry.device_model) || 'device'
      const repair = repairLabel(enquiry.repair_type)
      const targetDate = formatDate(enquiry.planned_repair_date)

      // Ensure a valid quote-action token for the reminder link. Issue a
      // fresh one if missing/expired and persist it with the reminder update.
      let quoteActionToken = enquiry.quote_action_token
      const tokenNeedsRefresh = !isQuoteActionTokenValid(
        quoteActionToken, enquiry.quote_action_token_expires_at, enquiry.quote_action_token_revoked_at
      )
      if (tokenNeedsRefresh) {
        quoteActionToken = generateQuoteActionToken()
        await supabase
          .from('enquiries')
          .update({
            quote_action_token: quoteActionToken,
            quote_action_token_expires_at: quoteActionTokenExpiry(),
            quote_action_token_revoked_at: null,
            updated_at: attemptAt,
          } as any)
          .eq('id', enquiry.id)
      }

      const quoteLink = shortQuoteApprovalLink(enquiry.enquiry_ref, quoteActionToken)
      const priceText = enquiry.display_price
        ? ` for ${enquiry.display_price}`
        : enquiry.quoted_price
          ? ` for £${enquiry.quoted_price}`
          : ''
      const optionText = enquiry.part_option ? ` (${enquiry.part_option})` : ''

      const smsBody = `Hi ${firstName}! 👋\n\nStill want your ${device} ${repair}${optionText} done on ${targetDate}${priceText}?\n\n🔗 ${quoteLink}\n\nOr just reply to this text. We'll check parts are in stock before you make a trip. If a part needs ordering, we'll let you know before asking for any deposit.\n\nNFD Repairs`

      try {
        const smsResult = await sendSms(enquiry.customer_phone, smsBody)
        const sentOk = smsResult.ok

        try {
          await supabase.from('sms_logs').insert({
            template_key: 'QUOTE_REMIND_LATER_DUE',
            body_rendered: smsBody,
            status: sentOk ? (smsResult.queued ? 'PENDING' : 'SENT') : 'FAILED',
            sent_at: sentOk && !smsResult.queued ? new Date().toISOString() : null,
            error_message: sentOk
              ? (smsResult.relayMessageId ? `relay_message_id:${smsResult.relayMessageId}` : null)
              : String(smsResult.body || '').substring(0, 500),
          } as any)
        } catch (logError) {
          console.error('[quote-reminders] SMS log failed:', logError)
        }

        if (sentOk) {
          const sentAt = new Date().toISOString()
          await supabase
            .from('enquiries')
            .update({
              reminder_sent_at: sentAt,
              reminder_count: (enquiry.reminder_count || 0) + 1,
              updated_at: sentAt,
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
