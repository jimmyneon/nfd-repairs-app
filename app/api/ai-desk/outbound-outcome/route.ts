import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireStaffOrCron } from '@/lib/api-auth'
import { sendSms } from '@/lib/resilience'

export const dynamic = 'force-dynamic'

/**
 * Webhook called by AI Desk when a customer responds on an outbound AI call
 * (personalised quote callback, quote follow-up, diagnostic explanation, or
 * collection chase).
 *
 * POST /api/ai-desk/outbound-outcome
 */
export async function POST(request: NextRequest) {
  const authResponse = await requireStaffOrCron(request)
  if (authResponse) return authResponse

  try {
    const body = await request.json()
    const outcome = String(body.outcome || 'question') as
      | 'approved'
      | 'declined'
      | 'thinking'
      | 'will_collect'
      | 'question'
      | 'unreachable'
    const notes = typeof body.notes === 'string' ? body.notes.trim() : ''
    const enquiryRef = typeof body.enquiryRef === 'string' ? body.enquiryRef.trim() : ''
    const jobId = typeof body.jobId === 'string' ? body.jobId.trim() : ''
    const jobRef = typeof body.jobRef === 'string' ? body.jobRef.trim() : ''
    const customerName = typeof body.customerName === 'string' ? body.customerName.trim() : 'Customer'

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    const now = new Date().toISOString()

    // 1. Update Enquiry if enquiryRef was provided
    if (enquiryRef) {
      const { data: enquiry } = await supabase
        .from('enquiries')
        .select('*')
        .eq('enquiry_ref', enquiryRef)
        .maybeSingle()

      if (enquiry) {
        const prevNotes = enquiry.staff_notes ? `${enquiry.staff_notes}\n` : ''
        const noteLine = `[AI Call ${new Date().toLocaleString('en-GB', { timeZone: 'Europe/London' })}] Outcome: ${outcome.toUpperCase()}${notes ? ` — ${notes}` : ''}`
        const updateFields: Record<string, unknown> = {
          staff_notes: `${prevNotes}${noteLine}`,
          updated_at: now,
        }

        if (outcome === 'approved') {
          updateFields.status = 'approved'
          updateFields.proceed_with_repair = true
        } else if (outcome === 'declined') {
          updateFields.status = 'rejected'
        }

        await supabase.from('enquiries').update(updateFields).eq('id', enquiry.id)

        // Mirror the customer-facing link approval: a verbal "yes" on the AI
        // call sends the same confirmation text (mobiles only — landlines
        // can't receive SMS).
        if (outcome === 'approved' && enquiry.customer_phone && /^\+?447|^07/.test(String(enquiry.customer_phone).replace(/\s/g, ''))) {
          const smsMessage = `Hi ${enquiry.customer_name}! 👋\n\nGreat choice — we have got your repair request for your ${enquiry.device_make || ''} ${enquiry.device_model || ''} ✅\n\nWe will be in touch ASAP to let you know what to do next.\n\nNFD Repairs`
          try {
            const smsResponse = await sendSms(enquiry.customer_phone, smsMessage)
            await supabase.from('sms_logs').insert({
              template_key: 'QUOTE_ACCEPTED',
              body_rendered: smsMessage,
              status: smsResponse.ok ? 'SENT' : 'FAILED',
              sent_at: smsResponse.ok ? new Date().toISOString() : null,
            } as any)
          } catch (e) {
            console.error('AI call approval SMS failed:', e)
          }
        }

        const deviceLabel = `${enquiry.device_make || ''} ${enquiry.device_model || ''}`.trim() || 'device'
        const isUnreachable = outcome === 'unreachable'
        await supabase.from('notifications').insert({
          type: outcome === 'approved' ? 'QUOTE_ACCEPTED' : 'ENQUIRY_UPDATE',
          title: isUnreachable
            ? `AI Call couldn't get through: ${deviceLabel}`
            : `AI Call (${outcome.toUpperCase()}): ${deviceLabel}`,
          body: `${enquiry.customer_name} (${enquiryRef}) — ${isUnreachable ? (notes || 'no answer') : outcome}${!isUnreachable && notes ? `: ${notes}` : ''}${isUnreachable ? ' — you can try again or send a text' : ''}`,
          is_read: false,
        } as any)
      }
    }

    // 2. Update Job if jobId was provided
    if (jobId) {
      const { data: job } = await supabase
        .from('jobs')
        .select('*')
        .eq('id', jobId)
        .maybeSingle()

      if (job) {
        const updateFields: Record<string, unknown> = {
          updated_at: now,
        }

        if (outcome === 'approved' && job.status !== 'READY_TO_COLLECT' && job.status !== 'COLLECTED') {
          updateFields.status = 'QUOTE_APPROVED'
          updateFields.status_changed_at = now
          updateFields.quote_approved_at = now
        } else if (outcome === 'declined' && job.status === 'AWAITING_CUSTOMER') {
          updateFields.status = 'QUOTE_REJECTED'
          updateFields.status_changed_at = now
        }

        await supabase.from('jobs').update(updateFields).eq('id', job.id)

        await supabase.from('job_events').insert({
          job_id: job.id,
          event_type: outcome === 'approved' ? 'QUOTE_APPROVED' : 'STAFF_NOTE',
          event_data: {
            source: 'ai-desk-outbound-call',
            outcome,
            notes: notes || `AI outbound call outcome: ${outcome}`,
          },
          created_at: now,
        })

        const deviceLabel = `${job.device_make || ''} ${job.device_model || ''}`.trim() || 'device'
        const isUnreachable = outcome === 'unreachable'
        await supabase.from('notifications').insert({
          type: outcome === 'approved' ? 'QUOTE_APPROVED' : 'JOB_UPDATE',
          title: isUnreachable
            ? `AI Call couldn't get through: ${job.job_ref || deviceLabel}`
            : `AI Call (${outcome.toUpperCase()}): ${job.job_ref || deviceLabel}`,
          body: `${job.customer_name || customerName} — ${isUnreachable ? (notes || 'no answer') : outcome}${!isUnreachable && notes ? `: ${notes}` : ''}${isUnreachable ? ' — you can try again or send a text' : ''}`,
          job_id: job.id,
          is_read: false,
        } as any)
      }
    }

    return NextResponse.json({ ok: true, saved: true })
  } catch (e: any) {
    console.error('[ai-desk/outbound-outcome] error:', e)
    return NextResponse.json({ error: e?.message || 'Failed to record outcome' }, { status: 500 })
  }
}
