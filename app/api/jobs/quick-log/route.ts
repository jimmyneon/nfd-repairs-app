import { NextRequest, NextResponse } from 'next/server'
import { requireStaffUser } from '@/lib/api-auth'
import { createServiceClient } from '@/lib/resilience'
import { buildQuickRepairJob, QUICK_REPAIR_SOURCE } from '@/lib/quick-repair-log'

export async function POST(request: NextRequest) {
  const { response: authResponse } = await requireStaffUser(request)
  if (authResponse) return authResponse

  let jobData: ReturnType<typeof buildQuickRepairJob>
  try {
    const body = await request.json()
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('Invalid repair details.')
    jobData = buildQuickRepairJob(body)
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 })
  }

  try {
    const supabase = createServiceClient()
    let job: { id: string; job_ref: string } | null = null
    // A stable ID makes retrying a lost response safe. Separate repairs with
    // identical device/fault details still get their own records.
    for (let attempt = 0; attempt < 3; attempt++) {
      const result = await supabase.from('jobs').insert(jobData).select('id,job_ref').single()
      if (!result.error) {
        job = result.data
        break
      }
      if (result.error.code === '23505') {
        const existing = await supabase.from('jobs').select('id,job_ref')
          .eq('id', jobData.id).eq('source', QUICK_REPAIR_SOURCE).maybeSingle()
        if (existing.error) throw existing.error
        if (existing.data) return NextResponse.json({ success: true, ...existing.data })
        if (result.error.message.includes('job_ref') && attempt < 2) continue
      }
      throw result.error
    }
    if (!job) throw new Error('Repair was not saved.')
    const event = await supabase.from('job_events').insert({
      job_id: job.id,
      type: 'SYSTEM',
      message: 'Walk-in repair logged without customer details.',
    })
    if (event.error) console.error('Quick repair log event failed:', event.error)
    // No customer notification, agreement link or review request is queued.
    return NextResponse.json({ success: true, ...job }, { status: 201 })
  } catch (error) {
    console.error('Quick repair log failed:', error)
    return NextResponse.json({ error: 'Could not save this repair. Please try again.' }, { status: 500 })
  }
}
