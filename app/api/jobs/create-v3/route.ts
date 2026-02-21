import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Updated API endpoint to accept quote_requests format from AI responder
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    
    // Accept both old format and new quote_requests format
    const {
      // Quote_requests format (from AI responder)
      name,
      phone,
      email,
      device_make,
      device_model,
      issue,
      description,
      additional_issues,
      type,
      source,
      page,
      quoted_price,
      requires_parts_order,
      conversation_id,
      customer_id,
      quote_request_id,
      
      // Old format (for backwards compatibility)
      customer_name,
      customer_phone,
      device_summary,
      repair_summary,
      price_total,
      parts_required,
      deposit_amount,
    } = body

    // Map quote_requests fields to jobs fields
    const jobData = {
      // Customer details
      customer_name: name || customer_name,
      customer_phone: phone || customer_phone,
      customer_email: email || null,
      
      // Device details
      device_make: device_make || 'Unknown',
      device_model: device_model || device_summary || 'Unknown',
      issue: issue || repair_summary || 'Repair needed',
      description: description || null,
      additional_issues: additional_issues || [],
      
      // Type & source
      type: type || 'repair',
      source: source || 'api',
      page: page || null,
      
      // Pricing
      quoted_price: quoted_price || price_total || 0,
      price_total: price_total || quoted_price || 0,
      quoted_at: quoted_price ? new Date().toISOString() : null,
      
      // Parts & deposit (always £20 for parts)
      requires_parts_order: requires_parts_order || parts_required || false,
      parts_required: parts_required || requires_parts_order || false,
      deposit_required: requires_parts_order || parts_required || false,
      deposit_amount: (requires_parts_order || parts_required) ? 20.00 : null,
      deposit_received: false,
      
      // Relationships
      conversation_id: conversation_id || null,
      customer_id: customer_id || null,
      quote_request_id: quote_request_id || null,
      
      // Status
      status: (requires_parts_order || parts_required)
        ? 'AWAITING_DEPOSIT' 
        : 'READY_TO_BOOK_IN',
    }

    // Validate required fields
    if (!jobData.customer_name || !jobData.customer_phone || !jobData.price_total) {
      return NextResponse.json(
        { error: 'Missing required fields: name/customer_name, phone/customer_phone, and price_total are required' },
        { status: 400 }
      )
    }

    // Create Supabase client with service role for server-side operations
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // Insert job
    const { data: job, error: jobError } = await supabase
      .from('jobs')
      .insert(jobData)
      .select()
      .single() as any

    if (jobError) {
      console.error('Failed to create job:', jobError)
      return NextResponse.json(
        { error: 'Failed to create job', details: jobError.message },
        { status: 500 }
      )
    }

    // Log job creation event
    await supabase.from('job_events').insert({
      job_id: job.id,
      type: 'SYSTEM',
      message: `Job created via API from ${jobData.source}`,
    } as any)

    // Create staff notification
    await supabase.from('notifications').insert({
      type: 'NEW_JOB',
      title: 'New repair job created',
      body: `${jobData.device_make} ${jobData.device_model} - ${jobData.issue}`,
      job_id: job.id,
      is_read: false,
    } as any)

    // Queue deposit SMS if required
    console.log('SMS Check - deposit_required:', jobData.deposit_required)
    console.log('SMS Check - requires_parts_order:', requires_parts_order)
    console.log('SMS Check - parts_required:', parts_required)
    
    if (jobData.deposit_required) {
      console.log('Querying for DEPOSIT_REQUIRED template...')
      const { data: template, error: templateError } = await supabase
        .from('sms_templates')
        .select('*')
        .eq('key', 'DEPOSIT_REQUIRED')
        .eq('is_active', true)
        .single()

      console.log('Template found:', !!template, 'Error:', templateError)

      if (template) {
        const trackingUrl = `${process.env.NEXT_PUBLIC_APP_URL}/t/${job.tracking_token}`
        const depositUrl = process.env.NEXT_PUBLIC_DEPOSIT_URL || 'https://pay.sumup.com/b2c/Q9OZOAJT'
        
        const smsBody = template.body
          .replace('{customer_name}', jobData.customer_name)
          .replace('{device_make}', jobData.device_make)
          .replace('{device_model}', jobData.device_model)
          .replace('{price_total}', jobData.price_total.toString())
          .replace('{deposit_amount}', jobData.deposit_amount?.toString() || '0')
          .replace('{tracking_link}', trackingUrl)
          .replace('{deposit_link}', depositUrl)
          .replace('{job_ref}', job.job_ref)

        const { data: smsLog } = await supabase.from('sms_logs').insert({
          job_id: job.id,
          template_key: 'DEPOSIT_REQUIRED',
          body_rendered: smsBody,
          status: 'PENDING',
        } as any)
        .select()
        .single()

        // Automatically send the SMS
        if (smsLog) {
          try {
            await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/sms/send`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
            })
          } catch (error) {
            console.error('Failed to trigger SMS send:', error)
          }
        }
      }
    }

    // Return success response
    return NextResponse.json({
      success: true,
      job_id: job.id,
      job_ref: job.job_ref,
      tracking_token: job.tracking_token,
      tracking_url: `${process.env.NEXT_PUBLIC_APP_URL}/t/${job.tracking_token}`,
      status: job.status,
    })
  } catch (error) {
    console.error('Error in create job:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
