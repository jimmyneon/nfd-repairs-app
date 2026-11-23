import { NextRequest, NextResponse } from 'next/server'
import { requireStaffOrCron } from '@/lib/api-auth'
import { phoneLookupVariants } from '@/lib/phone-lookup'
import { createServiceClient } from '@/lib/resilience'

export const dynamic = 'force-dynamic'

/**
 * POST /api/ai-desk/communication-context
 *
 * Read-only repair-specific context for the AI receptionist. Given a caller
 * phone number or a verified job_ref/enquiry_ref, returns the matching
 * jobs/enquiries with their communication timeline (last staff message,
 * last customer reply, send status) so Alex knows where a repair stands
 * before deciding anything.
 *
 * Auth: server-to-server Bearer token (CRON_SECRET) — never exposed to
 * public clients. Sensitive fields (device_password, passcode_*, staff
 * notes, customer_notes raw JSON, tracking/quote tokens) are never
 * selected or returned.
 */

const OPEN_JOB_STATUSES = new Set([
  'RECEIVED', 'DIAGNOSTIC', 'IN_REPAIR', 'PARTS_ORDERED', 'PARTS_ARRIVED',
  'READY_TO_COLLECT', 'AWAITING_DEVICE', 'IN_STORAGE',
])
const OPEN_ENQUIRY_STATUSES = new Set(['pending', 'more_info_requested', 'approved'])

const MAX_CANDIDATES = 5
const MAX_MESSAGES_PER_SIDE = 6
const EXCERPT_LEN = 300

/** Strip URLs (they carry quote/tracking tokens) and long digit runs from excerpts. */
function excerpt(text: string | null | undefined): string {
  if (!text) return ''
  return String(text)
    .replace(/https?:\/\/\S+/g, '[link]')
    .replace(/\b\d{6,}\b/g, '[number]')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, EXCERPT_LEN)
}

function looksReplyable(body: string): boolean {
  return /\?|let (me|us) know|reply|respond|confirm|please (call|ring|text|send)|password|code|approve/i.test(body)
}

interface TimelineEvent { channel: 'sms' | 'email'; at: string; status: string | null; excerpt: string; sender?: string | null; subject?: string | null }

async function jobTimeline(supabase: ReturnType<typeof createServiceClient>, jobId: string) {
  const [sms, emails, events] = await Promise.all([
    supabase.from('sms_logs')
      .select('body_rendered, template_key, status, delivery_status, sent_at, delivered_at, error_message, created_at')
      .eq('job_id', jobId).order('created_at', { ascending: false }).limit(MAX_MESSAGES_PER_SIDE),
    supabase.from('email_logs')
      .select('subject, body_text, status, sent_at, error_message, created_at')
      .eq('job_id', jobId).order('created_at', { ascending: false }).limit(MAX_MESSAGES_PER_SIDE),
    supabase.from('job_events')
      .select('type, message, metadata, created_at')
      .eq('job_id', jobId).in('type', ['CUSTOMER_SMS', 'SMS_SENT'])
      .order('created_at', { ascending: false }).limit(MAX_MESSAGES_PER_SIDE * 2),
  ])

  const outbound: TimelineEvent[] = []
  const inbound: TimelineEvent[] = []

  for (const s of sms.data ?? []) {
    outbound.push({
      channel: 'sms', at: s.sent_at ?? s.created_at,
      // sent but not delivered is still only "sent" — never claim delivered
      status: s.status === 'SENT' || s.status === 'DELIVERED' ? 'sent' : (s.error_message ? 'failed' : String(s.status || 'pending').toLowerCase()),
      excerpt: excerpt(s.body_rendered),
    })
  }
  for (const e of emails.data ?? []) {
    outbound.push({
      channel: 'email', at: e.sent_at ?? e.created_at,
      status: e.error_message ? 'failed' : 'sent',
      subject: e.subject ?? null,
      excerpt: excerpt(e.body_text ?? e.subject),
    })
  }
  for (const ev of events.data ?? []) {
    if (ev.type === 'CUSTOMER_SMS') {
      inbound.push({ channel: 'sms', at: ev.created_at, status: null, excerpt: excerpt(ev.message) })
    } else {
      outbound.push({
        channel: 'sms', at: ev.created_at, status: 'sent',
        excerpt: excerpt(ev.message),
        sender: (ev.metadata as Record<string, string> | null)?.sender ?? null,
      })
    }
  }

  outbound.sort((a, b) => b.at.localeCompare(a.at))
  inbound.sort((a, b) => b.at.localeCompare(a.at))
  return { outbound, inbound }
}

function enquiryInbound(customerNotes: unknown): TimelineEvent[] {
  if (typeof customerNotes !== 'string' || !customerNotes.trim()) return []
  try {
    const notes = JSON.parse(customerNotes)
    if (!Array.isArray(notes)) return []
    return notes
      .filter((n: { type?: string }) => n?.type === 'customer_sms')
      .map((n: { message?: string; timestamp?: string }) => ({
        channel: 'sms' as const,
        at: n.timestamp ?? '',
        status: null,
        excerpt: excerpt(n.message),
      }))
      .filter((n: TimelineEvent) => n.at)
      .sort((a, b) => b.at.localeCompare(a.at))
  } catch {
    return []
  }
}

