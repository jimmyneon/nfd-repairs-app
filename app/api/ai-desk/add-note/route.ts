import { NextRequest, NextResponse } from 'next/server'
import { requireStaffOrCron } from '@/lib/api-auth'
import { createServiceClient } from '@/lib/resilience'

export const dynamic = 'force-dynamic'

/**
 * POST /api/ai-desk/add-note
 *
 * Attach a note from an AI call to a specific job or enquiry. Used when a
 * caller adds detail to an EXISTING repair — keeps the update on the record
 * the bench actually looks at, as a quiet NOTE event rather than a new
 * enquiry (and its NEW_ENQUIRY notification).
 *
 * Body: { jobRef?, enquiryRef?, note, callerName? }
 */

export async function POST(request: NextRequest) {
  const authResponse = await requireStaffOrCron(request)
  if (authResponse) return authResponse

  try {
    const body = await request.json().catch(() => ({}))
    const jobRef = typeof body.jobRef === 'string' ? body.jobRef.trim().toUpperCase() : ''
    const enquiryRef = typeof body.enquiryRef === 'string' ? body.enquiryRef.trim().toUpperCase() : ''
    const note = typeof body.note === 'string' ? body.note.trim() : ''
    const callerName = typeof body.callerName === 'string' ? body.callerName.trim() : ''

    if ((!jobRef && !enquiryRef) || !note) {
      return NextResponse.json({ error: 'Provide jobRef or enquiryRef, plus note' }, { status: 400 })
    }
    if (note.length > 2000) {
      return NextResponse.json({ error: 'Note too long' }, { status: 400 })
    }

    const supabase = createServiceClient()
    const stamp = new Date().toLocaleString('en-GB', { timeZone: 'Europe/London' })
    const noteLine = `[AI Call ${stamp}]${callerName ? ` ${callerName}:` : ''} ${note}`

    if (jobRef) {
      const { data: job } = await supabase.from('jobs')
        .select('id, job_ref').eq('job_ref', jobRef).maybeSingle()
      if (!job) return NextResponse.json({ error: `Job ${jobRef} not found` }, { status: 404 })

      const { error } = await supabase.from('job_events').insert({
        job_id: job.id,
        type: 'NOTE',
        message: noteLine,
        created_by: 'ai-desk',
      } as never)
      if (error) throw error

      console.log(`[ai-desk] add-note → job ${jobRef}`)
      return NextResponse.json({ ok: true, attached_to: jobRef })
    }

    const { data: enquiry } = await supabase.from('enquiries')
      .select('id, enquiry_ref, staff_notes').eq('enquiry_ref', enquiryRef).maybeSingle()
    if (!enquiry) return NextResponse.json({ error: `Enquiry ${enquiryRef} not found` }, { status: 404 })

    const prev = enquiry.staff_notes ? `${enquiry.staff_notes}\n` : ''
    const { error } = await supabase.from('enquiries')
      .update({ staff_notes: `${prev}${noteLine}`, updated_at: new Date().toISOString() })
      .eq('id', enquiry.id)
    if (error) throw error

    console.log(`[ai-desk] add-note → enquiry ${enquiryRef}`)
    return NextResponse.json({ ok: true, attached_to: enquiryRef })
  } catch (err) {
    console.error('[ai-desk] add-note error:', err)
    return NextResponse.json({ error: 'Failed to attach note' }, { status: 500 })
  }
}
