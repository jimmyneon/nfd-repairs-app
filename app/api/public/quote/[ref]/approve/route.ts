import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/resilience'

export const dynamic = 'force-dynamic'

/**
 * POST /api/public/quote/[ref]/approve
 *
 * Public endpoint for customers to approve their quote without signing in.
 * Works the same as the staff endpoint but without auth.
 */
export async function POST(request: NextRequest, { params }: { params: { ref: string } }) {
  const supabase = createServiceClient()

  try {
    const { ref } = params
    const body = await request.json().catch(() => ({}))
    const newAddOns: Array<{ repair: string; displayName: string; price: number }> = body.additional_repairs || []

    // Try enquiries table first
    const { data: enquiry, error: enquiryError } = await supabase
      .from('enquiries')
      .select('*')
      .eq('enquiry_ref', ref)
      .single()

    if (enquiry && !enquiryError) {
      const existingAddOns = enquiry.additional_repairs || []
      const allAddOns = [...existingAddOns, ...newAddOns]

      const { error: updateErr } = await supabase
        .from('enquiries')
        .update({
          status: 'approved',
          additional_repairs: allAddOns,
          updated_at: new Date().toISOString(),
        })
        .eq('enquiry_ref', ref)

      if (updateErr) {
        return NextResponse.json({ error: 'Failed to approve quote' }, { status: 500 })
      }

      // Notify staff
      const totalPrice = (enquiry.quoted_price || 0) + allAddOns.reduce((s: number, r: any) => s + r.price, 0)
      const notifBody = `${enquiry.enquiry_ref}: ${enquiry.device_make} ${enquiry.device_model} - Customer approved the quote (£${totalPrice})${newAddOns.length > 0 ? ` (+${newAddOns.length} add-on${newAddOns.length > 1 ? 's' : ''})` : ''}`
      await supabase.from('notifications').insert({
        type: 'QUOTE_APPROVED',
        title: 'Quote Approved',
        body: notifBody,
        is_read: false,
      })

      // MacroDroid webhook
      try {
        await fetch('https://trigger.macrodroid.com/4e59ada0-b4c6-443d-b189-3c7aa21a8454/repair-request', {
          method: 'POST',
          body: `https://nfd-repairs-app.vercel.app/app/enquiries?ref=${enquiry.enquiry_ref}`,
        })
      } catch (e) {
        console.error('[MacroDroid] Failed to send webhook:', e)
      }

      // Push notification
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
            deep_link: 'https://nfd-repairs-app.vercel.app/admin',
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
      .eq('id', ref)
      .single()

    if (jobError || !job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 })
    }

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
      .eq('id', ref)

    if (updateError) {
      return NextResponse.json({ error: 'Failed to approve quote' }, { status: 500 })
    }

    await supabase.from('job_events').insert({
      job_id: ref,
      event_type: 'QUOTE_APPROVED',
      event_data: {
        quoted_price: job.quoted_price || job.price_total,
        approved_by: 'customer',
        additional_repairs: newAddOns,
      },
      created_at: new Date().toISOString(),
    } as any)

    const jobNotifBody = `${job.job_ref}: ${job.device_make} ${job.device_model} - Customer approved the quote (£${job.quoted_price || job.price_total})${newAddOns.length > 0 ? ` (+${newAddOns.length} add-on${newAddOns.length > 1 ? 's' : ''})` : ''}`
    await supabase.from('notifications').insert({
      type: 'QUOTE_APPROVED',
      title: 'Quote Approved',
      body: jobNotifBody,
      job_id: ref,
      is_read: false,
    })

    try {
      await fetch('https://trigger.macrodroid.com/4e59ada0-b4c6-443d-b189-3c7aa21a8454/repair-request', {
        method: 'POST',
        body: `https://nfd-repairs-app.vercel.app/app/enquiries?ref=${job.job_ref}`,
      })
    } catch (e) {
      console.error('[MacroDroid] Failed to send webhook:', e)
    }

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
          deep_link: 'https://nfd-repairs-app.vercel.app/admin',
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
