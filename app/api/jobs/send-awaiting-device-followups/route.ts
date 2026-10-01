import { NextRequest, NextResponse } from 'next/server'
import { sendEmail } from '@/lib/email'
import { getFirstName, safeDeviceLabel } from '@/lib/sms-template'
import { shortHoursLink, shortTrackingLink } from '@/lib/utils'
import { createServiceClient, isWithinUKSendingHours, sendSms } from '@/lib/resilience'
import { requireCronSecret } from '@/lib/api-auth'
import { isAwaitingDeviceFollowupDue, parseOpeningHours } from '@/lib/awaiting-device-followup'

export const maxDuration = 300

function escapeHtml(value: unknown): string {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

export async function GET(request: NextRequest) {
  const cronResponse = requireCronSecret(request)
  if (cronResponse) return cronResponse

  if (!isWithinUKSendingHours()) {
    return NextResponse.json({
      success: true,
      skipped: true,
      count: 0,
      message: 'Outside allowed sending hours (8am-8pm UK time)',
    })
  }

  try {
    const supabase = createServiceClient()

    const { data: hoursSetting } = await supabase
      .from('admin_settings')
      .select('value')
      .eq('key', 'opening_hours')
      .maybeSingle()

    const openingHours = parseOpeningHours(hoursSetting?.value)
    const oldestAllowed = new Date(Date.now() - 21 * 86_400_000).toISOString()

    const { data: jobs, error } = await supabase
      .from('jobs')
      .select('id,job_ref,customer_name,customer_phone,customer_email,device_make,device_model,issue,status,source,device_in_shop,status_changed_at,created_at,updated_at,awaiting_device_followup_at,tracking_token,short_token')
      .in('status', ['AWAITING_DEVICE', 'QUOTE_APPROVED', 'PARTS_ARRIVED'])
      .in('source', ['enquiry_conversion', 'sms_acceptance'])
      .eq('device_in_shop', false)
      .is('awaiting_device_followup_at', null)
      .gt('created_at', oldestAllowed)
      .order('created_at', { ascending: true })
      .limit(50)

    if (error) {
      console.error('[awaiting-device-followup] Query failed:', error)
      return NextResponse.json({ error: 'Failed to query awaiting-device jobs' }, { status: 500 })
    }

    const now = new Date()
    const eligible = (jobs || []).filter(job => isAwaitingDeviceFollowupDue(job, openingHours, now))

    let contacted = 0
    let smsSent = 0
    let emailSent = 0
    let noContact = 0

    for (const job of eligible) {
      const firstName = getFirstName(job.customer_name)
      const device = safeDeviceLabel(job.device_make, job.device_model)
      const trackingUrl = shortTrackingLink(job.short_token || job.tracking_token)
      const hoursUrl = shortHoursLink()

      const smsBody = `Hi ${firstName}! 👋\n\nJust checking you still want us to sort your ${device}. Your repair request is still open with us.\n\nIf you still want it done, just bring it in during opening hours, or reply if you need anything before coming in.\n\nHours: ${hoursUrl}\nTrack it: ${trackingUrl}\n\nNFD Repairs`
      const subject = `Still need your ${device} repair?`
      const emailText = `Hi ${firstName},\n\nJust checking you still want us to sort your ${device}. Your repair request is still open with us.\n\nIf you still want it done, just bring it in during opening hours, or reply if you need anything before coming in.\n\nOpening hours: ${hoursUrl}\nTrack your repair: ${trackingUrl}\n\nNFD Repairs`
      const emailHtml = `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#222;">
          <h2 style="color:#009B4D;">Still need your repair?</h2>
          <p>Hi ${escapeHtml(firstName)},</p>
          <p>Just checking you still want us to sort your <strong>${escapeHtml(device)}</strong>. Your repair request is still open with us.</p>
          <p>If you still want it done, just bring it in during opening hours, or reply if you need anything before coming in.</p>
          <p><a href="${escapeHtml(hoursUrl)}">Opening hours</a> &nbsp;·&nbsp; <a href="${escapeHtml(trackingUrl)}">Track your repair</a></p>
          <p>NFD Repairs</p>
        </div>`

      let smsOk = false
      let emailOk = false

      if (job.customer_phone) {
        try {
          const result = await sendSms(job.customer_phone, smsBody)
          smsOk = result.ok
          if (smsOk) smsSent++

          await supabase.from('sms_logs').insert({
            job_id: job.id,
            template_key: 'AWAITING_DEVICE_FOLLOWUP',
            recipient_phone: job.customer_phone,
            body_rendered: smsBody,
            status: result.ok ? (result.queued ? 'PENDING' : 'SENT') : 'FAILED',
            sent_at: result.ok && !result.queued ? now.toISOString() : null,
            error_message: result.ok
              ? (result.relayMessageId ? `relay_message_id:${result.relayMessageId}` : null)
              : String(result.body || '').slice(0, 500),
          } as any)
        } catch (error) {
          console.error(`[awaiting-device-followup] SMS failed for ${job.job_ref}:`, error)
        }
      }

      if (job.customer_email) {
        try {
          const result = await sendEmail(job.customer_email, subject, emailHtml, emailText)
          emailOk = result.success === true
          if (emailOk) emailSent++

          await supabase.from('email_logs').insert({
            job_id: job.id,
            template_key: 'AWAITING_DEVICE_FOLLOWUP',
            subject,
            body_html: emailHtml,
            body_text: emailText,
            recipient_email: job.customer_email,
            status: emailOk ? 'SENT' : 'FAILED',
            sent_at: emailOk ? now.toISOString() : null,
            error_message: emailOk ? null : String(result.error || 'Email send failed').slice(0, 500),
          } as any)
        } catch (error) {
          console.error(`[awaiting-device-followup] Email failed for ${job.job_ref}:`, error)
        }
      }

      if (!job.customer_phone && !job.customer_email) noContact++
      if (smsOk || emailOk) contacted++

      // Mark the follow-up as attempted regardless of transport result so a
      // transient provider problem never turns this into repeated pestering.
      await supabase
        .from('jobs')
        .update({ awaiting_device_followup_at: now.toISOString() })
        .eq('id', job.id)

      await supabase.from('job_events').insert({
        job_id: job.id,
        type: 'SYSTEM',
        message: 'One-off awaiting-device follow-up attempted',
        metadata: {
          sms_ok: smsOk,
          email_ok: emailOk,
          had_phone: Boolean(job.customer_phone),
          had_email: Boolean(job.customer_email),
        },
      } as any)
    }

    return NextResponse.json({
      success: true,
      eligible: eligible.length,
      contacted,
      sms_sent: smsSent,
      email_sent: emailSent,
      no_contact: noContact,
    })
  } catch (error) {
    console.error('[awaiting-device-followup] Unexpected error:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
