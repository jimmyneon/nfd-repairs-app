import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient, sendSms, isSmsConfigured } from '@/lib/resilience'
import { sendEmail } from '@/lib/email'
import { requireStaffUser } from '@/lib/api-auth'

export async function POST(
  request: NextRequest,
  { params }: { params: { jobId: string } }
) {
  const { response: authResponse } = await requireStaffUser(request)
  if (authResponse) return authResponse

  const supabase = createServiceClient()

  try {
    const { jobId } = params

    // Get the job
    const { data: job, error: jobError } = await supabase
      .from('jobs')
      .select('*')
      .eq('id', jobId)
      .single()

    if (jobError || !job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 })
    }

    // Create synthetic event for parts notification
    const { error: eventError } = await supabase
      .from('job_events')
      .insert({
        job_id: jobId,
        event_type: 'PARTS_NOTIFICATION_SENT',
        event_data: {
          requires_parts_order: job.requires_parts_order,
        },
        created_at: new Date().toISOString(),
      })

    if (eventError) {
      console.error('Failed to create parts notification event:', eventError)
    }

    const message = `Update on your repair (${job.job_ref}): Parts have been ordered for your ${job.device_make} ${job.device_model}. We'll notify you when they arrive.`
    const hasPhone = !!String(job.customer_phone || '').trim()
    const hasEmail = !!String(job.customer_email || '').trim()
    let delivered = false

    // Prefer the normal SMS channel when a phone number exists.
    if (hasPhone && isSmsConfigured()) {
      try {
        const smsResponse = await sendSms(job.customer_phone, message)
        delivered = smsResponse.ok
        await supabase.from('job_events').insert({
          job_id: jobId,
          type: 'SYSTEM',
          message: `Parts notification SMS ${smsResponse.ok ? 'sent' : 'failed'}`,
        })
      } catch (smsError) {
        console.error('Failed to send parts SMS:', smsError)
      }
    }

    // Email fallback for customers who chose email only.
    if (!hasPhone && hasEmail) {
      try {
        const emailResult = await sendEmail(
          job.customer_email,
          `Parts update - ${job.job_ref}`,
          `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;"><p>${message}</p></div>`,
          message
        )
        delivered = emailResult.success

        await supabase.from('email_logs').insert({
          job_id: jobId,
          template_key: 'PARTS_ORDERED',
          recipient_email: job.customer_email,
          subject: `Parts update - ${job.job_ref}`,
          body_text: message,
          body_html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;"><p>${message}</p></div>`,
          status: emailResult.success ? 'SENT' : 'FAILED',
          sent_at: emailResult.success ? new Date().toISOString() : null,
        })

        await supabase.from('job_events').insert({
          job_id: jobId,
          type: 'SYSTEM',
          message: `Parts notification email ${emailResult.success ? 'sent' : 'failed'}`,
        })
      } catch (emailError) {
        console.error('Failed to send parts email:', emailError)
      }
    }

    return NextResponse.json({
      success: delivered,
      channel: hasPhone ? 'sms' : hasEmail ? 'email' : 'none',
    })
  } catch (error) {
    console.error('Error sending parts notification:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
