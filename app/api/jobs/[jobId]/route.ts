import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireStaffUser } from '@/lib/api-auth'

export async function GET(
  request: NextRequest,
  { params }: { params: { jobId: string } }
) {
  const { response: authResponse } = await requireStaffUser(request)
  if (authResponse) return authResponse

  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    const { jobId } = params

    // Try enquiries table first (jobId is actually enquiry_ref for quote approvals)
    const { data: enquiry, error: enquiryError } = await supabase
      .from('enquiries')
      .select('*')
      .eq('enquiry_ref', jobId)
      .single()

    if (enquiry && !enquiryError) {
      return NextResponse.json({
        job_ref: enquiry.enquiry_ref,
        device_make: enquiry.device_make,
        device_model: enquiry.device_model,
        issue: enquiry.repair_type,
        device_category: enquiry.device_category,
        quoted_price: enquiry.quoted_price,
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
      .eq('id', jobId)
      .single()

    if (jobError || !job) {
      return NextResponse.json({ error: 'Quote not found' }, { status: 404 })
    }

    return NextResponse.json(job)
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { jobId: string } }
) {
  const { response: authResponse } = await requireStaffUser(request)
  if (authResponse) return authResponse

  try {
    const body = await request.json()
    
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const updateData: Record<string, any> = {}
    
    if (body.price_total !== undefined) {
      updateData.price_total = body.price_total
    }
    if (body.deposit_required !== undefined) {
      updateData.deposit_required = body.deposit_required
    }
    if (body.requires_parts_order !== undefined) {
      updateData.requires_parts_order = body.requires_parts_order
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('jobs')
      .update(updateData)
      .eq('id', params.jobId)
      .select()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    if (body.price_total !== undefined) {
      await supabase.from('job_events').insert({
        job_id: params.jobId,
        type: 'PRICE_UPDATE',
        message: `Price updated to £${body.price_total.toFixed(2)}`,
      })
    }

    return NextResponse.json({ success: true, job: data?.[0] })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
