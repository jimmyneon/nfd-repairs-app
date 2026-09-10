import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

/**
 * GET /api/public/quote/[ref]
 *
 * Public endpoint for customers to view their quote without signing in.
 * Returns only the customer-facing quote data (no internal fields).
 */
export async function GET(_request: NextRequest, { params }: { params: { ref: string } }) {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    const { ref } = params

    // Try enquiries table first (ref is enquiry_ref for quote approvals)
    const { data: enquiry, error: enquiryError } = await supabase
      .from('enquiries')
      .select('*')
      .eq('enquiry_ref', ref)
      .single()

    if (enquiry && !enquiryError) {
      return NextResponse.json({
        job_ref: enquiry.enquiry_ref,
        device_make: enquiry.device_make,
        device_model: enquiry.device_model,
        issue: enquiry.repair_type,
        device_category: enquiry.device_category,
        quoted_price: enquiry.quoted_price,
        quoted_price_high: enquiry.quoted_price_high,
        price_total: enquiry.quoted_price,
        quote_type: enquiry.quote_type,
        part_option: enquiry.part_option || enquiry.screen_option,
        display_price: enquiry.display_price,
        warranty: enquiry.warranty,
        estimated_time: enquiry.estimated_time,
        additional_repairs: enquiry.additional_repairs || [],
        requires_parts_order: false,
        status: enquiry.status,
      })
    }

    // Fallback: try jobs table by UUID
    const { data: job, error: jobError } = await supabase
      .from('jobs')
      .select('*')
      .eq('id', ref)
      .single()

    if (jobError || !job) {
      return NextResponse.json({ error: 'Quote not found' }, { status: 404 })
    }

    // Return only customer-facing fields from the job
    return NextResponse.json({
      job_ref: job.job_ref,
      device_make: job.device_make,
      device_model: job.device_model,
      issue: job.issue,
      device_category: job.device_type,
      quoted_price: job.quoted_price,
      price_total: job.price_total,
      quote_type: null,
      part_option: null,
      display_price: null,
      warranty: null,
      estimated_time: null,
      additional_repairs: job.additional_issues || [],
      requires_parts_order: job.requires_parts_order,
      status: job.status,
    })
  } catch (err: any) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
