import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient, sendSms, isSmsConfigured } from '@/lib/resilience'
import { sendEmail } from '@/lib/email'
import { shortQuoteApprovalLink } from '@/lib/utils'
import { requireStaffUser } from '@/lib/api-auth'
import { generateQuoteActionToken, quoteActionTokenExpiry, isQuoteActionTokenValid } from '@/lib/job-utils'

export async function POST(
  request: NextRequest,
  { params }: { params: { jobId: string } }
) {
  const { response: authResponse } = await requireStaffUser(request)
  if (authResponse) return authResponse

  const supabase = createServiceClient()

  try {
    const { jobId } = params
    const { quoted_price, requires_parts_order } = await request.json()

    if (!quoted_price || quoted_price <= 0) {
      return NextResponse.json({ error: 'Invalid quote price' }, { status: 400 })
    }

    // Get the job
    const { data: job, error: jobError } = await supabase
      .from('jobs')
      .select('*')
      .eq('id', jobId)
      .single()

    if (jobError || !job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 })
    }

    // Ensure a valid quote-action token exists on the job. Issue a fresh one
    // if none exists or the existing one has expired/been revoked. The token
    // is the authorisation key for the public quote link — the job id alone
    // is not enough.
    let quoteToken = job.quote_action_token
    if (!isQuoteActionTokenValid(quoteToken, job.quote_action_token_expires_at, job.quote_action_token_revoked_at)) {
      quoteToken = generateQuoteActionToken()
      await supabase
        .from('jobs')
        .update({
          quote_action_token: quoteToken,
          quote_action_token_expires_at: quoteActionTokenExpiry(),
          quote_action_token_revoked_at: null,
        })
        .eq('id', jobId)
    }

    // Update job with quote price and parts requirement
    const updateData: any = {
      quoted_price,
      requires_parts_order: requires_parts_order || false,
      quoted_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }

    // Set deposit amount if parts are required
    if (requires_parts_order) {
      updateData.deposit_amount = 20.00
    }

    const { error: updateError } = await supabase
      .from('jobs')
      .update(updateData)
      .eq('id', jobId)

    if (updateError) {
      return NextResponse.json({ error: 'Failed to update job' }, { status: 500 })
    }

    // Create synthetic event for quote sent
    const { error: eventError } = await supabase
      .from('job_events')
      .insert({
        job_id: jobId,
        event_type: 'QUOTE_SENT',
        event_data: {
          quoted_price,
          requires_parts_order: requires_parts_order || false,
        },
        created_at: new Date().toISOString(),
      })

    if (eventError) {
      console.error('Failed to create quote sent event:', eventError)
    }

    // Send SMS with quote approval link
    const quoteApprovalUrl = shortQuoteApprovalLink(jobId, quoteToken)
    
    const smsMessage = `Your repair quote for ${job.device_make} ${job.device_model} is ready: £${quoted_price.toFixed(2)}. ${requires_parts_order ? '(Parts required - £20 deposit)' : ''} Approve: ${quoteApprovalUrl}`

    const hasPhone = !!String(job.customer_phone || '').trim()
    const hasEmail = !!String(job.customer_email || '').trim()
    const now = new Date().toISOString()
    let delivered = false
    let channel = 'none'

    if (hasPhone && isSmsConfigured()) {
      try {
        const smsResult = await sendSms(job.customer_phone, smsMessage)
        delivered = smsResult.ok
        channel = 'sms'

        await supabase.from('sms_logs').insert({
          job_id: jobId,
          template_key: 'QUOTE_SENT',
          body_rendered: smsMessage,
          status: smsResult.ok ? (smsResult.queued ? 'PENDING' : 'SENT') : 'FAILED',
          sent_at: smsResult.ok && !smsResult.queued ? now : null,
          error_message: smsResult.relayMessageId ? `relay_message_id:${smsResult.relayMessageId}` : null,
        })
      } catch (smsError) {
        console.error('Failed to send quote SMS:', smsError)
      }
    } else if (!hasPhone && hasEmail) {
      try {
        const escapedMessage = smsMessage
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&#039;')
        const subject = `Your repair quote is ready - ${job.job_ref}`
        const html = `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;"><p style="white-space:pre-line;">${escapedMessage}</p></div>`
        const emailResult = await sendEmail(job.customer_email, subject, html, smsMessage)
        delivered = emailResult.success
        channel = 'email'

        await supabase.from('email_logs').insert({
          job_id: jobId,
          template_key: 'QUOTE_SENT',
          recipient_email: job.customer_email,
          subject,
          body_text: smsMessage,
          body_html: html,
          status: emailResult.success ? 'SENT' : 'FAILED',
          sent_at: emailResult.success ? now : null,
        })
      } catch (emailError) {
        console.error('Failed to send quote email:', emailError)
      }
    }

    await supabase.from('job_events').insert({
      job_id: jobId,
      type: 'SYSTEM',
      message: `Quote notification ${delivered ? 'sent' : 'failed'} via ${channel}`,
    })

    return NextResponse.json({
      success: delivered,
      channel,
    })
  } catch (error) {
    console.error('Error sending quote:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
