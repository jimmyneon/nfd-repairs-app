import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(request: NextRequest) {
  try {
    const { jobId } = await request.json()

    if (!jobId) {
      return NextResponse.json({ error: 'Job ID required' }, { status: 400 })
    }

    // Get job details
    const { data: job, error: jobError } = await supabase
      .from('jobs')
      .select('*')
      .eq('id', jobId)
      .single()

    if (jobError || !job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 })
    }

    // Get tracking link SMS template
    const { data: template, error: templateError } = await supabase
      .from('sms_templates')
      .select('*')
      .eq('key', 'TRACKING_LINK_ONLY')
      .eq('is_active', true)
      .single()

    if (templateError || !template) {
      console.error('Template not found:', templateError)
      return NextResponse.json({ error: 'SMS template not found' }, { status: 404 })
    }

    // Build tracking URL
    const appUrl = 'https://nfd-repairs-app.vercel.app'
    const trackingUrl = `${appUrl}/t/${job.tracking_token}`

    // Replace variables in template
    const smsBody = template.body
      .replace('{customer_name}', job.customer_name)
      .replace('{tracking_link}', trackingUrl)
      .replace('{device_make}', job.device_make)
      .replace('{device_model}', job.device_model)
      .replace('{job_ref}', job.job_ref)

    // Insert SMS log
    const { data: smsLog } = await supabase.from('sms_logs').insert({
      job_id: job.id,
      phone_number: job.customer_phone,
      message: smsBody,
      status: 'pending',
      template_key: 'TRACKING_LINK_ONLY',
    }).select().single()

    if (!smsLog) {
      return NextResponse.json({ error: 'Failed to create SMS log' }, { status: 500 })
    }

    // Send via MacroDroid webhook
    const webhookUrl = process.env.MACRODROID_WEBHOOK_URL
    if (webhookUrl) {
      try {
        const response = await fetch(webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            phone: job.customer_phone,
            message: smsBody,
            sms_log_id: smsLog.id,
          }),
        })

        if (response.ok) {
          await supabase
            .from('sms_logs')
            .update({ status: 'sent', sent_at: new Date().toISOString() })
            .eq('id', smsLog.id)
        }
      } catch (webhookError) {
        console.error('Webhook error:', webhookError)
      }
    }

    return NextResponse.json({ success: true, smsLogId: smsLog.id })
  } catch (error) {
    console.error('Send tracking SMS error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
