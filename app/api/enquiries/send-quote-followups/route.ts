import { NextRequest, NextResponse } from 'next/server'
import { requireCronSecret } from '@/lib/api-auth'
import { createServiceClient, isWithinUKSendingHours, sendSms } from '@/lib/resilience'
import { getFirstName, safeDeviceLabel } from '@/lib/sms-template'
import { shortQuoteApprovalLink } from '@/lib/utils'
import { generateQuoteActionToken, isQuoteActionTokenValid, quoteActionTokenExpiry } from '@/lib/job-utils'
import { isQuoteFollowupDue } from '@/lib/quote-followup'
import { parseOpeningHours } from '@/lib/awaiting-device-followup'

export const maxDuration = 300

export async function GET(request: NextRequest) {
  const cronResponse = requireCronSecret(request)
  if (cronResponse) return cronResponse

  if (!isWithinUKSendingHours()) {
    return NextResponse.json({
      success: true,
      skipped: true,
      contacted: 0,
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

    const { data: enquiries, error } = await supabase
      .from('enquiries')
      .select('id,enquiry_ref,enquiry_type,status,customer_name,customer_phone,customer_email,device_make,device_model,quoted_price,display_price,quote_sent_method,proceed_with_repair,converted_to_job,quote_followup_at,quote_followup_suppressed,created_at,quote_action_token,quote_action_token_expires_at,quote_action_token_revoked_at')
      .eq('enquiry_type', 'repair_quote')
      .eq('status', 'pending')
      .eq('quote_followup_suppressed', false)
      .is('quote_followup_at', null)
      .not('quoted_price', 'is', null)
      .not('customer_phone', 'is', null)
      .gt('created_at', oldestAllowed)
      .order('created_at', { ascending: true })
      .limit(50)

    if (error) {
      console.error('[quote-followup] Query failed:', error)
      return NextResponse.json({ error: 'Failed to query quote follow-ups' }, { status: 500 })
    }

    const now = new Date()
    const eligible = (enquiries || []).filter(enquiry => isQuoteFollowupDue(enquiry, openingHours, now))

    let contacted = 0
    let sent = 0
    let failed = 0
    const results: Array<Record<string, unknown>> = []

    for (let i = 0; i < eligible.length; i++) {
      const enquiry = eligible[i]
      const firstName = getFirstName(enquiry.customer_name)
      const device = safeDeviceLabel(enquiry.device_make, enquiry.device_model)
      const price = enquiry.display_price || `£${Number(enquiry.quoted_price).toFixed(2).replace(/\.00$/, '')}`

      let token = enquiry.quote_action_token
      if (!isQuoteActionTokenValid(token, enquiry.quote_action_token_expires_at, enquiry.quote_action_token_revoked_at)) {
        token = generateQuoteActionToken()
        await supabase
          .from('enquiries')
          .update({
            quote_action_token: token,
            quote_action_token_expires_at: quoteActionTokenExpiry(),
            quote_action_token_revoked_at: null,
          } as any)
          .eq('id', enquiry.id)
      }

      const quoteLink = shortQuoteApprovalLink(enquiry.enquiry_ref, token)
      const smsBody = `Hi ${firstName}! 👋

Just checking whether you still need help with your ${device}. Your ${price} repair quote is still open.

If you'd like to go ahead, use your quote here:
${quoteLink}

Or just reply if you have any questions.

NFD Repairs`

      let ok = false
      let queued = false
      let relayMessageId: string | null = null
      let errorMessage: string | null = null

      try {
        const result = await sendSms(enquiry.customer_phone, smsBody)
        ok = result.ok
        queued = Boolean(result.queued)
        relayMessageId = result.relayMessageId || null
        errorMessage = result.ok ? null : String(result.body || '').slice(0, 500)
        if (ok) sent++
        else failed++
      } catch (sendError) {
        failed++
        errorMessage = sendError instanceof Error ? sendError.message : 'SMS send failed'
        console.error(`[quote-followup] SMS failed for ${enquiry.enquiry_ref}:`, sendError)
      }

      await supabase.from('sms_logs').insert({
        template_key: 'QUOTE_FOLLOWUP',
        recipient_phone: enquiry.customer_phone,
        body_rendered: smsBody,
        status: ok ? (queued ? 'PENDING' : 'SENT') : 'FAILED',
        sent_at: ok && !queued ? now.toISOString() : null,
        error_message: ok
          ? (relayMessageId ? `relay_message_id:${relayMessageId}` : null)
          : errorMessage,
      } as any)

      // One attempt only. Transport status remains visible in sms_logs.
      await supabase
        .from('enquiries')
        .update({ quote_followup_at: now.toISOString() } as any)
        .eq('id', enquiry.id)

      contacted++
      results.push({
        enquiry_ref: enquiry.enquiry_ref,
        status: ok ? (queued ? 'QUEUED' : 'SENT') : 'FAILED',
      })

      if (i < eligible.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 3000))
      }
    }

    return NextResponse.json({
      success: true,
      eligible: eligible.length,
      contacted,
      sent,
      failed,
      results,
    })
  } catch (error) {
    console.error('[quote-followup] Unexpected error:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
