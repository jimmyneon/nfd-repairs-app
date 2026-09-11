import { NextRequest, NextResponse } from 'next/server'
import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { detectQuoteAcceptance } from '@/lib/quote-acceptance-detector'
import { sendViaMacroDroid } from '@/lib/resilience'
import { getFirstName, safeDeviceLabel } from '@/lib/sms-template'
import { shortTrackingLink, shortHoursLink } from '@/lib/utils'
import { getTurnaroundEstimate, getShortEta, calculateWorkloadFromJobs, type WorkloadInfo } from '@/lib/tracking-utils'

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

    // Support both JSON and form-encoded payloads (MacroDroid sends form-encoded)
    let body: any
    const contentType = request.headers.get('content-type') || ''
    if (contentType.includes('application/json')) {
      body = await request.json()
    } else {
      const formData = await request.formData()
      body = Object.fromEntries(formData.entries())
    }

    // Normalise field names: MacroDroid may send 'From'/'Body' or 'phone'/'message'
    const phone = body.phone || body.From || body.from || body.number || body.Number
    const message = body.message || body.Body || body.body || body.text || body.Text
    const timestamp = body.timestamp || body.Timestamp || body.ts || body.MessageSid || body.messageSid
    const threadId = body.threadId || body.thread_id || body.ThreadId

    if (!phone || !message) {
      return NextResponse.json(
        { error: 'Missing phone or message' },
        { status: 400 }
      )
    }

    console.log(`[sms/reply] === INBOUND SMS ===`)
    console.log(`[sms/reply] Raw phone: "${phone}"`)
    console.log(`[sms/reply] Message: "${message.substring(0, 120)}"`)
    console.log(`[sms/reply] Timestamp: ${timestamp || 'none'}`)
    console.log(`[sms/reply] ThreadId: ${threadId || 'none'}`)

    // Normalise phone for lookup. Jobs/enquiries may be stored as 07... or
    // +447... depending on how they were created. Build all possible variants
    // so the lookup always finds the matching record.
    const normalisedPhone = normaliseUkPhoneForLookup(phone)
    const lookupSet = new Set<string>([normalisedPhone, phone.trim()])
    // Also add the 07... form (strip +44 prefix)
    if (normalisedPhone.startsWith('+447')) {
      lookupSet.add('0' + normalisedPhone.slice(3))
    }
    // And the 447... form (no + prefix)
    if (normalisedPhone.startsWith('+447')) {
      lookupSet.add(normalisedPhone.slice(1))
    }
    const lookupPhones = Array.from(lookupSet).filter(Boolean)

    console.log(`[sms/reply] Normalised: "${normalisedPhone}"`)
    console.log(`[sms/reply] Lookup variants: ${JSON.stringify(lookupPhones)}`)

    // -----------------------------------------------------------------------
    // 1. Check for an active repair_quote enquiry
    //    BUT: if the message is clearly a status/update/collection query
    //    (not a quote acceptance), and the customer also has a job, route
    //    to the job handler instead. This prevents "can I pick it up?" from
    //    being swallowed by the enquiry handler when they have an active repair.
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
    console.log(`[sms/reply] Enquiry lookup: ${activeEnquiry ? `found ${activeEnquiry.enquiry_ref} (${activeEnquiry.status})` : 'none'}`)

    // Check if this message looks like a status/update query (not a quote response)
    const detectedIntent = detectSmsIntent(message)
    const looksLikeStatusQuery = detectedIntent !== null
    console.log(`[sms/reply] Intent: ${detectedIntent || 'null (unclear)'}`)

    if (activeEnquiry && !looksLikeStatusQuery) {
      console.log(`[sms/reply] → Routing to enquiry handler (${activeEnquiry.enquiry_ref})`)
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
      .select('id, job_ref, customer_name, customer_phone, status, device_make, device_model, issue, tracking_token, short_token, review_platforms_completed')
      .in('customer_phone', lookupPhones)
      .order('created_at', { ascending: false })
      .limit(1)

    const job = jobs?.[0]
    console.log(`[sms/reply] Job lookup: ${job ? `found ${job.job_ref} (${job.status}) ${job.customer_name}` : 'none'}`)

    if (job) {
      // --- Suppress auto-replies when staff are actively in conversation ---
      // If staff sent an SMS to this customer in the last 30 minutes, don't
      // send any auto-reply. The customer is talking to a human, not a bot.
      // Still log the message and notify staff.
      const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString()
      const { count: recentStaffSms } = await supabase
        .from('sms_logs')
        .select('id', { count: 'exact', head: true })
        .in('recipient_phone', lookupPhones)
        .eq('status', 'SENT')
        .gte('created_at', thirtyMinAgo)

      const staffInConversation = (recentStaffSms || 0) > 0
      console.log(`[sms/reply] Staff SMS in last 30min: ${recentStaffSms || 0} → suppress=${staffInConversation}`)

      if (staffInConversation) {
        console.log(`[sms/reply] Staff sent SMS to ${phone} in last 30min — suppressing auto-reply`)
      }

      // --- Rate limit auto-replies: 1 per 2 minutes per job ---
      // Prevents flooding from duplicate SMS delivery or rapid re-texting.
      // Customer messages are still logged and staff still notified,
      // but we don't send an auto-reply if we just sent one.
      const twoMinAgo = new Date(Date.now() - 2 * 60 * 1000).toISOString()
      const { count: recentAutoReplies } = await supabase
        .from('job_events')
        .select('id', { count: 'exact', head: true })
        .eq('job_id', job.id)
        .eq('type', 'SYSTEM')
        .like('message', 'Auto-reply sent:%')
        .gte('created_at', twoMinAgo)

      const autoReplyRateLimited = (recentAutoReplies || 0) > 0

      // Log the reply as a CUSTOMER_SMS event on the job (full chat history)
      await supabase.from('job_events').insert({
        job_id: job.id,
        type: 'CUSTOMER_SMS',
        message: message.substring(0, 500),
        metadata: {
          phone: normaliseUkPhoneForLookup(phone),
          timestamp: timestamp || new Date().toISOString(),
          thread_id: threadId || null,
        },
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

      console.log(`[sms/reply] Logged reply as CUSTOMER_SMS on job ${job.job_ref}`)

      // --- PAID detection: customer says they've paid the deposit ---
      // Only triggers if the job has a deposit required that hasn't been received yet
      if (/\b(paid|i.*ve.*paid|payment.*done|payment.*made|deposit.*paid|just.*paid|done.*pay|done.*payment|paid.*it|paid.*now|all.*paid|sorted.*it|sorted.*payment|sent.*payment|made.*payment)\b/i.test(message.toLowerCase())) {
        const jobData = await supabase
          .from('jobs')
          .select('id, deposit_required, deposit_received, deposit_amount, device_make, device_model, customer_name, short_token, tracking_token')
          .eq('id', job.id)
          .single()

        if (jobData.data?.deposit_required && !jobData.data?.deposit_received) {
          // Mark deposit as received
          await supabase
            .from('jobs')
            .update({
              deposit_received: true,
              deposit_received_at: new Date().toISOString(),
              status: 'PARTS_ORDERED',
              status_changed_at: new Date().toISOString(),
              parts_ordered_at: new Date().toISOString(),
            } as any)
            .eq('id', job.id)

          // Log the deposit payment event
          await supabase.from('job_events').insert({
            job_id: job.id,
            type: 'DEPOSIT_PAID',
            message: 'Customer confirmed deposit payment via SMS',
            metadata: {
              amount: jobData.data.deposit_amount || 20.00,
              source: 'sms_auto_detect',
              original_message: message.substring(0, 200),
            },
          })

          // Notify staff so they can actually order the parts
          try {
            await supabase.from('notifications').insert({
              type: 'DEPOSIT_PAID',
              title: `Deposit paid — order parts for ${job.job_ref}`,
              body: `${job.customer_name} has paid the £${(jobData.data.deposit_amount || 20).toFixed(2)} deposit for ${jobData.data.device_make || ''} ${jobData.data.device_model || ''}. Order the parts now.`,
              job_id: job.id,
              is_read: false,
            } as any)
          } catch (e) {
            console.error('[sms/reply] Failed to notify staff of deposit payment:', e)
          }

          // Send confirmation SMS
          const webhookUrl = process.env.MACRODROID_WEBHOOK_URL
          if (webhookUrl) {
            const smsBody = `Hi ${getFirstName(jobData.data.customer_name)}! �\n\nGot your deposit — thanks! Parts are being ordered now 💳\n\nUsually next-day delivery during working days. We will text you when they arrive.\n\nNFD Repairs`
            const result = await sendViaMacroDroid(webhookUrl, phone, smsBody)
            await logSms(supabase, 'DEPOSIT_CONFIRMED', smsBody, result.ok, job.id, phone)
          }

          console.log(`[sms/reply] Deposit auto-confirmed for job ${job.job_ref}`)
          return NextResponse.json({
            success: true,
            routed_to: 'deposit_paid',
            job_ref: job.job_ref,
            deposit_confirmed: true,
            sms_sent: !!process.env.MACRODROID_WEBHOOK_URL,
          })
        }
      }

      // --- Review completion detection ---
      // If customer says they've done a Google review, mark it and send Trustpilot link
      if (/\b(i.*ve.*done.*review|left.*review|done.*google|reviewed|posted.*review|done.*it|left.*google|finished.*review)\b/i.test(message.toLowerCase())) {
        const completed: string[] = job.review_platforms_completed || []
        if (!completed.includes('google')) {
          completed.push('google')
          await supabase
            .from('jobs')
            .update({ review_platforms_completed: completed } as any)
            .eq('id', job.id)

          // If Trustpilot not yet sent, send it now
          if (!completed.includes('trustpilot')) {
            const trustpilotLink = process.env.TRUSTPILOT_REVIEW_LINK || 'https://www.trustpilot.com'
            const webhookUrl = process.env.MACRODROID_WEBHOOK_URL
            if (webhookUrl) {
              const reviewBody = `Hi ${getFirstName(job.customer_name)} 👋\n\nThank you so much for the Google review — it really means a lot ⭐\n\nIf you have a spare minute, we would love a Trustpilot one too:\n${trustpilotLink}\n\nNo pressure at all — every review helps us a lot.\n\nNFD Repairs`
              const result = await sendViaMacroDroid(webhookUrl, phone, reviewBody)
              await logSms(supabase, 'REVIEW_FLIP_TRUSTPILOT', reviewBody, result.ok, job.id, phone)
            }
            console.log(`[sms/reply] Review flip: Google marked done, Trustpilot sent for ${job.job_ref}`)
            return NextResponse.json({
              success: true,
              routed_to: 'review_flip',
              job_ref: job.job_ref,
              flipped_to: 'trustpilot',
              sms_sent: !!process.env.MACRODROID_WEBHOOK_URL,
            })
          } else {
            // Both platforms done — just acknowledge
            const webhookUrl = process.env.MACRODROID_WEBHOOK_URL
            if (webhookUrl) {
              const ackBody = `Hi ${getFirstName(job.customer_name)} 👋\n\nThank you so much for leaving a review — we really appreciate it! ⭐\n\nNFD Repairs`
              const result = await sendViaMacroDroid(webhookUrl, phone, ackBody)
              await logSms(supabase, 'AUTO_REVIEW_ACK', ackBody, result.ok, job.id, phone)
            }
            return NextResponse.json({
              success: true,
              routed_to: 'review_ack',
              job_ref: job.job_ref,
              sms_sent: !!process.env.MACRODROID_WEBHOOK_URL,
            })
          }
        }
      }

      // --- Auto-detect common questions (deterministic, no AI) ---
      // Only auto-reply to unambiguous questions. Never jump into conversations.
      // If the message doesn't match any pattern, it falls through to staff notification.
      // Count how many status-type auto-replies we've already sent for this job
      // so we can rotate through different message variants.
      let statusSmsCount = 0
      try {
        const { count: autoCount } = await supabase
          .from('job_events')
          .select('id', { count: 'exact', head: true })
          .eq('job_id', job.id)
          .eq('type', 'SYSTEM')
          .like('message', 'Auto-reply sent: AUTO_STATUS_REPLY%')
        statusSmsCount = autoCount || 0
      } catch (e) {
        console.error('[sms/reply] Failed to count status SMS:', e)
      }

      const autoReply = await detectAutoReply(message, job, statusSmsCount, supabase)
      if (autoReply) {
        // Suppress if staff are in active conversation
        if (staffInConversation) {
          console.log(`[sms/reply] Auto-reply suppressed for job ${job.job_ref} — staff in conversation`)
          return NextResponse.json({
            success: true,
            routed_to: 'staff_in_conversation',
            job_ref: job.job_ref,
            sms_sent: false,
            reason: 'Staff sent SMS in last 30 min — message logged, no auto-reply',
          })
        }

        // Rate limit: skip sending if we just sent an auto-reply in the last 2 minutes
        if (autoReplyRateLimited) {
          console.log(`[sms/reply] Auto-reply rate limited for job ${job.job_ref} — sent one in last 2 min`)
          return NextResponse.json({
            success: true,
            routed_to: 'auto_reply_rate_limited',
            job_ref: job.job_ref,
            sms_sent: false,
            reason: 'Auto-reply sent in last 2 minutes — message logged, no SMS sent',
          })
        }

        const webhookUrl = process.env.MACRODROID_WEBHOOK_URL
        if (webhookUrl) {
          const result = await sendViaMacroDroid(webhookUrl, phone, autoReply.body)
          await logSms(supabase, autoReply.templateKey, autoReply.body, result.ok, job.id, phone)
        }
        // Log the auto-reply as a job event
        await supabase.from('job_events').insert({
          job_id: job.id,
          type: 'SYSTEM',
          message: `Auto-reply sent: ${autoReply.templateKey}`,
        })
        console.log(`[sms/reply] Auto-reply (${autoReply.templateKey}) sent for job ${job.job_ref}`)

        return NextResponse.json({
          success: true,
          routed_to: 'auto_reply',
          auto_reply_type: autoReply.templateKey,
          job_ref: job.job_ref,
          sms_sent: !!webhookUrl,
        })
      }

      // --- Fallback auto-reply for active jobs with unclear intent ---
      // If the customer has an active (not completed/collected) job and we
      // couldn't understand their message, send a helpful generic reply with
      // their tracking link and hours, rather than leaving them with nothing.
      // Still rate-limited by the 2-minute check above.
      // Suppressed when staff are in active conversation (last 30 min).
      const completedStatuses = ['COMPLETED', 'COLLECTED', 'READY_TO_COLLECT']
      if (!completedStatuses.includes(job.status) && !autoReplyRateLimited && !staffInConversation) {
        const webhookUrl = process.env.MACRODROID_WEBHOOK_URL
        if (webhookUrl) {
          const trackingLink = job.short_token ? shortTrackingLink(job.short_token) : shortTrackingLink(job.tracking_token)
          const firstName = getFirstName(job.customer_name)
          const fallbackBody = `Hi ${firstName} 👋\n\nThanks for your text — we've got your message and will get back to you.\n\nTrack your repair here: ${trackingLink}\nOur hours: ${shortHoursLink()}\n\nNFD Repairs`
          const result = await sendViaMacroDroid(webhookUrl, phone, fallbackBody)
          await logSms(supabase, 'AUTO_FALLBACK_REPLY', fallbackBody, result.ok, job.id, phone)
          await supabase.from('job_events').insert({
            job_id: job.id,
            type: 'SYSTEM',
            message: 'Auto-reply sent: AUTO_FALLBACK_REPLY',
          })
          console.log(`[sms/reply] Fallback auto-reply sent for job ${job.job_ref}`)
        }
      }

      // Also route to warranty ticket flow if the job is completed/collected
      // (existing behaviour — post-repair support)
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
    // 3. No match — orphan reply
    //    If the customer is asking about an existing repair (update, done,
    //    collection, turnaround), send "cannot find your number" reply.
    //    If asking about opening hours, send hours reply.
    //    Otherwise, send generic welcome with hours/quote link.
    //    Staff are always notified. Welcome is rate-limited to 1/day.
    // -----------------------------------------------------------------------
    console.log(`[sms/reply] → ORPHAN: No matching enquiry or job for ${phone}`)
    console.log(`[sms/reply] Orphan intent: ${detectSmsIntent(message) || 'null (unclear)'}`)

    const webhookUrl = process.env.MACRODROID_WEBHOOK_URL
    let orphanSmsSent = false

    // Check if this looks like a status/update query
    const orphanIntent = detectSmsIntent(message)
    if (orphanIntent === 'opening_hours') {
      // Customer is asking about opening hours/directions — send a helpful
      // reply with hours + directions, not the "cannot find a repair job" message.
      if (webhookUrl) {
        const hoursStatus = await computeHoursStatus(supabase)
        const hoursBody = buildHoursReply(hoursStatus)
        const result = await sendViaMacroDroid(webhookUrl, phone, hoursBody)
        await logSms(supabase, 'OPENING_HOURS_REPLY', hoursBody, result.ok, undefined, phone)
        orphanSmsSent = result.ok
        console.log(`[sms/reply] Sent opening hours reply to ${phone}`)
      }
    } else if (orphanIntent === 'update' || orphanIntent === 'done_check' || orphanIntent === 'collection' || orphanIntent === 'turnaround') {
      // These are clearly about an existing repair — send the "cannot find your
      // number" reply so the customer knows to text the booking number.
      if (webhookUrl) {
        const orphanBody = `Hi,\n\nWe cannot find a repair job linked to this phone number. If you booked your repair under a different number, please text us the number it is booked in under and we will find it straight away.\n\nNFD Repairs`
        const result = await sendViaMacroDroid(webhookUrl, phone, orphanBody)
        await logSms(supabase, 'ORPHAN_STATUS_REPLY', orphanBody, result.ok, undefined, phone)
        orphanSmsSent = result.ok
        console.log(`[sms/reply] Sent orphan status reply to ${phone}`)
      }
    } else if (webhookUrl) {
      // Not a clear status query (includes turnaround, location, and anything
      // not understood) — send the generic welcome message with useful links
      // rather than the unhelpful "cannot find a repair job" reply.
      // Rate-limited to 1 welcome per day per number to avoid flooding.
      // Only counts previous welcome messages, not all SMS — so if staff
      // had a conversation with the customer earlier, the customer still
      // gets a welcome if they text again later.
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
      const { count: recentWelcomeCount } = await supabase
        .from('sms_logs')
        .select('id', { count: 'exact', head: true })
        .eq('recipient_phone', phone)
        .eq('template_key', 'FIRST_TEXT_WELCOME')
        .gte('created_at', oneDayAgo)

      if ((recentWelcomeCount || 0) === 0) {
        const hoursStatus = await computeHoursStatus(supabase)
        const welcomeBody = buildWelcomeMessage(hoursStatus)
        const result = await sendViaMacroDroid(webhookUrl, phone, welcomeBody)
        await logSms(supabase, 'FIRST_TEXT_WELCOME', welcomeBody, result.ok, undefined, phone)
        orphanSmsSent = result.ok
        console.log(`[sms/reply] Sent first-text welcome to ${phone}`)
      } else {
        console.log(`[sms/reply] Welcome rate-limited for ${phone} (welcome sent in last 24h)`)
      }
    }

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
      sms_sent: orphanSmsSent,
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
  // EXCEPT for remind-later leads: these need a stock/parts check first,
  // so we mark the enquiry as accepted for staff action instead of
  // auto-creating a job.
  if (detection.classification === 'accept') {
    if (enquiry.commitment_type === 'remind_later') {
      return handleRemindLaterAcceptance({ supabase, enquiry, phone, webhookUrl })
    }
    return autoConvertEnquiry({ supabase, enquiry, phone, webhookUrl })
  }

  // ---- Medium confidence → send "Reply YES to confirm" prompt ----
  if (detection.classification === 'medium') {
    const deviceLabel = safeDeviceLabel(enquiry.device_make, enquiry.device_model)
    const smsBody = `Hi ${getFirstName(enquiry.customer_name)}! 👋\n\nJust to confirm — would you like to go ahead with the ${deviceLabel} repair${enquiry.quoted_price ? ` at £${enquiry.quoted_price}` : ''}?\n\nReply YES to book it in, or let me know if you have any questions.\n\nNFD Repairs`

    if (webhookUrl) {
      const result = await sendViaMacroDroid(webhookUrl, phone, smsBody)
      await logSms(supabase, 'QUOTE_CONFIRM_PROMPT', smsBody, result.ok, undefined, phone)
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

    const smsBody = `Hi ${getFirstName(enquiry.customer_name)} 👋\n\nNo problem at all. If you change your mind or need anything else in the future, just give us a call or text.\n\nTake care,\nNFD Repairs`

    if (webhookUrl) {
      const result = await sendViaMacroDroid(webhookUrl, phone, smsBody)
      await logSms(supabase, 'QUOTE_DECLINED_AUTO', smsBody, result.ok, undefined, phone)
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
// Handle acceptance from a Remind Me Later lead.
// Does NOT auto-create a job — staff must check stock/parts first.
// ---------------------------------------------------------------------------
async function handleRemindLaterAcceptance({
  supabase,
  enquiry,
  phone,
  webhookUrl,
}: {
  supabase: SupabaseClient<any, any, any>
  enquiry: any
  phone: string
  webhookUrl?: string
}) {
  const now = new Date().toISOString()

  // Mark enquiry as accepted for staff action, cancel any outstanding reminder
  await supabase
    .from('enquiries')
    .update({
      status: 'approved',
      proceed_with_repair: true,
      reminder_cancelled_at: now,
      updated_at: now,
    } as any)
    .eq('id', enquiry.id)

  // Notify staff: customer wants to proceed, check stock/parts
  await supabase.from('notifications').insert({
    type: 'ENQUIRY_ACCEPTED',
    title: 'Customer wants to proceed — check stock',
    body: `${enquiry.customer_name} replied YES to their saved quote for ${enquiry.device_make || ''} ${enquiry.device_model || ''}${enquiry.quoted_price ? ` (£${enquiry.quoted_price})` : ''}. Check parts availability before booking in.`,
    is_read: false,
  } as any)

  // Send customer acknowledgement
  if (webhookUrl) {
    const smsBody = `Hi ${getFirstName(enquiry.customer_name)}!\n\nThanks — we've got your request to go ahead with the ${safeDeviceLabel(enquiry.device_make, enquiry.device_model)} repair.\n\nWe'll check parts availability and text you with the next step. If a part needs ordering, we'll let you know before asking for any deposit.\n\nNFD Repairs`
    const result = await sendViaMacroDroid(webhookUrl, phone, smsBody)
    await logSms(supabase, 'REMIND_LATER_ACCEPTED', smsBody, result.ok, undefined, phone)
  }

  console.log(`[sms/reply] Remind-later enquiry ${enquiry.enquiry_ref} accepted, pending stock check`)

  return NextResponse.json({
    success: true,
    routed_to: 'remind_later_accepted',
    enquiry_ref: enquiry.enquiry_ref,
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

  // Generate job ref + tracking token + short token
  const { count: jobCount } = await supabase
    .from('jobs')
    .select('id', { count: 'exact', head: true })

  const jobRef = `NF-${String((jobCount || 0) + 1).padStart(5, '0')}`
  const trackingToken = crypto.randomUUID()
  const shortToken = Array.from(crypto.getRandomValues(new Uint8Array(3))).map(b => b.toString(16).padStart(2, '0')).join('')

  const jobData: Record<string, any> = {
    job_ref: jobRef,
    tracking_token: trackingToken,
    short_token: shortToken,
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
  const smsBody = `Hi ${getFirstName(enquiry.customer_name)}! 👋\n\nGreat news — your ${deviceLabel} repair is booked in ✅\n\nPop in with your device whenever you are ready — no appointment needed.\n\n📍 Opening hours: ${shortHoursLink()}\n🔗 Track your repair: ${shortTrackingLink(shortToken)}\n\nSee you soon!\nNFD Repairs`

  if (webhookUrl) {
    const result = await sendViaMacroDroid(webhookUrl, phone, smsBody)
    await logSms(supabase, 'QUOTE_ACCEPTED_AUTO', smsBody, result.ok, job.id, phone)
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
  jobId?: string,
  recipientPhone?: string
) {
  try {
    await supabase.from('sms_logs').insert({
      job_id: jobId || null,
      template_key: templateKey,
      body_rendered: body,
      status: ok ? 'SENT' : 'FAILED',
      sent_at: ok ? new Date().toISOString() : null,
      recipient_phone: recipientPhone || null,
    } as any)
  } catch (e) {
    console.error('[sms/reply] SMS log failed:', e)
  }
}

// ---------------------------------------------------------------------------
// Helper: compute opening hours status (reused from missed-call logic)
// ---------------------------------------------------------------------------
const FALLBACK_HOURS: Record<string, { isOpen: boolean; formatted: string; open?: string; close?: string }> = {
  Sunday:    { isOpen: false, formatted: 'Closed' },
  Monday:    { isOpen: true,  formatted: '10:00 AM - 5:00 PM', open: '10:00', close: '17:00' },
  Tuesday:   { isOpen: true,  formatted: '10:00 AM - 5:00 PM', open: '10:00', close: '17:00' },
  Wednesday: { isOpen: true,  formatted: '10:00 AM - 5:00 PM', open: '10:00', close: '17:00' },
  Thursday:  { isOpen: true,  formatted: '10:00 AM - 5:00 PM', open: '10:00', close: '17:00' },
  Friday:    { isOpen: true,  formatted: '10:00 AM - 5:00 PM', open: '10:00', close: '17:00' },
  Saturday:  { isOpen: true,  formatted: '10:00 AM - 3:00 PM', open: '10:00', close: '15:00' },
}

async function computeHoursStatus(supabase: SupabaseClient<any, any, any>): Promise<{
  isOpen: boolean
  todayFormatted: string
  nextOpen: string | null
  specialHours: { active?: boolean; note?: string | null; expiry_date?: string | null } | null
}> {
  let weeklyHours = FALLBACK_HOURS
  let specialHours: { active?: boolean; note?: string | null; expiry_date?: string | null } | null = null
  try {
    const { data: settings } = await supabase
      .from('admin_settings')
      .select('key, value')
      .in('key', ['opening_hours', 'special_hours'])
    if (settings && settings.length > 0) {
      for (const s of settings) {
        if (s.key === 'opening_hours' && s.value) {
          const parsed = typeof s.value === 'string' ? JSON.parse(s.value) : s.value
          if (parsed && typeof parsed === 'object') weeklyHours = parsed
        } else if (s.key === 'special_hours' && s.value) {
          const parsed = typeof s.value === 'string' ? JSON.parse(s.value) : s.value
          if (parsed && typeof parsed === 'object') {
            // Check expiry: if expiry_date is set and past, deactivate
            if (parsed.active && parsed.expiry_date) {
              const expiry = new Date(parsed.expiry_date + 'T23:59:59')
              if (expiry < new Date()) {
                console.log('[sms/reply] Special hours expired, ignoring:', parsed.expiry_date)
                parsed.active = false
              }
            }
            specialHours = parsed
          }
        }
      }
    }
  } catch (e) {
    console.error('[sms/reply] Failed to load opening hours, using fallback:', e)
  }

  const now = new Date()
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
  const ukParts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London',
    weekday: 'long',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(now)

  const weekdayPart = ukParts.find(p => p.type === 'weekday')?.value || days[now.getDay()]
  const hourPart = ukParts.find(p => p.type === 'hour')?.value || String(now.getHours())
  const minutePart = ukParts.find(p => p.type === 'minute')?.value || String(now.getMinutes())

  const currentDay = days.find(d => d.toLowerCase() === weekdayPart.toLowerCase()) || days[now.getDay()]
  const currentHour = parseInt(hourPart, 10)
  const currentMin = parseInt(minutePart, 10)
  const currentMins = currentHour * 60 + currentMin

  const todayHours = weeklyHours[currentDay] || FALLBACK_HOURS[currentDay]
  let isOpen = false
  if (todayHours?.isOpen && todayHours.open && todayHours.close) {
    const [openH, openM] = String(todayHours.open).split(':').map(Number)
    const [closeH, closeM] = String(todayHours.close).split(':').map(Number)
    isOpen = currentMins >= openH * 60 + openM && currentMins < closeH * 60 + closeM
  }

  let nextOpen: string | null = null
  if (!isOpen) {
    const todayIdx = days.indexOf(currentDay)
    for (let i = 0; i <= 7; i++) {
      const checkIdx = (todayIdx + i) % 7
      const checkDay = days[checkIdx]
      const checkHours = weeklyHours[checkDay]
      if (checkHours?.isOpen && checkHours.open) {
        if (i === 0) {
          const [openH] = String(checkHours.open).split(':').map(Number)
          if (currentHour < openH) {
            nextOpen = `today at ${checkHours.open}`
            break
          }
        } else {
          nextOpen = `${checkDay} at ${checkHours.open}`
          break
        }
      }
    }
  }

  return {
    isOpen,
    todayFormatted: todayHours?.formatted || 'Closed',
    nextOpen,
    specialHours,
  }
}

function buildWelcomeMessage(hoursStatus: {
  isOpen: boolean
  todayFormatted: string
  nextOpen: string | null
  specialHours: { active?: boolean; note?: string | null; expiry_date?: string | null } | null
}): string {
  const lines: string[] = ['Hi, thanks for texting New Forest Device Repairs! 👋']

  // Special hours / holiday notice takes priority
  if (hoursStatus.specialHours?.active && hoursStatus.specialHours?.note) {
    lines.push(hoursStatus.specialHours.note)
  } else if (hoursStatus.isOpen) {
    const closeTime = extractCloseTimeFromFormatted(hoursStatus.todayFormatted)
    lines.push(`We're open today until ${closeTime}.`)
  } else {
    if (hoursStatus.nextOpen) {
      lines.push(`We're closed now, back ${hoursStatus.nextOpen}.`)
    } else {
      lines.push(`We're closed now.`)
    }
  }

  lines.push('')
  lines.push('Get an instant repair price in 60 seconds:')
  lines.push('nfdr.uk/quote')
  lines.push('')
  lines.push('No need to book — just pop in. Hours & directions:')
  lines.push('nfdr.uk/h')
  lines.push('')
  lines.push('Existing repair? Reply UPDATE.')
  lines.push('Anything else? Just reply here.')
  lines.push('')
  lines.push('John')
  lines.push('NFD Repairs')

  return lines.join('\n')
}

function extractCloseTimeFromFormatted(hoursString: string): string {
  const match = hoursString.match(/-\s*(\d{1,2}:\d{2}\s*[AP]M)/i)
  return match ? match[1].trim() : hoursString
}

/**
 * Build a concise opening-hours reply for customers who text asking
 * "what time do you open?" etc. — works for both orphan (no job) and
 * active-job customers. Uses the same hoursStatus as the welcome message.
 */
function buildHoursReply(hoursStatus: {
  isOpen: boolean
  todayFormatted: string
  nextOpen: string | null
  specialHours: { active?: boolean; note?: string | null; expiry_date?: string | null } | null
}): string {
  const lines: string[] = ['Hi, thanks for texting New Forest Device Repairs! 👋']

  if (hoursStatus.specialHours?.active && hoursStatus.specialHours?.note) {
    lines.push(hoursStatus.specialHours.note)
  } else if (hoursStatus.isOpen) {
    const closeTime = extractCloseTimeFromFormatted(hoursStatus.todayFormatted)
    lines.push(`We're open today until ${closeTime}.`)
  } else {
    if (hoursStatus.nextOpen) {
      lines.push(`We're closed now, back ${hoursStatus.nextOpen}.`)
    } else {
      lines.push(`We're closed now.`)
    }
  }

  lines.push('')
  lines.push('No need to book — just pop in. Hours & directions:')
  lines.push('nfdr.uk/h')
  lines.push('')
  lines.push('Anything else? Just reply here.')
  lines.push('')
  lines.push('NFD Repairs')

  return lines.join('\n')
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

// ---------------------------------------------------------------------------
// Auto-reply detector: intent-based pattern matching for common questions
// Returns null if no match (falls through to staff notification)
// ---------------------------------------------------------------------------
type AutoReply = { templateKey: string; body: string }

/**
 * Intent types for SMS auto-reply.
 *
 * Different questions need different answers:
 * - "Can I pick it up?" → collection intent → answer focuses on whether it's
 *   ready AND opening hours
 * - "How long will it take?" → turnaround intent → answer gives ETA
 * - "Is it done?" → done check → yes/no answer
 * - "Update" / "Any news?" → general status → rotating status message
 */
type SmsIntent = 'collection' | 'turnaround' | 'done_check' | 'update' | 'location' | 'opening_hours'

/**
 * Detect the intent of a customer's SMS message.
 */
function detectSmsIntent(message: string): SmsIntent | null {
  const msg = message.toLowerCase().trim()

  // --- Standalone commands (short messages that are clearly commands) ---
  // "UPDATE", "update", "Updates" as the entire message = status request
  // This is what the welcome message tells customers to type.
  if (/^(update|updates|status)$/i.test(msg)) {
    return 'update'
  }

  // Words that exclude auto-reply (these are actions, not queries)
  // Only exclude clear action words — not descriptions like "broken" or
  // "cracked" which customers use when describing their problem alongside
  // a question like "how long will it take?"
  const excludeRegex = /\b(yes|no|book|proceed|go\s+ahead|accept|decline|cancel|paid|deposit|quote|price|how\s+much|cost)\b/i
  if (excludeRegex.test(msg)) return null

  // --- Location intent ("Where are you?", "What's your address?") ---
  if (/\b(where.*you|your.*address|find you|directions|location|where.*shop|where.*store)\b/i.test(msg)) {
    return 'location'
  }

  // --- Collection intent ("Can I pick it up?", "When can I collect?", "Come get it") ---
  const collectionPatterns: RegExp[] = [
    /\bcan\s+i\s+(pick|collect)\b/i,
    /\bcan\s+i\s+come\s+(get|pick|collect)\b/i,
    /\bready\s+to\s+(collect|pick)\b/i,
    /\bwhen\s+can\s+i\s+(pick|collect)\b/i,
    /\bshould\s+i\s+come\b/i,
    /\bshall\s+i\s+come\b/i,
    /\bcome\s+get\b/i,
    /\bcome\s+pick\b/i,
    /\bpick\s+it\s+up\b/i,
    /\bpick\s+\w+\s+up\b/i,
    /\bpick\s*up\b/i,
    /\bpickup\b/i,
    /\bcollect\b/i,
  ]
  if (collectionPatterns.some(re => re.test(msg))) {
    return 'collection'
  }

  // --- Opening hours intent ("What time do you open?", "When do you close?", "Opening times?") ---
  // Must be checked BEFORE turnaround, because "what time do you open" contains
  // "what time" which would otherwise match the turnaround pattern.
  if (/\b(what\s+time.*open|what\s+time.*close|when\s+(do|are).*open|when\s+(do|are).*close|opening\s+(times?|hours?)|closing\s+(times?|hours?)|what\s+are.*hours?|your\s+hours?|open\s+and\s+close)\b/i.test(msg)) {
    return 'opening_hours'
  }

  // --- Turnaround intent ("How long?", "How far along?", "When will it be ready?") ---
  // Note: "what time" is NOT included here — "what time" is almost always about
  // opening hours, not repair ETA. Opening hours is checked above.
  const turnaroundPatterns: RegExp[] = [
    /\bhow\s+long\b/i,
    /\bhow\s+far\s+along\b/i,
    /\bwhen\s+will\b/i,
    /\bwhen\s+is\b/i,
    /\bwhen\s+can\b/i,
    /\bwhen\s+ready\b/i,
    /\bwhen\s+done\b/i,
    /\bwhen\s+finished\b/i,
    /\bwhen\s+\w+\s+(be\s+)?(ready|done|finished)\b/i,
  ]
  if (turnaroundPatterns.some(re => re.test(msg))) {
    return 'turnaround'
  }

  // --- Done check intent ("Is it done?", "Is it ready?", "Done yet?") ---
  const donePatterns: RegExp[] = [
    /\bis\s+it\s+(ready|done|finished|fixed|sorted)\b/i,
    /\b(done|finished|fixed|sorted)\s+(yet|now)\b/i,
    /\byou\s+done\b/i,
    /\bare\s+you\s+done\b/i,
    /\bu\s+done\b/i,
    /\br\s+u\s+done\b/i,
    /\bhas\s+it\s+been\s+(done|fixed|sorted)\b/i,
    /\bhas\s+my\s+\w+\s+been\s+(done|fixed|sorted)\b/i,
    /\bis\s+my\s+\w+\s+(done|fixed|sorted|ready)\b/i,
    /\bphone\s+ready\b/i,
    /\bgot\s+my\s+\w+\s+ready\b/i,
    /\bready\s+yet\b/i,
  ]
  if (donePatterns.some(re => re.test(msg))) {
    return 'done_check'
  }

  // --- Update intent ("Any news?", "Status", "How's it going?") ---
  // Note: bare "update" is NOT matched here because it's too ambiguous —
  // customers often say "I need a software update" or "my phone needs an update"
  // when describing their repair problem, not asking for a status update.
  // Standalone "UPDATE" is handled at the top of this function.
  // "update on" is NOT matched because "software update on my phone" is a
  // common false positive. Customers who want a status update say "any updates?"
  // or "can I get an update?" or just "UPDATE".
  const updatePatterns: RegExp[] = [
    /\bany\s+updates?\b/i,
    /\bcan\s+i\s+get\s+an?\s+update\b/i,
    /\blooking\s+for\s+an?\s+update\b/i,
    /\bupdate\s+me\b/i,
    /\bwhat.?s\s+(the\s+)?status\b/i,
    /\bmy\s+status\b/i,
    /\bany\s+news\b/i,
    /\bany\s+word\b/i,
    /\bany\s+luck\b/i,
    /\bnot\s+heard\b/i,
    /\bprogress\b/i,
    /\bhow.?s\s+it\s+going\b/i,
    /\bhow\s+is\s+it\s+going\b/i,
    /\bhow.?s\s+(my|the)\s+\w+\s+(getting|going)\b/i,
    /\bhow\s+is\s+(my|the)\s+\w+\s+(getting|going)\b/i,
    /\bwhat.?s\s+happening\b/i,
    /\bwhat.?s\s+going\s+on\b/i,
    /\bwhere.?s?\s+my\s+(phone|device|repair|mobile|tablet|laptop)\b/i,
    /\bwhere\s+is\s+my\s+(phone|device|repair|mobile|tablet|laptop)\b/i,
  ]
  if (updatePatterns.some(re => re.test(msg))) {
    return 'update'
  }

  return null
}

/**
 * Get turnaround estimate text for a job.
 * Uses the same getTurnaroundEstimate engine as the tracking page,
 * then formats it for SMS. Also factors in parts lead time and workload.
 */
function getTurnaroundText(job: any, workload?: WorkloadInfo | null): string {
  const baseEstimate = getTurnaroundEstimate(
    job.device_make || '',
    job.device_model || '',
    job.issue || '',
    job.status || ''
  )

  // Determine parts lead time
  let partsLeadDays = 0
  if (job.status === 'PARTS_ORDERED' || job.status === 'AWAITING_DEPOSIT') {
    partsLeadDays = 2 // 2-3 working days for parts
  }

  return getShortEta(baseEstimate, workload || null, partsLeadDays)
}

/**
 * Query current workload from the database.
 * Fetches actual active job records (not just counts) so the workload engine
 * can calculate bench hours ahead and apply priority rules.
 */
async function queryWorkload(supabase: SupabaseClient, job: any): Promise<WorkloadInfo | null> {
  try {
    const activeStatuses = ['RECEIVED', 'IN_REPAIR', 'DIAGNOSTIC', 'PARTS_ARRIVED', 'AWAITING_DEVICE']
    const { data: activeJobs, error } = await supabase
      .from('jobs')
      .select('device_make, device_model, issue, status')
      .in('status', activeStatuses)

    if (error || !activeJobs) {
      console.error('[sms/reply] Failed to query active jobs for workload:', error)
      return null
    }

    return calculateWorkloadFromJobs(activeJobs, {
      device_make: job.device_make,
      device_model: job.device_model,
      issue: job.issue,
    })
  } catch (e) {
    console.error('[sms/reply] Failed to query workload:', e)
    return null
  }
}

/**
 * General status message variants (for "update" intent).
 * Rotates through 3 variants per status.
 */
const STATUS_SMS_VARIANTS: Record<string, string[]> = {
  QUOTE_APPROVED: [
    "We're ready for your device — bring it in whenever suits you during opening hours. No appointment needed!",
    "All sorted on our end — just pop in with your device whenever you're ready.",
    "We're ready to start! Drop in during opening hours and we'll get going straight away.",
  ],
  AWAITING_DEVICE: [
    "Great news — we have the parts in stock for your repair! Just bring your device in whenever suits you during opening hours. No appointment needed!",
    "We've got everything ready for your repair — just bring your device in whenever you're ready. No appointment needed!",
    "Parts are in stock and we're ready to go! Drop in with your device during opening hours and we'll start straight away.",
  ],
  RECEIVED: [
    "Your device is with us and in the queue. We'll text you the moment work starts — no need to chase us!",
    "We've got your device safely checked in. It's in the queue and we'll update you as soon as things get moving.",
    "Good news — your device is booked in and waiting for repair. We'll be in touch the minute there's progress.",
  ],
  IN_REPAIR: [
    "Your device is being worked on right now. We'll text you the second it's ready — sit tight!",
    "We're repairing your device as we speak. Getting it sorted for you — we'll text the moment it's done.",
    "Your repair is underway! We're working on it now and will text you the moment it's finished.",
  ],
  PARTS_ORDERED: [
    "We've ordered the parts for your device. They usually take 2-3 working days to arrive — we'll text you when they turn up.",
    "Parts are on order for your repair. Typically a 2-3 day wait, then we'll crack on with it. We'll let you know when they arrive.",
    "Your parts have been ordered and are on their way. We check deliveries every day and will text you the moment they're in.",
  ],
  PARTS_ARRIVED: [
    // These are used when device is NOT in shop — customer needs to bring it in
    "Good news — your parts have arrived! Bring your device in whenever suits you during opening hours and we'll get started.",
    "Parts are here! Whenever you're ready, just drop your device in during opening hours and we'll crack on with the repair.",
    "Your parts have landed! Bring your device in during opening hours and we'll get the repair done.",
  ],
  AWAITING_DEPOSIT: [
    "We need a £20 deposit to order your parts — they're special order. Pay here:\nhttps://pay.sumup.com/b2c/Q9OZOAJT\n\nReply PAID once done and we'll order them straight away.",
    "£20 deposit needed to order your parts. Pay here:\nhttps://pay.sumup.com/b2c/Q9OZOAJT\n\nReply PAID once done — usually next-day delivery.",
    "Your parts need ordering — £20 deposit to get started. Pay here:\nhttps://pay.sumup.com/b2c/Q9OZOAJT\n\nText PAID once done and we'll crack on.",
  ],
  READY_TO_COLLECT: [
    "Great news — your device is repaired and ready to collect! Pop in during opening hours: nfdr.uk/h",
    "Your device is all fixed and waiting for you! Come and grab it during our opening hours: nfdr.uk/h",
    "It's done! Your device is ready to collect. We're open: nfdr.uk/h — come whenever suits you.",
  ],
  COMPLETED: [
    "Your device is all repaired and ready to collect. Pop in during opening hours: nfdr.uk/h",
    "All done! Your device is fixed and waiting for you. Come grab it during opening hours: nfdr.uk/h",
    "Your repair's complete and ready for collection. We're open: nfdr.uk/h — see you soon!",
  ],
  COLLECTED: [
    "Your device has been collected — thanks for choosing us! If anything's not right, just text us here.",
    "All sorted — you've collected your device. Thanks for the business! Give us a shout if you need anything else.",
    "Thanks for coming in! Your device's all sorted. If you have any issues, just text us here anytime.",
  ],
  DIAGNOSTIC: [
    "We're checking your device over to see what's needed. We'll text you with our findings and a quote — no obligation until you're happy.",
    "Your device is in diagnostics — we're working out what's going on. We'll be in touch with a quote as soon as we know.",
    "We're testing your device to pin down the issue. Once we know what's needed, we'll text you with a price. No pressure to go ahead.",
  ],
}

/** Pick a variant based on how many times the customer has texted (rotates through) */
function pickVariant(status: string, messageCount: number): string | null {
  const variants = STATUS_SMS_VARIANTS[status]
  if (!variants || variants.length === 0) return null
  return variants[messageCount % variants.length]
}

/** Fallback for statuses not in the variants table */
function fallbackStatusMessage(status: string): string {
  const readable = status.replace(/_/g, ' ').toLowerCase()
  return `Your repair is at the ${readable} stage. We'll text you as soon as there's an update.`
}

/**
 * Build a collection-specific response.
 * Answers "Can I pick it up?" / "When can I collect?"
 */
function buildCollectionReply(job: any, smsCount: number): string {
  const firstName = getFirstName(job.customer_name)
  const hoursLink = shortHoursLink()
  const status = job.status

  // Ready to collect
  if (status === 'READY_TO_COLLECT' || status === 'COMPLETED') {
    const variants = [
      `Yes! ✅ Your device is ready to collect. Pop in during opening hours: ${hoursLink}`,
      `It's all done and waiting for you! ✅ Come grab it whenever we're open: ${hoursLink}`,
      `Good news — it's ready! ✅ Come in whenever suits you: ${hoursLink}`,
    ]
    return `Hi ${firstName} 👋\n\n${variants[smsCount % variants.length]}\n\nNFD Repairs`
  }

  // Already collected
  if (status === 'COLLECTED') {
    return `Hi ${firstName} 👋\n\nYour device was already collected — hope all's well! If something's not right, just text us here.\n\nNFD Repairs`
  }

  // Not ready yet — tell them current status + when to expect
  if (status === 'IN_REPAIR') {
    const variants = [
      "Not yet — we're still working on it. We'll text you the second it's ready to collect.",
      "Still being repaired, I'm afraid. We'll give you a buzz the moment it's done and ready for you.",
      "Not quite there yet — we're still fixing it. We'll text you as soon as it's ready to pick up.",
    ]
    return `Hi ${firstName} 👋\n\n${variants[smsCount % variants.length]}\n\nOur hours: ${hoursLink}\nNFD Repairs`
  }

  if (status === 'PARTS_ORDERED') {
    const variants = [
      "Not yet — we're still waiting on parts to arrive. They usually take 2-3 working days. We'll text you the moment it's ready.",
      "Still waiting on parts, I'm afraid. Once they arrive we'll crack on with the repair and text you when it's done.",
      "Not yet — parts are on their way. We'll text you as soon as the repair's finished and it's ready to collect.",
    ]
    return `Hi ${firstName} 👋\n\n${variants[smsCount % variants.length]}\n\nOur hours: ${hoursLink}\nNFD Repairs`
  }

  if (status === 'PARTS_ARRIVED') {
    if (job.device_in_shop) {
      const variants = [
        "Not yet — parts have just arrived and we're starting on it now. Shouldn't be too long! We'll text when it's ready.",
        "Almost there — parts are in and we're working on it. We'll text you the moment it's ready to collect.",
        "Not quite — we've just started the repair with the new parts. We'll text you as soon as it's done.",
      ]
      return `Hi ${firstName} 👋\n\n${variants[smsCount % variants.length]}\n\nOur hours: ${hoursLink}\nNFD Repairs`
    } else {
      // Device still with customer
      return `Hi ${firstName} 👋\n\nNot yet — the parts have arrived but we need your device first! Bring it in during opening hours and we'll get started straight away.\n\nOur hours: ${hoursLink}\nNFD Repairs`
    }
  }

  if (status === 'AWAITING_DEVICE' || (status === 'QUOTE_APPROVED' && !job.device_in_shop)) {
    return `Hi ${firstName} 👋\n\nNot yet — we've got the parts in stock, but we need your device first! Bring it in during opening hours and we'll get started.\n\nOur hours: ${hoursLink}\nNFD Repairs`
  }

  if (status === 'RECEIVED' || status === 'QUOTE_APPROVED') {
    const variants = [
      "Not yet — your device is in the queue. We'll text you the moment work starts and again when it's ready to collect.",
      "Still in the queue, I'm afraid. We'll text you as soon as we start on it and again when it's ready.",
      "Not yet — we've got it checked in and waiting. We'll text you the moment it's ready to pick up.",
    ]
    return `Hi ${firstName} 👋\n\n${variants[smsCount % variants.length]}\n\nOur hours: ${hoursLink}\nNFD Repairs`
  }

  if (status === 'AWAITING_DEPOSIT') {
    return `Hi ${firstName} 👋\n\nNot yet — we need a £20 deposit to order parts before we can start the repair. You can pay it here:\nhttps://pay.sumup.com/b2c/Q9OZOAJT\n\nOnce it's paid we'll get parts ordered straight away. Give us a text if you have any questions.\n\nNFD Repairs`
  }

  if (status === 'DIAGNOSTIC') {
    return `Hi ${firstName} 👋\n\nNot yet — we're still checking your device over. We'll text you with a quote and then we can get started.\n\nNFD Repairs`
  }

  // Fallback
  const statusInfo = pickVariant(status, smsCount) || fallbackStatusMessage(status)
  return `Hi ${firstName} 👋\n\n${statusInfo}\n\nOur hours: ${hoursLink}\nNFD Repairs`
}

/**
 * Build a turnaround-specific response.
 * Answers "How long will it take?" / "When will it be ready?"
 */
function buildTurnaroundReply(job: any, smsCount: number, workload?: WorkloadInfo | null): string {
  const firstName = getFirstName(job.customer_name)
  const hoursLink = shortHoursLink()
  const status = job.status
  const eta = getTurnaroundText(job, workload)
  // Strip leading "about " or "Around " if present, since templates add their own "about"
  const cleanEta = eta.replace(/^(about|Around)\s+/i, '')

  // Already done
  if (status === 'READY_TO_COLLECT' || status === 'COMPLETED') {
    return `Hi ${firstName} 👋\n\nIt's already done and ready to collect! Pop in whenever we're open: ${hoursLink}\n\nNFD Repairs`
  }

  if (status === 'COLLECTED') {
    return `Hi ${firstName} 👋\n\nYour device was already collected — hope all's well! If anything's not right, just text us.\n\nNFD Repairs`
  }

  // In repair — give ETA from this point
  if (status === 'IN_REPAIR') {
    const variants = [
      `We're working on it right now — should be about ${cleanEta} from when we started. We'll text you the moment it's done.`,
      `Currently being repaired — typically ${cleanEta} for this type of job. We'll text you as soon as it's ready.`,
      `We're on it! Expect about ${cleanEta} for this repair. We'll be in touch the second it's finished.`,
    ]
    return `Hi ${firstName} 👋\n\n${variants[smsCount % variants.length]}\n\nNFD Repairs`
  }

  // Parts ordered — add parts wait + repair time
  if (status === 'PARTS_ORDERED') {
    const variants = [
      `Parts take 2-3 working days to arrive, then the repair itself is about ${cleanEta}. We'll text you at every step.`,
      `We're waiting on parts (2-3 days), then it's about ${cleanEta} to do the repair. We'll let you know when parts land.`,
      `Once parts arrive (usually 2-3 days), the repair takes about ${cleanEta}. We'll text you the moment it's ready.`,
    ]
    return `Hi ${firstName} 👋\n\n${variants[smsCount % variants.length]}\n\nNFD Repairs`
  }

  // Parts arrived — depends on whether device is in shop
  if (status === 'PARTS_ARRIVED') {
    if (job.device_in_shop) {
      const variants = [
        `Parts are here! The repair itself should take about ${cleanEta}. We'll text you when it's ready to collect.`,
        `Parts just landed — now it's about ${cleanEta} to do the repair. We'll be in touch the moment it's done.`,
        `Good news — parts are in. Expect about ${cleanEta} for the repair. We'll text you as soon as it's finished.`,
      ]
      return `Hi ${firstName} 👋\n\n${variants[smsCount % variants.length]}\n\nNFD Repairs`
    } else {
      // Device still with customer
      return `Hi ${firstName} 👋\n\nGood news — the parts have arrived! Once you bring your device in, the repair itself takes about ${cleanEta}.\n\nOur hours: ${hoursLink}\nNFD Repairs`
    }
  }

  // In queue — full estimate
  if (status === 'RECEIVED' || status === 'QUOTE_APPROVED' || status === 'AWAITING_DEVICE') {
    if (status === 'AWAITING_DEVICE' || (status === 'QUOTE_APPROVED' && !job.device_in_shop)) {
      // Device still with customer, parts in stock
      return `Hi ${firstName} 👋\n\nWe've got the parts in stock — once you bring your device in, this type of repair takes about ${cleanEta}. No appointment needed!\n\nOur hours: ${hoursLink}\nNFD Repairs`
    }
    const variants = [
      `Once we start on it, this type of repair takes about ${cleanEta}. Your device is in the queue — we'll text you the moment work begins.`,
      `Typically ${cleanEta} for this repair once we get started. It's in the queue and we'll text you as soon as we crack on.`,
      `This repair is usually about ${cleanEta}. We'll text you the moment we start working on it.`,
    ]
    return `Hi ${firstName} 👋\n\n${variants[smsCount % variants.length]}\n\nNFD Repairs`
  }

  // Awaiting deposit
  if (status === 'AWAITING_DEPOSIT') {
    return `Hi ${firstName} 👋\n\nWe need a £20 deposit to order parts first. Once that's paid, parts take 2-3 days to arrive and then the repair is about ${cleanEta}.\n\nPay the deposit here:\nhttps://pay.sumup.com/b2c/Q9OZOAJT\n\nGive us a text if you have any questions.\n\nNFD Repairs`
  }

  // Diagnostic
  if (status === 'DIAGNOSTIC') {
    return `Hi ${firstName} 👋\n\nWe're still checking your device over. Once we know what's needed, we'll text you a quote and an ETA. Shouldn't be too long.\n\nNFD Repairs`
  }

  // Fallback
  const statusInfo = pickVariant(status, smsCount) || fallbackStatusMessage(status)
  return `Hi ${firstName} 👋\n\n${statusInfo}\n\nNFD Repairs`
}

/**
 * Build a done-check response.
 * Answers "Is it done?" / "Is it ready?" / "Done yet?"
 */
function buildDoneCheckReply(job: any, smsCount: number): string {
  const firstName = getFirstName(job.customer_name)
  const hoursLink = shortHoursLink()
  const status = job.status

  // Yes, it's done!
  if (status === 'READY_TO_COLLECT' || status === 'COMPLETED') {
    const variants = [
      `Yes! ✅ It's all done and ready to collect. Pop in during opening hours: ${hoursLink}`,
      `Done and dusted! ✅ Come grab it whenever we're open: ${hoursLink}`,
      `Yes, it's finished! ✅ Ready for collection — come in whenever suits you: ${hoursLink}`,
    ]
    return `Hi ${firstName} 👋\n\n${variants[smsCount % variants.length]}\n\nNFD Repairs`
  }

  if (status === 'COLLECTED') {
    return `Hi ${firstName} 👋\n\nYes — it was done and you've already collected it. Hope all's well! If anything's not right, just text us.\n\nNFD Repairs`
  }

  // No, not yet
  if (status === 'IN_REPAIR') {
    const variants = [
      "Not yet — we're still working on it. We'll text you the second it's done.",
      "Still in progress, I'm afraid. We'll text you the moment it's finished.",
      "Not quite — still being repaired. We'll be in touch as soon as it's done.",
    ]
    return `Hi ${firstName} 👋\n\n${variants[smsCount % variants.length]}\n\nNFD Repairs`
  }

  if (status === 'PARTS_ORDERED') {
    const variants = [
      "Not yet — still waiting on parts to arrive. We'll text you once they're in and we start the repair.",
      "Not yet, I'm afraid — parts are on order. We'll text you as soon as the repair's done.",
      "Still waiting on parts. Once they arrive we'll crack on and text you the moment it's finished.",
    ]
    return `Hi ${firstName} 👋\n\n${variants[smsCount % variants.length]}\n\nNFD Repairs`
  }

  if (status === 'PARTS_ARRIVED') {
    if (job.device_in_shop) {
      const variants = [
        "Not yet — parts just arrived and we're starting now. We'll text you when it's done.",
        "Not quite — we've just started the repair with the new parts. We'll text you the moment it's finished.",
        "Almost — parts are in and we're on it. We'll text you as soon as it's done.",
      ]
      return `Hi ${firstName} 👋\n\n${variants[smsCount % variants.length]}\n\nNFD Repairs`
    } else {
      return `Hi ${firstName} 👋\n\nNot yet — the parts are here but we need your device! Bring it in during opening hours and we'll get started.\n\nOur hours: ${hoursLink}\nNFD Repairs`
    }
  }

  if (status === 'AWAITING_DEVICE' || (status === 'QUOTE_APPROVED' && !job.device_in_shop)) {
    return `Hi ${firstName} 👋\n\nNot yet — we've got the parts ready but we need your device! Bring it in during opening hours and we'll get started.\n\nOur hours: ${hoursLink}\nNFD Repairs`
  }

  if (status === 'RECEIVED' || status === 'QUOTE_APPROVED') {
    const variants = [
      "Not yet — it's in the queue. We'll text you the moment we start on it and again when it's done.",
      "Not yet, I'm afraid — still waiting to be started. We'll text you as soon as it's finished.",
      "Not yet — it's checked in and in the queue. We'll text you the moment it's done.",
    ]
    return `Hi ${firstName} 👋\n\n${variants[smsCount % variants.length]}\n\nNFD Repairs`
  }

  if (status === 'AWAITING_DEPOSIT') {
    return `Hi ${firstName} 👋\n\nNot yet — we need a £20 deposit to order parts before we can start. You can pay it here:\nhttps://pay.sumup.com/b2c/Q9OZOAJT\n\nOnce it's paid we'll get parts ordered straight away. Give us a text if you have any questions.\n\nNFD Repairs`
  }

  if (status === 'DIAGNOSTIC') {
    return `Hi ${firstName} 👋\n\nNot yet — we're still checking your device over. We'll text you with a quote and then we can get started.\n\nNFD Repairs`
  }

  // Fallback
  const statusInfo = pickVariant(status, smsCount) || fallbackStatusMessage(status)
  return `Hi ${firstName} 👋\n\n${statusInfo}\n\nNFD Repairs`
}

/**
 * Build a general update response (for "update", "any news", "status", etc.)
 */
function buildUpdateReply(job: any, smsCount: number): AutoReply {
  const firstName = getFirstName(job.customer_name)
  const trackingLink = job.short_token ? shortTrackingLink(job.short_token) : shortTrackingLink(job.tracking_token)
  const statusInfo = pickVariant(job.status, smsCount) || fallbackStatusMessage(job.status)
  return {
    templateKey: 'AUTO_STATUS_REPLY',
    body: `Hi ${firstName} 👋\n\n${statusInfo}\n\nTrack it here: ${trackingLink}\nOur hours: ${shortHoursLink()}\n\nNFD Repairs`,
  }
}

async function detectAutoReply(message: string, job: any, smsCount: number = 0, supabase?: SupabaseClient): Promise<AutoReply | null> {
  const intent = detectSmsIntent(message)

  if (!intent) return null

  // --- Location intent ---
  if (intent === 'location') {
    return {
      templateKey: 'AUTO_LOCATION_REPLY',
      body: `Hi ${getFirstName(job.customer_name)},\n\nHere's where we are and our opening hours: nfdr.uk/h\n\nNFD Repairs`,
    }
  }

  // --- Opening hours intent ---
  if (intent === 'opening_hours') {
    return {
      templateKey: 'AUTO_OPENING_HOURS_REPLY',
      body: `Hi ${getFirstName(job.customer_name)} 👋\n\nOur opening hours and directions: nfdr.uk/h\n\nNFD Repairs`,
    }
  }

  // --- Collection intent ---
  if (intent === 'collection') {
    return {
      templateKey: 'AUTO_COLLECTION_REPLY',
      body: buildCollectionReply(job, smsCount),
    }
  }

  // --- Turnaround intent — query workload for accurate ETA ---
  if (intent === 'turnaround') {
    let workload: WorkloadInfo | null = null
    if (supabase) {
      workload = await queryWorkload(supabase, job)
    }
    return {
      templateKey: 'AUTO_TURNAROUND_REPLY',
      body: buildTurnaroundReply(job, smsCount, workload),
    }
  }

  // --- Done check intent ---
  if (intent === 'done_check') {
    return {
      templateKey: 'AUTO_DONE_CHECK_REPLY',
      body: buildDoneCheckReply(job, smsCount),
    }
  }

  // --- Update intent (default) ---
  return buildUpdateReply(job, smsCount)
}
