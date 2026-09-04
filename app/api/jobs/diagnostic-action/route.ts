import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient, supabaseRetry } from '@/lib/resilience'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { jobId, action, diagnosisNotes, declinedReason } = body

    if (!jobId || !action) {
      return NextResponse.json({ error: 'jobId and action required' }, { status: 400 })
    }

    const supabase = createServiceClient()

    if (action === 'agree') {
      // Mark repair as agreed
      const { error } = await supabaseRetry(() =>
        supabase
          .from('jobs')
          .update({ repair_agreed_at: new Date().toISOString() })
          .eq('id', jobId)
      )
      if (error) {
        return NextResponse.json({ error: 'Failed to update job' }, { status: 500 })
      }

      // Log event
      await supabaseRetry(() =>
        supabase.from('job_events').insert({
          job_id: jobId,
          type: 'SYSTEM',
          message: 'Repair agreed by customer',
        })
      )

      return NextResponse.json({ success: true, action: 'agreed' })
    }

    if (action === 'decline') {
      const { error } = await supabaseRetry(() =>
        supabase
          .from('jobs')
          .update({
            repair_declined_at: new Date().toISOString(),
            repair_declined_reason: declinedReason || null,
          })
          .eq('id', jobId)
      )
      if (error) {
        return NextResponse.json({ error: 'Failed to update job' }, { status: 500 })
      }

      await supabaseRetry(() =>
        supabase.from('job_events').insert({
          job_id: jobId,
          type: 'SYSTEM',
          message: `Repair declined${declinedReason ? ': ' + declinedReason : ''}`,
        })
      )

      return NextResponse.json({ success: true, action: 'declined' })
    }

    if (action === 'save_diagnosis') {
      const { error } = await supabaseRetry(() =>
        supabase
          .from('jobs')
          .update({
            diagnosis_notes: diagnosisNotes,
            diagnosis_sent_at: new Date().toISOString(),
          })
          .eq('id', jobId)
      )
      if (error) {
        return NextResponse.json({ error: 'Failed to save diagnosis' }, { status: 500 })
      }

      await supabaseRetry(() =>
        supabase.from('job_events').insert({
          job_id: jobId,
          type: 'SYSTEM',
          message: 'Diagnosis notes saved and sent to customer',
        })
      )

      return NextResponse.json({ success: true, action: 'diagnosis_saved' })
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  } catch (error) {
    console.error('Error in diagnostic-action:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
