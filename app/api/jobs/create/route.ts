import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getFirstName, renderSmsTemplate } from '@/lib/sms-template'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    
    const {
      customer_name,
      customer_phone,
      device_summary,
      repair_summary,
      price_total,
      parts_required,
      deposit_amount,
    } = body

    if (!customer_name || !customer_phone || !device_summary || !repair_summary || !price_total) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      )
    }

    // Always use £20 deposit for parts
    const deposit_required = parts_required || false
    const final_deposit_amount = parts_required ? 20.00 : null
    const initial_status = parts_required ? 'AWAITING_DEPOSIT' : 'READY_TO_BOOK_IN'

    const { data: job, error: jobError } = await supabase
      .from('jobs')
      .insert({
        status: initial_status,
        status_changed_at: new Date().toISOString(),
        device_summary,
        repair_summary,
        price_total: parseFloat(price_total),
        parts_required: parts_required || false,
        deposit_required,
        deposit_amount: final_deposit_amount,
        deposit_received: false,
        customer_name,
        customer_phone,
      })
      .select()
      .single() as any

    if (jobError) {
      console.error('Failed to create job:', jobError)
      return NextResponse.json(
        { error: 'Failed to create job' },
        { status: 500 }
      )
    }

    await supabase.from('job_events').insert({
      job_id: job.id,
      type: 'SYSTEM',
      message: 'Job created via API',
    } as any)

    await supabase.from('notifications').insert({
      type: 'NEW_JOB',
      title: 'New repair job created',
      body: device_summary,
      job_id: job.id,
      is_read: false,
    } as any)

    if (deposit_required) {
      const { data: template } = await supabase
        .from('sms_templates')
        .select('*')
        .eq('key', 'DEPOSIT_REQUIRED')
        .eq('is_active', true)
        .single()

      if (template) {
        const trackingUrl = `${process.env.NEXT_PUBLIC_APP_URL}/t/${job.tracking_token}`
        const depositUrl = process.env.NEXT_PUBLIC_DEPOSIT_URL || 'https://pay.example.com'

        const smsBody = renderSmsTemplate(template.body, {
          first_name: getFirstName(customer_name),
          customer_name: customer_name,
          device_model: device_summary,
          device_make: 'Unknown',
          price_total: price_total.toString(),
          deposit_amount: final_deposit_amount.toString(),
          tracking_link: trackingUrl,
          deposit_link: depositUrl,
          job_ref: job.job_ref,
        })

        await supabase.from('sms_logs').insert({
          job_id: job.id,
          template_key: 'DEPOSIT_REQUIRED',
          body_rendered: smsBody,
          status: 'PENDING',
        } as any)
      }
    }

    return NextResponse.json({
      success: true,
      job_ref: job.job_ref,
      tracking_token: job.tracking_token,
      tracking_url: `${process.env.NEXT_PUBLIC_APP_URL}/t/${job.tracking_token}`,
    })
  } catch (error) {
    console.error('Error in create job:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
