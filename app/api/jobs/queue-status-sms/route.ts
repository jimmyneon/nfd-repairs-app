import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getFirstName, renderSmsTemplate } from '@/lib/sms-template'

export async function POST(request: NextRequest) {
  try {
    const { jobId, status, sendPriceInSms } = await request.json()

    if (!jobId || !status) {
      return NextResponse.json(
        { error: 'Missing jobId or status' },
        { status: 400 }
      )
    }

    // Use service role key for server-side operations
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    )

    // Get job details
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

    // Special handling for PARTS_ARRIVED: Don't send SMS if device already in shop
    if (status === 'PARTS_ARRIVED' && job.device_in_shop) {
      console.log(`PARTS_ARRIVED: Device already in shop for job ${job.job_ref} - skipping SMS`)
      return NextResponse.json({ 
        success: true, 
        message: 'Device already in shop - no need to notify customer to bring device in' 
      })
    }

    // Check notification config to see if SMS should be sent for this status
    const { data: config } = await supabase
      .from('notification_config')
      .select('send_sms, is_active')
      .eq('status_key', status)
      .single()

    if (config && (!config.send_sms || !config.is_active)) {
      console.log(`SMS disabled for status: ${status}`)
      
      // Special handling for COLLECTED status - schedule post-collection SMS
      if (status === 'COLLECTED') {
        try {
          const appUrl = 'https://nfd-repairs-app.vercel.app'
          await fetch(`${appUrl}/api/jobs/schedule-collection-sms`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ jobId })
          })
          console.log('Post-collection SMS scheduled for job:', job.job_ref)
        } catch (error) {
          console.error('Failed to schedule post-collection SMS:', error)
        }
      }
      
      return NextResponse.json({ 
        success: true, 
        message: 'SMS disabled for this status' 
      })
    }

    // Special handling for COLLECTED status - schedule post-collection SMS FIRST
    // This must run before template check since there's no immediate COLLECTED SMS template
    if (status === 'COLLECTED') {
      try {
        const appUrl = 'https://nfd-repairs-app.vercel.app'
        await fetch(`${appUrl}/api/jobs/schedule-collection-sms`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jobId })
        })
        console.log('Post-collection SMS scheduled for job:', job.job_ref)
      } catch (error) {
        console.error('Failed to schedule post-collection SMS:', error)
      }
      
      // COLLECTED status doesn't send immediate SMS, only schedules future review SMS
      return NextResponse.json({ 
        success: true, 
        message: 'Post-collection SMS scheduled' 
      })
    }

    // Only send SMS for key status changes
    const smsStatuses = ['QUOTE_APPROVED', 'RECEIVED', 'DROPPED_OFF', 'AWAITING_DEPOSIT', 'PARTS_ORDERED', 'PARTS_ARRIVED', 'IN_REPAIR', 'READY_TO_COLLECT', 'COMPLETED', 'CANCELLED', 'DELAYED']
    
    if (!smsStatuses.includes(status)) {
      console.log(`Status ${status} does not trigger SMS notification`)
      return NextResponse.json({ success: true, message: 'Status does not trigger SMS' })
    }

    // Map status to template key (AWAITING_DEPOSIT uses DEPOSIT_REQUIRED template)
    const templateKey = status === 'AWAITING_DEPOSIT' ? 'DEPOSIT_REQUIRED' : status

    // Get SMS template for this status
    const { data: template } = await supabase
      .from('sms_templates')
      .select('*')
      .eq('key', templateKey)
      .eq('is_active', true)
      .single()

    if (!template) {
      console.log(`No active SMS template found for status: ${status}`)
      return NextResponse.json({ success: true, message: 'No template for this status' })
    }

    // Build tracking URL (use hardcoded URL since NEXT_PUBLIC_ vars not available in API routes)
    const appUrl = 'https://nfd-repairs-app.vercel.app'
    const trackingUrl = `${appUrl}/t/${job.tracking_token}`
    const depositUrl = process.env.NEXT_PUBLIC_DEPOSIT_URL || 'https://pay.sumup.com/b2c/Q9OZOAJT'

    // Fetch links from admin settings (never hardcode location or hours)
    const { data: mapsSettings } = await supabase
      .from('admin_settings')
      .select('value')
      .eq('key', 'google_maps_link')
      .single()

    const { data: hoursSettings } = await supabase
      .from('admin_settings')
      .select('value')
      .eq('key', 'opening_hours_link')
      .single()

    const googleMapsLink = mapsSettings?.value || 'https://maps.app.goo.gl/oVczouUePXkRbrKb7'
    const hoursLink = hoursSettings?.value || googleMapsLink

    // Only show the maps link when the customer actually needs to travel
    // (device not in shop, or it's ready to collect)
    const includeMapsLink = !job.device_in_shop || status === 'READY_TO_COLLECT'
    const mapsLink = includeMapsLink ? googleMapsLink : ''

    // Only include price if it's > 0, the caller hasn't disabled it, and the customer hasn't already paid
    const hasValidPrice = job.price_total && parseFloat(job.price_total.toString()) > 0
    const includePrice = hasValidPrice && sendPriceInSms !== false && !job.payment_received
    const priceValue = includePrice ? job.price_total!.toString() : ''

    let smsBody = renderSmsTemplate(template.body, {
      customer_name: job.customer_name,
      first_name: getFirstName(job.customer_name),
      device_make: job.device_make,
      device_model: job.device_model,
      price_total: priceValue,
      tracking_link: trackingUrl,
      job_ref: job.job_ref,
      google_maps_link: mapsLink,
      hours_link: includeMapsLink ? hoursLink : '',
      deposit_amount: job.deposit_required ? (job.deposit_amount?.toString() || '20.00') : '',
      deposit_link: job.deposit_required ? depositUrl : '',
      delay_reason: status === 'DELAYED' ? (job.delay_reason || '') : '',
      delay_notes: status === 'DELAYED' ? (job.delay_notes || '') : '',
    })

    // Clean up price-related lines when price was intentionally omitted
    if (!includePrice) {
      smsBody = smsBody
        .replace(/^The total is £\s*$/gim, '')
        .replace(/^The quoted price is £\s*$/gim, '')
        .replace(/£\s*repair/gi, 'repair')
        .replace(/£\s*for your/gi, 'for your')
        .replace(/^.*£\s*$/gim, '')
        .replace(/\n{3,}/g, '\n\n')
        .trim()
    }

    // Clean up any dangling labels if the maps link was intentionally omitted
    if (!includeMapsLink) {
      smsBody = smsBody
        .replace(/^Find us: ?$/gim, '')
        .replace(/^Find us and check our hours: ?$/gim, '')
        .replace(/^Check our opening times before coming: ?$/gim, '')
        .replace(/^Drop it in whenever you're ready: ?$/gim, '')
        .replace(/\n{3,}/g, '\n\n')
        .trim()
    }

    // DYNAMIC MESSAGING: For RECEIVED status, add email notification info if customer has email
    if (status === 'RECEIVED' && job.customer_email) {
      smsBody += '\n\nYou\'ll receive updates by text and email throughout the repair. Please check your junk folder if you don\'t see our emails.'
    } else if (status === 'RECEIVED' && !job.customer_email) {
      smsBody += '\n\nWe\'ll text you when it\'s ready for collection.'
    }

    // Queue SMS
    const { data: smsLog, error: smsError } = await supabase
      .from('sms_logs')
      .insert({
        job_id: jobId,
        template_key: templateKey,
        body_rendered: smsBody,
        status: 'PENDING',
      })
      .select()
      .single()

    if (smsError) {
      console.error('Failed to queue SMS:', smsError)
      return NextResponse.json(
        { error: 'Failed to queue SMS' },
        { status: 500 }
      )
    }

    // Automatically send the SMS
    if (smsLog) {
      try {
        console.log('📤 Triggering SMS send for job:', job.job_ref)
        // Use hardcoded URL since NEXT_PUBLIC_ vars aren't available in API routes
        const appUrl = 'https://nfd-repairs-app.vercel.app'
        const response = await fetch(`${appUrl}/api/sms/send`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        })
        console.log('SMS send trigger response:', response.status, response.ok)
      } catch (error) {
        console.error('❌ Failed to trigger SMS send:', error)
      }
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error in queue-status-sms:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
