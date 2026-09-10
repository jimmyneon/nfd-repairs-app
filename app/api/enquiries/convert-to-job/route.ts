import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getFirstName, renderSmsTemplate, safeDeviceLabel } from '@/lib/sms-template'
import { shortTrackingLink, shortHoursLink, getAppUrl } from '@/lib/utils'
import { requireStaffUser } from '@/lib/api-auth'
import { sendViaMacroDroid } from '@/lib/resilience'

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
  const { response: authResponse } = await requireStaffUser(request)
  if (authResponse) return authResponse

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

    const validStatuses = ['in_stock', 'parts_needed', 'parts_deposit_paid', 'device_in_shop']
    if (!validStatuses.includes(stock_status)) {
      return NextResponse.json(
        { error: 'stock_status must be "in_stock", "parts_needed", "parts_deposit_paid", or "device_in_shop"' },
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
    if (enquiry.converted_job_id) {
      return NextResponse.json({
        success: true,
        already_converted: true,
        job_id: enquiry.converted_job_id,
      })
    }

    const now = new Date().toISOString()
    const isDeviceInShop = stock_status === 'device_in_shop'
    const requiresParts = stock_status !== 'in_stock' && !isDeviceInShop
    const depositAlreadyPaid = stock_status === 'parts_deposit_paid'
    const partsRequired = requiresParts
    const depositRequired = requiresParts
    const depositAmount = requiresParts ? 20.00 : null

    // Calculate total price including additional repairs
    // The enquiry stores quoted_price (primary repair only) and additional_repairs
    // (array of { repair, display_name, price }). The job's price_total must
    // include all repairs.
    const primaryPrice = enquiry.quoted_price || 0
    let additionalRepairsTotal = 0
    if (Array.isArray(enquiry.additional_repairs)) {
      additionalRepairsTotal = enquiry.additional_repairs.reduce((sum: number, r: any) => {
        return sum + (typeof r.price === 'number' ? r.price : 0)
      }, 0)
    }
    const totalPrice = primaryPrice + additionalRepairsTotal

    // Determine job status
    const jobStatus = isDeviceInShop
      ? 'RECEIVED'
      : requiresParts
        ? (depositAlreadyPaid ? 'PARTS_ORDERED' : 'AWAITING_DEPOSIT')
        : 'AWAITING_DEVICE'

    // Generate job ref
    const { count: jobCount } = await supabase
      .from('jobs')
      .select('id', { count: 'exact', head: true })

    const jobRef = `NF-${String((jobCount || 0) + 1).padStart(5, '0')}`
    const trackingToken = crypto.randomUUID()

    // Build job data
    const jobData: Record<string, any> = {
      job_ref: jobRef,
      tracking_token: trackingToken,

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

      // Pricing — includes additional repairs in the total
      quoted_price: primaryPrice,
      price_total: totalPrice,
      quoted_at: enquiry.quoted_price ? now : null,

      // Parts & deposit
      requires_parts_order: partsRequired,
      parts_required: partsRequired,
      deposit_required: depositRequired,
      deposit_amount: depositAmount,
      deposit_received: depositAlreadyPaid,
      deposit_received_at: depositAlreadyPaid ? now : null,
      deposit_requested_at: requiresParts && !depositAlreadyPaid ? now : null,

      // Device possession — customer has device, needs to drop off
      // (unless they've already dropped it off in the shop)
      device_in_shop: isDeviceInShop,

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
    if (depositAlreadyPaid) {
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
    const { error: enquiryUpdateError } = await supabase
      .from('enquiries')
      .update({
        status: 'converted',
        converted_job_id: job.id,
        converted_to_job: true,
        converted_at: now,
        updated_at: now,
      })
      .eq('id', enquiry_id)

    if (enquiryUpdateError) {
      console.error('Failed to mark enquiry as converted:', enquiryUpdateError)
      await supabase.from('jobs').delete().eq('id', job.id)
      return NextResponse.json(
        { error: 'Failed to save stock decision', details: enquiryUpdateError.message },
        { status: 500 }
      )
    }

    // Log job creation event
    await supabase.from('job_events').insert({
      job_id: job.id,
      type: 'SYSTEM',
      message: `Job created from enquiry ${enquiry.enquiry_ref} (${isDeviceInShop ? 'Device dropped off - booked in' : depositAlreadyPaid ? 'Parts needed - deposit paid' : requiresParts ? 'Parts needed - awaiting deposit' : 'In stock'})`,
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
    if (isDeviceInShop) {
      // Device already dropped off in the shop — send the normal "booked in" message
      const trackingUrl = shortTrackingLink(job.short_token || trackingToken)
      const { data: templates } = await supabase
        .from('sms_templates')
        .select('key, body')
        .eq('key', 'RECEIVED')
        .eq('is_active', true)
        .single()

      const deviceSummary = safeDeviceLabel(enquiry.device_make, enquiry.device_model)
      smsBody = templates?.body
        ? renderSmsTemplate(templates.body, {
            first_name: getFirstName(enquiry.customer_name),
            customer_name: enquiry.customer_name || '',
            device_make: enquiry.device_make || '',
            device_model: enquiry.device_model || '',
            device_summary: deviceSummary,
            tracking_link: trackingUrl,
            job_ref: job.job_ref,
          })
        : `Hi ${getFirstName(enquiry.customer_name)}! 👋\n\nYour ${deviceSummary} is now booked in with us 🔧\n\n🔗 Track your repair here:\n${trackingUrl}\n\nWe will text you with updates as it progresses.\n\nNFD Repairs`
    } else if (depositAlreadyPaid) {
      // Parts needed + deposit paid
      smsBody = `Hi ${getFirstName(enquiry.customer_name)}!\n\nThanks for your deposit!\n\nWe have ordered the part for your ${enquiry.device_make || ''} ${enquiry.device_model || ''} — it is usually next-day delivery, but can occasionally take a little longer.\n\nWe will text you as soon as it arrives.\n\nTrack your repair: ${shortTrackingLink(trackingToken)}\n\nNFD Repairs`
    } else if (requiresParts) {
      // Parts needed — request the deposit before ordering
      const depositUrl = process.env.NEXT_PUBLIC_DEPOSIT_URL || 'https://pay.sumup.com/b2c/Q9OZOAJT'
      const trackingUrl = shortTrackingLink(job.short_token || trackingToken)
      const { data: templates } = await supabase
        .from('sms_templates')
        .select('key, body')
        .in('key', ['DEPOSIT_REQUEST', 'DEPOSIT_REQUIRED'])
        .eq('is_active', true)

      const template = templates?.find((item: any) => item.key === 'DEPOSIT_REQUEST') || templates?.[0]
      smsBody = template?.body
        ? renderSmsTemplate(template.body, {
            first_name: getFirstName(enquiry.customer_name),
            customer_name: enquiry.customer_name || '',
            device_make: enquiry.device_make || '',
            device_model: safeDeviceLabel(enquiry.device_make, enquiry.device_model),
            device_summary: safeDeviceLabel(enquiry.device_make, enquiry.device_model),
            deposit_amount: '20.00',
            deposit_link: depositUrl,
            tracking_link: trackingUrl,
            job_ref: job.job_ref,
          })
        : `Hi ${getFirstName(enquiry.customer_name)}!\n\nWe need to order parts for your ${safeDeviceLabel(enquiry.device_make, enquiry.device_model)} repair.\n\n💳 To get the order started, we just need a £20 deposit.\n\nThis secures the part and your repair slot. The £20 comes off your total repair price — you pay the balance when you collect.\n\nPay online here:\n${depositUrl}\n\nReply PAID once done and we will get them ordered straight away.\n\nNFD Repairs`
    } else {
      // In stock — parts ready, customer needs to bring device in
      const { data: hoursSetting } = await supabase
        .from('admin_settings')
        .select('value')
        .eq('key', 'opening_hours_link')
        .single()

      const hoursLink = hoursSetting?.value || shortHoursLink()

      smsBody = `Hi ${getFirstName(enquiry.customer_name)}! 📦\n\nGreat news — we have the parts in stock for your ${enquiry.device_make || ''} ${enquiry.device_model || ''} repair!\n\nJust bring your device in whenever suits you during opening hours — no appointment needed.\n\n📍 Directions & hours: ${hoursLink}\n🔗 Track your repair: ${shortTrackingLink(job.short_token || trackingToken)}\n\nNFD Repairs`
    }

    let smsSent = false
    let smsError: string | null = null
    if (smsBody && customerPhone && webhookUrl) {
      try {
        const smsResponse = await sendViaMacroDroid(webhookUrl, customerPhone, smsBody)

        const deliveryStatus = smsResponse.ok ? 'SENT' : 'FAILED'
        smsSent = smsResponse.ok
        smsError = smsResponse.ok ? null : (smsResponse.body || 'MacroDroid rejected the message')

        await supabase.from('sms_logs').insert({
          job_id: job.id,
          template_key: depositAlreadyPaid ? 'DEPOSIT_RECEIVED' : requiresParts ? 'DEPOSIT_REQUIRED' : 'AWAITING_DEVICE',
          body_rendered: smsBody,
          status: deliveryStatus,
          sent_at: deliveryStatus === 'SENT' ? now : null,
        })

        if (!smsResponse.ok) {
          console.error('SMS send failed for enquiry conversion')
        }
      } catch (smsException) {
        console.error('Failed to send SMS:', smsException)
        smsError = smsException instanceof Error ? smsException.message : 'SMS request failed'
      }
    } else if (!customerPhone) {
      smsError = 'No customer phone number'
    } else if (!webhookUrl) {
      smsError = 'MacroDroid webhook is not configured'
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
      tracking_url: shortTrackingLink(job.short_token || job.tracking_token),
      status: job.status,
      sms_sent: smsSent,
      sms_error: smsError,
    })
  } catch (error) {
    console.error('Error converting enquiry to job:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
