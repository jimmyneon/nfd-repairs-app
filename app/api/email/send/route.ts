import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendEmail } from '@/lib/email'
import { generateEmbeddedJobEmail } from '@/lib/email-templates-embedded'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { jobId, type } = body

    if (!jobId || !type) {
      return NextResponse.json(
        { error: 'Missing jobId or type' },
        { status: 400 }
      )
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const { data: job, error: jobError } = await supabase
      .from('jobs')
      .select('*')
      .eq('id', jobId)
      .single()

    if (jobError || !job) {
      return NextResponse.json(
        { error: 'Job not found' },
        { status: 404 }
      )
    }

    if (!job.customer_email) {
      return NextResponse.json(
        { success: true, message: 'No email address on file' }
      )
    }

    // Check notification config to see if email should be sent for this status
    if (type === 'STATUS_UPDATE') {
      const { data: config } = await supabase
        .from('notification_config')
        .select('send_email, is_active')
        .eq('status_key', job.status)
        .single()

      if (config && (!config.send_email || !config.is_active)) {
        console.log(`Email disabled for status: ${job.status}`)
        return NextResponse.json({ 
          success: true, 
          message: `Email notifications disabled for ${job.status}` 
        })
      }
    }

    const appUrl = 'https://nfd-repairs-app.vercel.app'
    const trackingUrl = `${appUrl}/t/${job.tracking_token}`
    const depositUrl = process.env.NEXT_PUBLIC_DEPOSIT_URL || 'https://pay.sumup.com/b2c/Q9OZOAJT'

    const statusMessages: Record<string, string> = {
      'AWAITING_DEPOSIT': 'We need a deposit to order the parts for your repair. Please use the payment link below.',
      'PARTS_ORDERED': 'Parts have been ordered and we\'ll notify you when they arrive.',
      'PARTS_ARRIVED': 'Great news! The parts for your repair have arrived. Please drop your device off at New Forest Device Repairs.',
      'READY_TO_BOOK_IN': 'Your device is ready to be booked in for repair. We\'ll contact you to arrange a convenient time.',
      'IN_REPAIR': 'Our technicians are working on your repair. We\'ll update you when it\'s ready.',
      'READY_TO_COLLECT': 'Great news! Your repair is complete and ready to collect. We\'re open Mon-Sat 9am-5pm.',
      'COMPLETED': 'Thank you for choosing New Forest Device Repairs!',
      'CANCELLED': 'Your repair has been cancelled. If you have any questions, please contact us.'
    }

    const emailTemplate = generateEmbeddedJobEmail(
      {
        job,
        trackingUrl,
        depositUrl: job.deposit_required ? depositUrl : undefined,
        statusMessage: type === 'STATUS_UPDATE' ? statusMessages[job.status] : undefined
      },
      type as 'JOB_CREATED' | 'STATUS_UPDATE'
    )

    const result = await sendEmail(
      job.customer_email,
      emailTemplate.subject,
      emailTemplate.html,
      emailTemplate.text
    )

    if (result.success) {
      await supabase.from('job_events').insert({
        job_id: jobId,
        type: 'SYSTEM',
        message: `Email sent: ${emailTemplate.subject}`,
      })

      return NextResponse.json({ success: true })
    } else {
      console.error('Failed to send email:', result.error)
      return NextResponse.json(
        { error: 'Failed to send email', details: result.error },
        { status: 500 }
      )
    }
  } catch (error) {
    console.error('Error in email send:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