export async function POST(request: NextRequest) {
  const authResponse = await requireStaffOrCron(request)
  if (authResponse) return authResponse

  try {
    const body = await request.json().catch(() => ({}))
    const phone = typeof body.phone === 'string' ? body.phone.trim() : ''
    const jobRef = typeof body.jobRef === 'string' ? body.jobRef.trim().toUpperCase() : ''
    const enquiryRef = typeof body.enquiryRef === 'string' ? body.enquiryRef.trim().toUpperCase() : ''

    if (!phone && !jobRef && !enquiryRef) {
      return NextResponse.json({ error: 'Provide phone, jobRef or enquiryRef' }, { status: 400 })
    }

    const supabase = createServiceClient()
    const candidates: Array<Record<string, unknown>> = []

    if (jobRef || enquiryRef) {
      // Verified-reference lookup — a single confirmed record.
      if (jobRef) {
        const { data: job } = await supabase.from('jobs')
          .select('id, job_ref, customer_name, customer_email, device_make, device_model, status, created_at')
          .eq('job_ref', jobRef).maybeSingle()
        if (job) candidates.push({ kind: 'job', ...job })
      }
      if (enquiryRef) {
        const { data: enq } = await supabase.from('enquiries')
          .select('id, enquiry_ref, customer_name, customer_email, device_make, device_model, status, created_at, customer_notes, converted_job_id')
          .eq('enquiry_ref', enquiryRef).maybeSingle()
        if (enq) candidates.push({ kind: 'enquiry', ...enq })
      }
    } else {
      // Phone lookup — normalise across +44/07/0044 forms, gather candidates.
      const variants = phoneLookupVariants(phone)
      const [jobs, enquiries] = await Promise.all([
        supabase.from('jobs')
          .select('id, job_ref, customer_name, customer_email, device_make, device_model, status, created_at')
          .in('customer_phone', variants)
          .order('created_at', { ascending: false }).limit(MAX_CANDIDATES),
        supabase.from('enquiries')
          .select('id, enquiry_ref, customer_name, customer_email, device_make, device_model, status, created_at, customer_notes, converted_job_id')
          .in('customer_phone', variants)
          .order('created_at', { ascending: false }).limit(MAX_CANDIDATES),
      ])
      for (const j of jobs.data ?? []) candidates.push({ kind: 'job', ...j })
      for (const e of enquiries.data ?? []) candidates.push({ kind: 'enquiry', ...e })
      candidates.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
    }

    const limited = candidates.slice(0, MAX_CANDIDATES)

    // Job refs for converted-enquiry annotation
    const convertedJobIds = limited.filter(c => c.converted_job_id).map(c => c.converted_job_id as string)
    const convertedJobRefs = new Map<string, string>()
    if (convertedJobIds.length) {
      const { data: cj } = await supabase.from('jobs').select('id, job_ref').in('id', convertedJobIds)
      for (const j of cj ?? []) convertedJobRefs.set(j.id, j.job_ref)
    }

    const results = []
    for (const c of limited) {
      const isJob = c.kind === 'job'
      const status = String(c.status ?? '')
      const open = isJob ? OPEN_JOB_STATUSES.has(status) : OPEN_ENQUIRY_STATUSES.has(status)

      const { outbound, inbound } = isJob
        ? await jobTimeline(supabase, c.id as string)
        : { outbound: [] as TimelineEvent[], inbound: enquiryInbound(c.customer_notes) }

      const lastOut = outbound[0] ?? null
      const lastIn = inbound[0] ?? null
      // "Awaiting response" = the most recent message is ours, and it
      // reads like it asks the customer for something.
      const awaiting = !!lastOut && (!lastIn || lastOut.at > lastIn.at) && looksReplyable(lastOut.excerpt)

      const entry: Record<string, unknown> = {
        kind: c.kind,
        ref: isJob ? c.job_ref : c.enquiry_ref,
        status,
        open,
        device_label: [c.device_make, c.device_model].filter(Boolean).join(' ') || null,
        customer_first_name: String(c.customer_name ?? '').split(' ')[0] || null,
        created_at: c.created_at,
        has_customer_email: !!c.customer_email,
        last_outbound: lastOut,
        last_inbound: lastIn,
        awaiting_customer_response: awaiting,
        next_required_action: awaiting
          ? (lastOut!.channel === 'email' ? 'reply_to_existing_email' : 'reply_to_existing_sms')
          : 'none',
        reply_channel: awaiting ? lastOut!.channel : null,
        can_resend: false,
      }
      if (!isJob && c.converted_job_id) {
        entry.converted_to_job_ref = convertedJobRefs.get(c.converted_job_id as string) ?? null
      }
      results.push(entry)
    }

    const openCount = results.filter(r => r.open).length
    const matchStatus =
      jobRef || enquiryRef ? (results.length ? 'confirmed' : 'not_found')
      : results.length === 0 ? 'not_found'
      : openCount > 1 ? 'ambiguous'
      : 'confirmed'

    console.log(`[ai-desk] communication-context phone=${phone || '-'} jobRef=${jobRef || '-'} enquiryRef=${enquiryRef || '-'} → ${matchStatus} (${results.length} candidates)`)

    return NextResponse.json({
      match_status: matchStatus,
      candidates: results,
      // SMS replies are ingested; inbound email is NOT — callers must not be
      // told "no reply" on email threads.
      inbound_checked: { sms: true, email: false },
    })
  } catch (err) {
    console.error('[ai-desk] communication-context error:', err)
    return NextResponse.json({ error: 'Context lookup failed' }, { status: 500 })
  }
}
