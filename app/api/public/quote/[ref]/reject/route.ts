import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/resilience'

export const dynamic = 'force-dynamic'

/**
 * POST /api/public/quote/[ref]/reject
 *
 * Public endpoint for customers to reject their quote without signing in.
 */
export async function POST(_request: NextRequest, { params }: { params: { ref: string } }) {
  const supabase = createServiceClient()

  try {
    const { ref } = params

    // Try enquiries table first
    const { data: enquiry, error: enquiryError } = await supabase
      .from('enquiries')
      .select('*')
      .eq('enquiry_ref', ref)
      .single()

    if (enquiry && !enquiryError) {
      const { error: updateErr } = await supabase
        .from('enquiries')
        .update({
          status: 'rejected',
          updated_at: new Date().toISOString(),
        })
        .eq('enquiry_ref', ref)

      if (updateErr) {
        return NextResponse.json({ error: 'Failed to reject quote' }, { status: 500 })
      }

      // Notify staff
      await supabase.from('notifications').insert({
        type: 'QUOTE_REJECTED',
        title: 'Quote Rejected',
        body: `${enquiry.enquiry_ref}: ${enquiry.device_make} ${enquiry.device_model} - Customer declined the quote`,
        is_read: false,
      })

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

    const { error: updateError } = await supabase
      .from('jobs')
      .update({
        status: 'QUOTE_REJECTED',
        status_changed_at: new Date().toISOString(),
        quote_rejected_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', ref)

    if (updateError) {
      return NextResponse.json({ error: 'Failed to reject quote' }, { status: 500 })
    }

    await supabase.from('job_events').insert({
      job_id: ref,
      event_type: 'QUOTE_REJECTED',
      event_data: {
        quoted_price: job.quoted_price || job.price_total,
        rejected_by: 'customer',
      },
      created_at: new Date().toISOString(),
    } as any)

    await supabase.from('notifications').insert({
      type: 'QUOTE_REJECTED',
      title: 'Quote Rejected',
      body: `${job.job_ref}: ${job.device_make} ${job.device_model} - Customer declined the quote`,
      job_id: ref,
      is_read: false,
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error rejecting quote:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
