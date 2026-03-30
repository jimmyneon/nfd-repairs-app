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
      deposit_required,
      deposit_amount,
      
      // Onboarding fields (from manual job creation)
      device_password,
      password_not_applicable,
      customer_signature,
      terms_accepted,
      onboarding_completed,
      
      // Device possession tracking
      device_in_shop,
      
      // Import options (from JSON import)
      initial_status,
      skip_sms,
    } = body

    // Map quote_requests fields to jobs fields
    const jobData = {
      // Customer details
      customer_name: name || customer_name,
      customer_phone: phone || customer_phone,
      customer_email: email || body.customer_email || null,
      
      // Device details
      device_type: body.device_type || null,
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
      
      // Parts & deposit (always £20 for parts when deposit required)
      // Auto-infer parts_required from initial_status if status implies parts are needed
      // But deposit_required is ONLY set if explicitly requested or status is AWAITING_DEPOSIT
      requires_parts_order: requires_parts_order || parts_required || 
                           (initial_status && ['PARTS_ORDERED', 'PARTS_ARRIVED'].includes(initial_status)) || 
                           false,
      parts_required: parts_required || requires_parts_order || 
                     (initial_status && ['PARTS_ORDERED', 'PARTS_ARRIVED'].includes(initial_status)) || 
                     false,
      deposit_required: deposit_required || 
                       (initial_status && initial_status === 'AWAITING_DEPOSIT') || 
                       false,
      deposit_amount: (deposit_required || (initial_status && initial_status === 'AWAITING_DEPOSIT')) 
                      ? 20.00 : null,
      deposit_received: false,
      
      // Relationships
      conversation_id: conversation_id || null,
      customer_id: customer_id || null,
      quote_request_id: quote_request_id || null,
      
      // Device possession - explicit for manual jobs, inferred for API jobs
      device_in_shop: source === 'staff_manual' 
        ? (device_in_shop || false)  // Use explicit value from manual form
        : false,  // API jobs - customer has device
      
      // Status - use initial_status if provided (from import), otherwise calculate
      status: initial_status || (source === 'staff_manual' 
        ? (device_in_shop ? 'RECEIVED' : 'QUOTE_APPROVED')  // Manual: RECEIVED if in shop, QUOTE_APPROVED if not
        : 'QUOTE_APPROVED'),  // API: always QUOTE_APPROVED (customer has device)
      
      // Onboarding fields (if provided from manual creation)
      device_password: device_password || null,
      password_not_applicable: password_not_applicable || false,
      customer_signature: customer_signature || null,
      terms_accepted: terms_accepted || false,
      terms_accepted_at: terms_accepted ? new Date().toISOString() : null,
      onboarding_completed: onboarding_completed || false,
      onboarding_completed_at: onboarding_completed ? new Date().toISOString() : null,
    }

    // Validate required fields
    if (!jobData.customer_name || !jobData.customer_phone || jobData.price_total === undefined || jobData.price_total === null) {
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

    // Duplicate prevention: Check for existing job with same customer/phone/device within last 5 minutes
    // This prevents multiple jobs being created when errors occur during submission
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString()
    const { data: existingJobs } = await supabase
      .from('jobs')
      .select('*')
      .eq('customer_phone', jobData.customer_phone)
      .eq('device_make', jobData.device_make)
      .eq('device_model', jobData.device_model)
      .eq('issue', jobData.issue)
      .gte('created_at', fiveMinutesAgo)
      .order('created_at', { ascending: false })
      .limit(1)

    // If duplicate found, return existing job instead of creating new one
    if (existingJobs && existingJobs.length > 0) {
      const existingJob = existingJobs[0]
      console.log('🔄 Duplicate job detected, returning existing job:', existingJob.job_ref)
      
      // Log duplicate prevention event
      await supabase.from('job_events').insert({
        job_id: existingJob.id,
        type: 'SYSTEM',
        message: 'Duplicate job creation prevented - returned existing job',
      } as any)

      return NextResponse.json({
        success: true,
        job_id: existingJob.id,
        job_ref: existingJob.job_ref,
        tracking_token: existingJob.tracking_token,
        tracking_url: `${process.env.NEXT_PUBLIC_APP_URL}/t/${existingJob.tracking_token}`,
        status: existingJob.status,
        duplicate_prevented: true,
      })
    }

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

    // If initial_status was provided (imported/manual job with skipped statuses),
    // create synthetic STATUS_CHANGE events for the logical steps that must have occurred
    if (initial_status && initial_status !== 'QUOTE_APPROVED' && initial_status !== 'RECEIVED') {
      const syntheticEvents: any[] = []
      const now = new Date()
      
      // All jobs must go through RECEIVED if they're past that point
      if (source === 'staff_manual' || ['AWAITING_DEPOSIT', 'PARTS_ORDERED', 'PARTS_ARRIVED', 'IN_REPAIR', 'DELAYED', 'READY_TO_COLLECT', 'COLLECTED', 'COMPLETED'].includes(initial_status)) {
        syntheticEvents.push({
          job_id: job.id,
          type: 'STATUS_CHANGE',
          message: 'Status changed to Received',
          created_at: new Date(now.getTime() - 60000 * syntheticEvents.length).toISOString(), // Stagger by 1 minute each
        })
      }
      
      // If deposit required and status is past AWAITING_DEPOSIT
      if (jobData.deposit_required && ['AWAITING_DEPOSIT', 'PARTS_ORDERED', 'PARTS_ARRIVED', 'IN_REPAIR', 'DELAYED', 'READY_TO_COLLECT', 'COLLECTED', 'COMPLETED'].includes(initial_status)) {
        syntheticEvents.push({
          job_id: job.id,
          type: 'STATUS_CHANGE',
          message: 'Status changed to Awaiting Deposit',
          created_at: new Date(now.getTime() - 60000 * syntheticEvents.length).toISOString(),
        })
      }
      
      // If status is PARTS_ORDERED or beyond
      if (jobData.parts_required && ['PARTS_ORDERED', 'PARTS_ARRIVED', 'IN_REPAIR', 'DELAYED', 'READY_TO_COLLECT', 'COLLECTED', 'COMPLETED'].includes(initial_status)) {
        syntheticEvents.push({
          job_id: job.id,
          type: 'STATUS_CHANGE',
          message: 'Status changed to Parts Ordered',
          created_at: new Date(now.getTime() - 60000 * syntheticEvents.length).toISOString(),
        })
      }
      
      // If status is PARTS_ARRIVED or beyond
      if (jobData.parts_required && ['PARTS_ARRIVED', 'IN_REPAIR', 'DELAYED', 'READY_TO_COLLECT', 'COLLECTED', 'COMPLETED'].includes(initial_status)) {
        syntheticEvents.push({
          job_id: job.id,
          type: 'STATUS_CHANGE',
          message: 'Status changed to Parts Arrived',
          created_at: new Date(now.getTime() - 60000 * syntheticEvents.length).toISOString(),
        })
      }
      
      // If status is IN_REPAIR or DELAYED or beyond
      if (['IN_REPAIR', 'DELAYED', 'READY_TO_COLLECT', 'COLLECTED', 'COMPLETED'].includes(initial_status)) {
        syntheticEvents.push({
          job_id: job.id,
          type: 'STATUS_CHANGE',
          message: 'Status changed to In Repair',
          created_at: new Date(now.getTime() - 60000 * syntheticEvents.length).toISOString(),
        })
      }
      
      // Finally, add the actual initial_status event (unless it's DELAYED, which is handled separately)
      if (initial_status !== 'DELAYED') {
        const statusLabels: Record<string, string> = {
          'QUOTE_APPROVED': 'Quote Approved',
          'RECEIVED': 'Received',
          'AWAITING_DEPOSIT': 'Awaiting Deposit',
          'PARTS_ORDERED': 'Parts Ordered',
          'PARTS_ARRIVED': 'Parts Arrived',
          'IN_REPAIR': 'In Repair',
          'READY_TO_COLLECT': 'Ready to Collect',
          'COLLECTED': 'Collected',
          'COMPLETED': 'Completed',
        }
        
        syntheticEvents.push({
          job_id: job.id,
          type: 'STATUS_CHANGE',
          message: `Status changed to ${statusLabels[initial_status] || initial_status}`,
          created_at: now.toISOString(),
        })
      }
      
      // Insert all synthetic events
      if (syntheticEvents.length > 0) {
        await supabase.from('job_events').insert(syntheticEvents)
        console.log(`✅ Created ${syntheticEvents.length} synthetic status events for imported job`)
      }
    }

    // Create staff notification
    await supabase.from('notifications').insert({
      type: 'NEW_JOB',
      title: 'New repair job created',
      body: `${jobData.device_make} ${jobData.device_model} - ${jobData.issue}`,
      job_id: job.id,
      is_read: false,
    } as any)

    // Check if onboarding is needed (missing email, password info, or terms)
    // Manual jobs with onboarding_completed=true have already done onboarding in-store
    const needsOnboarding = !job.onboarding_completed && (
                           !jobData.customer_email || 
                           (!job.device_password && !job.password_not_applicable) ||
                           !job.terms_accepted
                           )

    // Queue SMS - onboarding link if needed, otherwise regular status SMS
    let templateKey: string
    if (needsOnboarding) {
      // Use deposit-specific onboarding template if deposit required
      templateKey = jobData.deposit_required ? 'ONBOARDING_WITH_DEPOSIT' : 'ONBOARDING_REQUIRED'
    } else {
      // Normal flow based on source and parts requirement
      if (jobData.deposit_required) {
        // Check if manual job with device NOT in shop (customer took device home)
        if (source === 'staff_manual' && !jobData.device_in_shop) {
          // Manual booking, parts needed, device with customer - use special template
          templateKey = 'MANUAL_BOOKING_PARTS_NEEDED'
        } else {
          // Parts required - use deposit template (API jobs or manual with device in shop)
          templateKey = 'DEPOSIT_REQUIRED'
        }
      } else if (source === 'staff_manual') {
        // Manual job (device already in shop) - use RECEIVED
        templateKey = 'RECEIVED'
      } else {
        // API/online job (customer has device) - use QUOTE_APPROVED
        templateKey = 'QUOTE_APPROVED'
      }
    }
    
    console.log('🔍 SMS DEBUG - Job:', job.id, job.job_ref)
    console.log('🔍 Needs onboarding:', needsOnboarding)
    console.log('🔍 Deposit required:', jobData.deposit_required)
    console.log('🔍 Source:', source)
    console.log('🔍 Template key:', templateKey)
    
    const { data: template, error: templateError } = await supabase
      .from('sms_templates')
      .select('*')
      .eq('key', templateKey)
      .eq('is_active', true)
      .single()

    console.log('🔍 Template found:', !!template)
    if (templateError) {
      console.error('❌ Template error:', templateError)
    }

    if (!template) {
      console.error('❌ NO TEMPLATE FOUND FOR:', templateKey)
      await supabase.from('job_events').insert({
        job_id: job.id,
        type: 'ERROR',
        message: `SMS template '${templateKey}' not found - SMS not queued`,
      } as any)
    } else {
      console.log('✅ Template found:', template.key)
      
      // Skip SMS and Email if requested (e.g., from batch import or old job import)
      if (skip_sms) {
        console.log('⏭️ Skipping initial notifications (skip_sms flag set)')
        await supabase.from('job_events').insert({
          job_id: job.id,
          type: 'SYSTEM',
          message: 'Initial SMS and email notifications skipped (imported job)',
        } as any)
        
        return NextResponse.json({ 
          success: true, 
          job_id: job.id,
          job_ref: job.job_ref,
          sms_skipped: true,
          email_skipped: true,
        })
      }
      
      // Use hardcoded URL since NEXT_PUBLIC_ vars not available in API routes
      const appUrl = 'https://nfd-repairs-app.vercel.app'
      const trackingUrl = `${appUrl}/t/${job.tracking_token}`
      const depositUrl = process.env.NEXT_PUBLIC_DEPOSIT_URL || 'https://pay.sumup.com/b2c/Q9OZOAJT'
      const onboardingUrl = `${appUrl}/onboard/${job.onboarding_token}`
      
      let smsBody = template.body
        .replace('{customer_name}', jobData.customer_name)
        .replace('{device_make}', jobData.device_make)
        .replace('{device_model}', jobData.device_model)
        .replace('{price_total}', jobData.price_total.toString())
        .replace('{tracking_link}', trackingUrl)
        .replace('{job_ref}', job.job_ref)
        .replace('{onboarding_link}', onboardingUrl)

      // Add deposit-specific replacements if needed
      if (jobData.deposit_required) {
        smsBody = smsBody
          .replace('{deposit_amount}', jobData.deposit_amount?.toString() || '20')
          .replace('{deposit_link}', depositUrl)
      }

      // DYNAMIC MESSAGING: For RECEIVED status, add email notification info if customer has email
      if (templateKey === 'RECEIVED' && jobData.customer_email) {
        smsBody += '\n\nYou\'ll receive updates by text and email throughout the repair. Please check your junk folder if you don\'t see our emails.'
      } else if (templateKey === 'RECEIVED' && !jobData.customer_email) {
        smsBody += '\n\nWe\'ll text you when it\'s ready for collection.'
      }

      console.log('📝 Creating SMS log...')
      const { data: smsLog, error: smsLogError } = await supabase.from('sms_logs').insert({
        job_id: job.id,
        template_key: templateKey,
        body_rendered: smsBody,
        status: 'PENDING',
      } as any)
      .select()
      .single()

      if (smsLogError) {
        console.error('❌ SMS log insert failed:', smsLogError)
        await supabase.from('job_events').insert({
          job_id: job.id,
          type: 'ERROR',
          message: `Failed to create SMS log: ${smsLogError.message}`,
        } as any)
      } else {
        console.log('✅ SMS log created:', smsLog?.id)
      }

      // Automatically send the SMS
      if (smsLog) {
        console.log('📤 Triggering SMS send...')
        try {
          const sendResponse = await fetch(`${appUrl}/api/sms/send`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
          })
          console.log('📤 SMS send response:', sendResponse.status, sendResponse.ok)
        } catch (error) {
          console.error('❌ Failed to trigger SMS send:', error)
          await supabase.from('job_events').insert({
            job_id: job.id,
            type: 'ERROR',
            message: `Failed to trigger SMS send: ${error instanceof Error ? error.message : 'Unknown error'}`,
          } as any)
        }
      } else {
        console.error('❌ No SMS log created, cannot send')
        await supabase.from('job_events').insert({
          job_id: job.id,
          type: 'ERROR',
          message: 'No SMS log created, cannot send',
        } as any)
      }
    }

    // Send email notification if customer has email (already handled by skip_sms check above)
    // Note: skip_sms flag now skips both SMS and email for initial notification
    if (jobData.customer_email && !skip_sms) {
      try {
        const appUrl = 'https://nfd-repairs-app.vercel.app'
        await fetch(`${appUrl}/api/email/send`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jobId: job.id,
            type: 'JOB_CREATED',
          }),
        })
      } catch (error) {
        console.error('Failed to send email:', error)
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
