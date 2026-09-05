import { NextRequest, NextResponse } from 'next/server'
import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { detectQuoteAcceptance } from '@/lib/quote-acceptance-detector'
import { sendViaMacroDroid } from '@/lib/resilience'
import { getFirstName, safeDeviceLabel } from '@/lib/sms-template'
import { shortTrackingLink, shortHoursLink } from '@/lib/utils'

/**
 * POST /api/sms/reply
 *
 * Handle inbound SMS replies from MacroDroid. Routing priority:
 *
 *   1. Active repair_quote enquiry by phone → run quote-acceptance detector
 *      - High-confidence "yes"  → auto-convert enquiry to job + text customer
 *      - Medium ("ok", "thanks") → send "Reply YES to confirm" prompt
 *      - High-confidence "no"   → mark enquiry rejected + polite close-out
 *      - Unclear                → log as note on enquiry for staff review
 *
 *   2. Active job by phone → log reply as a NOTE in job_events
 *
 *   3. Open warranty ticket by phone → update/create ticket (existing behaviour)
 *
 *   4. No match → log orphan reply + create a staff notification
 *
 * Expected payload: { phone, message, timestamp?, threadId? }
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    const body = await request.json()
    const { phone, message, timestamp, threadId } = body

    if (!phone || !message) {
      return NextResponse.json(
        { error: 'Missing phone or message' },
        { status: 400 }
      )
    }

    console.log(`[sms/reply] From ${phone}: "${message.substring(0, 80)}"`)

    // Normalise phone to +44XXXXXXXXX format for lookup.
    // Enquiries are stored normalised, but inbound SMS from MacroDroid may
    // arrive as 07XXXXXXXXX or +447XXXXXXXXX — try both forms to be safe.
    const normalisedPhone = normaliseUkPhoneForLookup(phone)
    const lookupPhones = [normalisedPhone, phone.trim()].filter(Boolean)

    // -----------------------------------------------------------------------
    // 1. Check for an active repair_quote enquiry
    // -----------------------------------------------------------------------
    const { data: enquiries } = await supabase
      .from('enquiries')
      .select('*')
      .eq('enquiry_type', 'repair_quote')
      .in('status', ['pending', 'approved', 'more_info_requested'])
      .in('customer_phone', lookupPhones)
      .order('created_at', { ascending: false })
      .limit(1)

    const activeEnquiry = enquiries?.[0]

    if (activeEnquiry) {
      return handleEnquiryReply({
        supabase,
        enquiry: activeEnquiry,
        message,
        phone,
        threadId,
        timestamp,
      })
    }

    // -----------------------------------------------------------------------
    // 2. Check for an active job
    // -----------------------------------------------------------------------
    const { data: jobs } = await supabase
      .from('jobs')
      .select('id, job_ref, customer_name, customer_phone, status, device_make, device_model, tracking_token')
      .in('customer_phone', lookupPhones)
      .order('created_at', { ascending: false })
      .limit(1)

    const job = jobs?.[0]

    if (job) {
      // Log the reply as a NOTE on the job
      await supabase.from('job_events').insert({
        job_id: job.id,
        type: 'NOTE',
        message: `Customer SMS reply: ${message.substring(0, 200)}${message.length > 200 ? '...' : ''}`,
      })

      // Notify staff
      try {
        await supabase.from('notifications').insert({
          type: 'CUSTOMER_REPLY',
          title: `Customer replied: ${job.job_ref}`,
          body: `${job.customer_name}: ${message.substring(0, 80)}${message.length > 80 ? '...' : ''}`,
          job_id: job.id,
          is_read: false,
        } as any)
      } catch (e) {
        console.error('[sms/reply] Notification insert failed:', e)
      }

      console.log(`[sms/reply] Logged reply as NOTE on job ${job.job_ref}`)

      // Also route to warranty ticket flow if the job is completed/collected
      // (existing behaviour — post-repair support)
      const completedStatuses = ['COMPLETED', 'COLLECTED', 'READY_TO_COLLECT']
      if (completedStatuses.includes(job.status)) {
        return handleWarrantyTicket({
          supabase,
          job,
          message,
          phone,
          threadId,
          timestamp,
        })
      }

      return NextResponse.json({
        success: true,
        routed_to: 'job_note',
        job_ref: job.job_ref,
      })
    }

    // -----------------------------------------------------------------------
    // 3. No match — orphan reply, notify staff
    // -----------------------------------------------------------------------
    console.log(`[sms/reply] No matching enquiry or job for ${phone}`)
    try {
      await supabase.from('notifications').insert({
        type: 'ORPHAN_SMS',
        title: 'Unmatched customer SMS reply',
        body: `From ${phone}: ${message.substring(0, 120)}${message.length > 120 ? '...' : ''}`,
        is_read: false,
      } as any)
    } catch (e) {
      console.error('[sms/reply] Orphan notification insert failed:', e)
    }

    return NextResponse.json({
      success: true,
      routed_to: 'orphan',
      message: 'No matching enquiry or job found — staff notified',
    })
  } catch (error) {
    console.error('[sms/reply] Error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// ---------------------------------------------------------------------------
// Enquiry reply handler — runs the acceptance detector
// ---------------------------------------------------------------------------
async function handleEnquiryReply({
  supabase,
  enquiry,
  message,
  phone,
  threadId,
  timestamp,
}: {
  supabase: SupabaseClient<any, any, any>
  enquiry: any
  message: string
  phone: string
  threadId?: string
  timestamp?: string
}) {
  const detection = detectQuoteAcceptance(message)
  const webhookUrl = process.env.MACRODROID_WEBHOOK_URL
  const now = new Date().toISOString()

  console.log(`[sms/reply] Enquiry ${enquiry.enquiry_ref} → ${detection.classification} (conf ${detection.confidence})`)

  // Log the customer's reply as a note on the enquiry
  try {
    await supabase.from('enquiries').update({
      customer_notes: [
        ...(enquiry.customer_notes ? (typeof enquiry.customer_notes === 'string' ? JSON.parse(enquiry.customer_notes) : enquiry.customer_notes) : []),
        { type: 'customer_sms', message: message.substring(0, 500), timestamp: timestamp || now, classification: detection.classification },
      ],
      updated_at: now,
    }).eq('id', enquiry.id)
  } catch (e) {
    console.error('[sms/reply] Failed to append customer note:', e)
  }

  // ---- High-confidence ACCEPTANCE → auto-convert to job ----
  if (detection.classification === 'accept') {
    return autoConvertEnquiry({ supabase, enquiry, phone, webhookUrl })
  }

  // ---- Medium confidence → send "Reply YES to confirm" prompt ----
  if (detection.classification === 'medium') {
    const deviceLabel = safeDeviceLabel(enquiry.device_make, enquiry.device_model)
    const smsBody = `Hi ${getFirstName(enquiry.customer_name)},\n\nJust to confirm — would you like to go ahead with the ${deviceLabel} repair${enquiry.quoted_price ? ` at £${enquiry.quoted_price}` : ''}?\n\nReply YES to book it in, or let me know if you have any questions.\n\nNew Forest Device Repairs`

    if (webhookUrl) {
      const result = await sendViaMacroDroid(webhookUrl, phone, smsBody)
      await logSms(supabase, 'QUOTE_CONFIRM_PROMPT', smsBody, result.ok)
    }

    // Notify staff that a reply came in and we sent a confirmation prompt
    try {
      await supabase.from('notifications').insert({
        type: 'QUOTE_REPLY',
        title: `Customer replied to quote ${enquiry.enquiry_ref}`,
        body: `${enquiry.customer_name}: "${message.substring(0, 60)}" → sent confirmation prompt`,
        is_read: false,
      } as any)
    } catch (e) {
      console.error('[sms/reply] Notification insert failed:', e)
    }

    return NextResponse.json({
      success: true,
      routed_to: 'enquiry_medium',
      enquiry_ref: enquiry.enquiry_ref,
      classification: detection.classification,
      sms_sent: !!webhookUrl,
    })
  }

  // ---- High-confidence DECLINE → mark rejected, send polite close-out ----
  if (detection.classification === 'decline') {
    await supabase
      .from('enquiries')
      .update({ status: 'rejected', updated_at: now })
      .eq('id', enquiry.id)

    const smsBody = `Hi ${getFirstName(enquiry.customer_name)},\n\nNo problem at all. If you change your mind or need anything else in the future, just give us a call or text.\n\nTake care,\nNew Forest Device Repairs`

    if (webhookUrl) {
      const result = await sendViaMacroDroid(webhookUrl, phone, smsBody)
      await logSms(supabase, 'QUOTE_DECLINED_AUTO', smsBody, result.ok)
    }

    try {
      await supabase.from('notifications').insert({
        type: 'QUOTE_DECLINED',
        title: `Quote declined: ${enquiry.enquiry_ref}`,
        body: `${enquiry.customer_name} declined the ${enquiry.device_make || ''} ${enquiry.device_model || ''} repair.`,
        is_read: false,
      } as any)
    } catch (e) {
      console.error('[sms/reply] Notification insert failed:', e)
    }

    return NextResponse.json({
      success: true,
      routed_to: 'enquiry_decline',
      enquiry_ref: enquiry.enquiry_ref,
      classification: detection.classification,
    })
  }

  // ---- Unclear → log for staff review ----
  try {
    await supabase.from('notifications').insert({
      type: 'QUOTE_REPLY',
      title: `Customer replied to quote ${enquiry.enquiry_ref}`,
      body: `${enquiry.customer_name}: "${message.substring(0, 100)}${message.length > 100 ? '...' : ''}"\nNeeds staff review.`,
      is_read: false,
    } as any)
  } catch (e) {
    console.error('[sms/reply] Notification insert failed:', e)
  }

  return NextResponse.json({
    success: true,
    routed_to: 'enquiry_unclear',
    enquiry_ref: enquiry.enquiry_ref,
    classification: detection.classification,
  })
}

// ---------------------------------------------------------------------------
// Auto-convert enquiry to job (high-confidence "yes")
// ---------------------------------------------------------------------------
async function autoConvertEnquiry({
  supabase,
  enquiry,
  phone,
  webhookUrl,
}: {
  supabase: SupabaseClient<any, any, any>
  enquiry: any
  phone: string
  webhookUrl: string | undefined
}) {
  const now = new Date().toISOString()

  // Don't double-convert
  if (enquiry.converted_job_id) {
    return NextResponse.json({
      success: true,
      routed_to: 'enquiry_already_converted',
      enquiry_ref: enquiry.enquiry_ref,
      job_id: enquiry.converted_job_id,
    })
  }

  // Generate job ref + tracking token
  const { count: jobCount } = await supabase
    .from('jobs')
    .select('id', { count: 'exact', head: true })

  const jobRef = `NF-${String((jobCount || 0) + 1).padStart(5, '0')}`
  const trackingToken = crypto.randomUUID()

  const jobData: Record<string, any> = {
    job_ref: jobRef,
    tracking_token: trackingToken,
    customer_name: enquiry.customer_name,
    customer_phone: enquiry.customer_phone,
    customer_email: enquiry.customer_email || null,
    device_type: enquiry.device_category || null,
    device_make: enquiry.device_make || 'Unknown',
    device_model: enquiry.device_model || 'Unknown',
    issue: enquiry.repair_type || 'Repair needed',
    description: enquiry.issue_description || null,
    additional_issues: enquiry.additional_repairs || [],
    type: 'repair',
    source: 'sms_acceptance',
    page: enquiry.quote_source || null,
    quoted_price: enquiry.quoted_price || 0,
    price_total: enquiry.quoted_price || 0,
    quoted_at: enquiry.quoted_price ? now : null,
    requires_parts_order: false,
    parts_required: false,
    deposit_required: false,
    device_in_shop: false,
    status: 'QUOTE_APPROVED',
    status_changed_at: now,
    terms_accepted: enquiry.terms_accepted || false,
    terms_accepted_at: enquiry.terms_accepted ? now : null,
    marketing_opt_in: enquiry.marketing_consent || false,
    marketing_opt_in_at: enquiry.marketing_consent ? now : null,
    quote_request_id: enquiry.id,
  }

  const { data: job, error: jobError } = await supabase
    .from('jobs')
    .insert(jobData)
    .select()
    .single()

  if (jobError || !job) {
    console.error('[sms/reply] Auto-convert failed:', jobError)
    return NextResponse.json(
      { error: 'Failed to create job from enquiry', details: jobError?.message },
      { status: 500 }
    )
  }

  // Mark enquiry as converted
  await supabase
    .from('enquiries')
    .update({
      status: 'converted',
      converted_job_id: job.id,
      converted_to_job: true,
      converted_at: now,
      proceed_with_repair: true,
      updated_at: now,
    })
    .eq('id', enquiry.id)

  // Log job event
  await supabase.from('job_events').insert({
    job_id: job.id,
    type: 'SYSTEM',
    message: `Job auto-created from SMS acceptance of enquiry ${enquiry.enquiry_ref}`,
  })

  // Staff notification
  try {
    await supabase.from('notifications').insert({
      type: 'NEW_JOB',
      title: 'New job from SMS acceptance',
      body: `${enquiry.customer_name} texted YES to accept the ${enquiry.device_make || ''} ${enquiry.device_model || ''} repair${enquiry.quoted_price ? ` (£${enquiry.quoted_price})` : ''}.`,
      job_id: job.id,
      is_read: false,
    } as any)
  } catch (e) {
    console.error('[sms/reply] Notification insert failed:', e)
  }

  // Send confirmation SMS to customer
  const deviceLabel = safeDeviceLabel(enquiry.device_make, enquiry.device_model)
  const smsBody = `Hi ${getFirstName(enquiry.customer_name)},\n\nGreat news — your ${deviceLabel} repair is booked in!\n\nPop in with your device whenever you're ready — no appointment needed.\n\nOpening hours: ${shortHoursLink()}\nTrack your repair: ${shortTrackingLink(trackingToken)}\n\nSee you soon,\nNew Forest Device Repairs`

  if (webhookUrl) {
    const result = await sendViaMacroDroid(webhookUrl, phone, smsBody)
    await logSms(supabase, 'QUOTE_ACCEPTED_AUTO', smsBody, result.ok, job.id)
  }

  console.log(`[sms/reply] Auto-converted enquiry ${enquiry.enquiry_ref} → job ${jobRef}`)

  return NextResponse.json({
    success: true,
    routed_to: 'enquiry_accept',
    enquiry_ref: enquiry.enquiry_ref,
    job_ref: jobRef,
    job_id: job.id,
    tracking_token: trackingToken,
    sms_sent: !!webhookUrl,
  })
}

// ---------------------------------------------------------------------------
// Warranty ticket handler (existing behaviour, refactored)
// ---------------------------------------------------------------------------
async function handleWarrantyTicket({
  supabase,
  job,
  message,
  phone,
  threadId,
  timestamp,
}: {
  supabase: SupabaseClient<any, any, any>
  job: any
  message: string
  phone: string
  threadId?: string
  timestamp?: string
}) {
  const { data: existingTickets } = await supabase
    .from('warranty_tickets')
    .select('*')
    .eq('matched_job_id', job.id)
    .in('status', ['NEW', 'NEEDS_ATTENTION', 'IN_PROGRESS'])
    .order('created_at', { ascending: false })
    .limit(1)

  let ticket = existingTickets?.[0]

  if (ticket) {
    await supabase
      .from('warranty_tickets')
      .update({
        status: 'NEEDS_ATTENTION',
        sms_thread_id: threadId || null,
        inbound_messages: [
          ...(ticket.inbound_messages || []),
          { message, timestamp: timestamp || new Date().toISOString(), phone },
        ],
      })
      .eq('id', ticket.id)

    await supabase
      .from('warranty_ticket_events')
      .insert({
        ticket_id: ticket.id,
        type: 'SMS_RECEIVED',
        message: `Customer replied: ${message.substring(0, 100)}...`,
        metadata: { phone, threadId },
      })

    console.log(`[sms/reply] Updated warranty ticket ${ticket.ticket_ref}`)
  } else {
    const { data: newTicket, error: ticketError } = await supabase
      .from('warranty_tickets')
      .insert({
        source: 'sms_reply',
        submitted_at: timestamp || new Date().toISOString(),
        customer_name: job.customer_name,
        customer_phone: phone,
        customer_email: job.customer_email,
        matched_job_id: job.id,
        match_confidence: 'high',
        job_reference: job.job_ref,
        device_model: `${job.device_make || ''} ${job.device_model || ''}`.trim(),
        issue_description: message,
        issue_category: 'warranty',
        status: 'NEEDS_ATTENTION',
        sms_thread_id: threadId || null,
        inbound_messages: [{
          message,
          timestamp: timestamp || new Date().toISOString(),
          phone,
        }],
      })
      .select()
      .single()

    if (ticketError) {
      console.error('[sms/reply] Failed to create warranty ticket:', ticketError)
      return NextResponse.json(
        { error: 'Failed to create warranty ticket' },
        { status: 500 }
      )
    }

    ticket = newTicket

    await supabase
      .from('warranty_ticket_events')
      .insert({
        ticket_id: ticket.id,
        type: 'SMS_RECEIVED',
        message: `Customer replied via SMS: ${message.substring(0, 100)}...`,
        metadata: { phone, threadId },
      })

    console.log(`[sms/reply] Created warranty ticket ${ticket.ticket_ref}`)
  }

  return NextResponse.json({
    success: true,
    routed_to: 'warranty_ticket',
    ticketId: ticket.id,
    ticketRef: ticket.ticket_ref,
    status: ticket.status,
  })
}

// ---------------------------------------------------------------------------
// Helper: log SMS to sms_logs
// ---------------------------------------------------------------------------
async function logSms(
  supabase: SupabaseClient<any, any, any>,
  templateKey: string,
  body: string,
  ok: boolean,
  jobId?: string
) {
  try {
    await supabase.from('sms_logs').insert({
      job_id: jobId || null,
      template_key: templateKey,
      body_rendered: body,
      status: ok ? 'SENT' : 'FAILED',
      sent_at: ok ? new Date().toISOString() : null,
    } as any)
  } catch (e) {
    console.error('[sms/reply] SMS log failed:', e)
  }
}

// ---------------------------------------------------------------------------
// Helper: normalise UK phone to +44XXXXXXXXX for DB lookup
// ---------------------------------------------------------------------------
function normaliseUkPhoneForLookup(raw: string): string {
  const digits = raw.replace(/[^\d+]/g, '')
  if (/^\+447\d{9}$/.test(digits)) return digits
  if (/^00447\d{9}$/.test(digits)) return `+447${digits.slice(5)}`
  if (/^447\d{9}$/.test(digits)) return `+${digits}`
  if (/^07\d{9}$/.test(digits)) return `+44${digits.slice(1)}`
  return raw.trim() // fallback: return as-is for non-UK or unusual formats
}
