import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(
  request: Request,
  { params }: { params: { jobId: string } }
) {
  try {
    const { jobId } = params
    const body = await request.json().catch(() => ({}))
    const newAddOns: Array<{ repair: string; displayName: string; price: number }> = body.additional_repairs || []

    // Try enquiries table first (jobId is enquiry_ref for quote approvals)
    const { data: enquiry, error: enquiryError } = await supabase
      .from('enquiries')
      .select('*')
      .eq('enquiry_ref', jobId)
      .single()

    if (enquiry && !enquiryError) {
      // Merge existing and new additional repairs
      const existingAddOns = enquiry.additional_repairs || []
      const allAddOns = [...existingAddOns, ...newAddOns]

      // Update enquiry status and additional repairs
      const { error: updateErr } = await supabase
        .from('enquiries')
        .update({
          status: 'approved',
          additional_repairs: allAddOns,
          updated_at: new Date().toISOString(),
        })
        .eq('enquiry_ref', jobId)

      if (updateErr) {
        return NextResponse.json({ error: 'Failed to approve quote' }, { status: 500 })
      }

      // Create notification for staff
      const totalPrice = (enquiry.quoted_price || 0) + allAddOns.reduce((s: number, r: any) => s + r.price, 0)
      const notifBody = `${enquiry.enquiry_ref}: ${enquiry.device_make} ${enquiry.device_model} - Customer approved the quote (£${totalPrice})${newAddOns.length > 0 ? ` (+${newAddOns.length} add-on${newAddOns.length > 1 ? 's' : ''})` : ''}`
      await supabase.from('notifications').insert({
        type: 'QUOTE_APPROVED',
        title: 'Quote Approved',
        body: notifBody,
      })

      // Send push notification to NF Hub app
      try {
        await fetch('https://notify-50nol3u3c-jimmys-projects-9bf84ee4.vercel.app/api/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            app_id: 'nfd-repairs',
            title: 'Quote Approved',
            body: notifBody,
            category: 'status_update',
            priority: 'high',
            deep_link: `https://nfd-repairs-app.vercel.app/admin`,
          }),
        })
      } catch (e) {
        console.error('[Notify] Failed to send push:', e)
      }

      return NextResponse.json({ success: true })
    }

    // Fallback: jobs table by UUID
    const { data: job, error: jobError } = await supabase
      .from('jobs')
      .select('*')
      .eq('id', jobId)
      .single()

    if (jobError || !job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 })
    }

    // Update job status to QUOTE_APPROVED
    const updateFields: Record<string, any> = {
      status: 'QUOTE_APPROVED',
      status_changed_at: new Date().toISOString(),
      quote_approved_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }

    if (newAddOns.length > 0) {
      const existingAddOns = job.additional_issues || []
      updateFields.additional_issues = [...existingAddOns, ...newAddOns]
      updateFields.price_total = (job.quoted_price || job.price_total || 0) + newAddOns.reduce((s, r) => s + r.price, 0)
    }

    const { error: updateError } = await supabase
      .from('jobs')
      .update(updateFields)
      .eq('id', jobId)

    if (updateError) {
      return NextResponse.json({ error: 'Failed to approve quote' }, { status: 500 })
    }

    // Create synthetic event for quote approval
    await supabase.from('job_events').insert({
      job_id: jobId,
      event_type: 'QUOTE_APPROVED',
      event_data: {
        quoted_price: job.quoted_price || job.price_total,
        approved_by: 'customer',
        additional_repairs: newAddOns,
      },
      created_at: new Date().toISOString(),
    })

    // Create notification for staff
    const jobNotifBody = `${job.job_ref}: ${job.device_make} ${job.device_model} - Customer approved the quote (£${job.quoted_price || job.price_total})${newAddOns.length > 0 ? ` (+${newAddOns.length} add-on${newAddOns.length > 1 ? 's' : ''})` : ''}`
    await supabase.from('notifications').insert({
      type: 'QUOTE_APPROVED',
      title: 'Quote Approved',
      body: jobNotifBody,
      job_id: jobId,
    })

    // Send push notification to NF Hub app
    try {
      await fetch('https://notify-50nol3u3c-jimmys-projects-9bf84ee4.vercel.app/api/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          app_id: 'nfd-repairs',
          title: 'Quote Approved',
          body: jobNotifBody,
          category: 'status_update',
          priority: 'high',
          deep_link: `https://nfd-repairs-app.vercel.app/admin`,
        }),
      })
    } catch (e) {
      console.error('[Notify] Failed to send push:', e)
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error approving quote:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
