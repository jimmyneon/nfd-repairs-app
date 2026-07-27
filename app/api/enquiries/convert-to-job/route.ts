import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getFirstName, renderSmsTemplate } from '@/lib/sms-template'
import { shortTrackingLink, shortHoursLink, getAppUrl } from '@/lib/utils'

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  })
}

export async function POST(request: NextRequest) {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    const { enquiry_id, stock_status } = await request.json()

    if (!enquiry_id || !stock_status) {
      return NextResponse.json(
        { error: 'enquiry_id and stock_status are required' },
        { status: 400 }
      )
    }

    const validStatuses = ['in_stock', 'parts_deposit_paid']
    if (!validStatuses.includes(stock_status)) {
      return NextResponse.json(
        { error: 'stock_status must be "in_stock" or "parts_deposit_paid"' },
        { status: 400 }
      )
    }

    // Fetch the enquiry
    const { data: enquiry, error: fetchError } = await supabase
      .from('enquiries')
      .select('*')
      .eq('id', enquiry_id)
      .single()

    if (fetchError || !enquiry) {
      return NextResponse.json({ error: 'Enquiry not found' }, { status: 404 })
    }

    // Check if already converted
    if (enquiry.converted_to_job_id) {
      return NextResponse.json({
        success: true,
        already_converted: true,
        job_id: enquiry.converted_to_job_id,
      })
    }

    const now = new Date().toISOString()
    const requiresParts = stock_status === 'parts_deposit_paid'
    const partsRequired = requiresParts
    const depositRequired = requiresParts
    const depositAmount = requiresParts ? 20.00 : null

    // Determine job status
    const jobStatus = requiresParts ? 'PARTS_ORDERED' : 'QUOTE_APPROVED'

    // Generate job ref
    const { data: jobCount } = await supabase
      .from('jobs')
      .select('id', { count: 'exact', head: true })

    const jobRef = `NF-${String((jobCount || 0) + 1).padStart(5, '0')}`
    const trackingToken = crypto.randomUUID()
    const onboardingToken = crypto.randomUUID()

    // Build job data
    const jobData: Record<string, any> = {
      job_ref: jobRef,
      tracking_token: trackingToken,
      onboarding_token: onboardingToken,

      // Customer details
      customer_name: enquiry.customer_name,
      customer_phone: enquiry.customer_phone,
      customer_email: enquiry.customer_email || null,

      // Device details
      device_type: enquiry.device_category || null,
      device_make: enquiry.device_make || 'Unknown',
      device_model: enquiry.device_model || 'Unknown',
      issue: enquiry.repair_type || 'Repair needed',
      description: enquiry.issue_description || null,
      additional_issues: enquiry.additional_repairs || [],

      // Type & source
      type: 'repair',
      source: 'enquiry_conversion',
      page: enquiry.quote_source || null,

      // Pricing
      quoted_price: enquiry.quoted_price || 0,
      price_total: enquiry.quoted_price || 0,
      quoted_at: enquiry.quoted_price ? now : null,

      // Parts & deposit
      requires_parts_order: partsRequired,
      parts_required: partsRequired,
      deposit_required: depositRequired,
      deposit_amount: depositAmount,
      deposit_received: requiresParts, // deposit already paid for parts flow

      // Device possession — customer has device, needs to drop off
      device_in_shop: false,

      // Status
      status: jobStatus,
      status_changed_at: now,

      // Onboarding
      terms_accepted: enquiry.terms_accepted || false,
      terms_accepted_at: enquiry.terms_accepted ? now : null,
      marketing_opt_in: enquiry.marketing_consent || false,
      marketing_opt_in_at: enquiry.marketing_consent ? now : null,

      // Link back to enquiry
      quote_request_id: enquiry.id,
    }

    // For parts ordered, set parts_ordered_at
    if (requiresParts) {
      jobData.parts_ordered_at = now
    }

    // Insert the job
    const { data: job, error: jobError } = await supabase
      .from('jobs')
      .insert(jobData)
      .select()
      .single()

    if (jobError || !job) {
      console.error('Failed to create job from enquiry:', jobError)
      return NextResponse.json(
        { error: 'Failed to create job', details: jobError?.message },
        { status: 500 }
      )
    }

    // Update enquiry as converted
    await supabase
      .from('enquiries')
      .update({
        status: 'converted',
        converted_to_job_id: job.id,
        updated_at: now,
      })
      .eq('id', enquiry_id)

    // Log job creation event
    await supabase.from('job_events').insert({
      job_id: job.id,
      type: 'SYSTEM',
      message: `Job created from enquiry ${enquiry.enquiry_ref} (${requiresParts ? 'Parts needed - deposit paid' : 'In stock'})`,
    })

    // Create staff notification
    await supabase.from('notifications').insert({
      type: 'NEW_JOB',
      title: 'New job from enquiry',
      body: `${enquiry.device_make || ''} ${enquiry.device_model || ''} - ${enquiry.repair_type || ''}`,
      job_id: job.id,
      is_read: false,
    })

    // Send SMS to customer
    const webhookUrl = process.env.MACRODROID_WEBHOOK_URL
    const customerPhone = enquiry.customer_phone

    let smsBody = ''
    if (requiresParts) {
      // Parts needed + deposit paid
      smsBody = `Hi ${getFirstName(enquiry.customer_name)}, thanks for your deposit!\n\nWe've ordered the part for your ${enquiry.device_make || ''} ${enquiry.device_model || ''} — it's usually next-day delivery, but can occasionally take a little longer.\n\nWe'll text you as soon as it arrives. Track your repair: ${shortTrackingLink(trackingToken)}\n\nNew Forest Device Repairs`
    } else {
      // In stock — booked in
      const { data: locationSetting } = await supabase
        .from('admin_settings')
        .select('value')
        .eq('key', 'google_maps_link')
        .single()

      const { data: hoursSetting } = await supabase
        .from('admin_settings')
        .select('value')
        .eq('key', 'opening_hours_link')
        .single()

      const locationLink = locationSetting?.value || 'https://maps.app.goo.gl/oVczouUePXkRbrKb7'
      const hoursLink = hoursSetting?.value || shortHoursLink()

      smsBody = `Hi ${getFirstName(enquiry.customer_name)}, your ${enquiry.device_make || ''} ${enquiry.device_model || ''} repair is booked in!\n\nPop in with your device whenever you're ready — no appointment needed. We're at 123 High Street, Lymington.\n\nOpening hours: ${hoursLink}\nFind us: ${locationLink}\nTrack your repair: ${shortTrackingLink(trackingToken)}\n\nNew Forest Device Repairs`
    }

    if (smsBody && customerPhone && webhookUrl) {
      try {
        const smsResponse = await fetch(webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            phone: customerPhone,
            message: smsBody,
          }),
        })

        const deliveryStatus = smsResponse.ok ? 'SENT' : 'FAILED'

        await supabase.from('sms_logs').insert({
          job_id: job.id,
          template_key: requiresParts ? 'DEPOSIT_RECEIVED' : 'QUOTE_APPROVED',
          body_rendered: smsBody,
          status: deliveryStatus,
          sent_at: now,
        })

        if (!smsResponse.ok) {
          console.error('SMS send failed for enquiry conversion')
        }
      } catch (smsError) {
        console.error('Failed to send SMS:', smsError)
      }
    }

    // Send email if customer has email
    if (enquiry.customer_email) {
      try {
        const appUrl = getAppUrl()
        await fetch(`${appUrl}/api/email/send`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jobId: job.id,
            type: 'JOB_CREATED',
          }),
        })
      } catch (emailError) {
        console.error('Failed to send email:', emailError)
      }
    }

    return NextResponse.json({
      success: true,
      job_id: job.id,
      job_ref: job.job_ref,
      tracking_token: job.tracking_token,
      tracking_url: shortTrackingLink(job.tracking_token),
      status: job.status,
      sms_sent: !!smsBody,
    })
  } catch (error) {
    console.error('Error converting enquiry to job:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
