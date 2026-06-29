import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function PATCH(
  request: NextRequest,
  { params }: { params: { jobId: string } }
) {
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
