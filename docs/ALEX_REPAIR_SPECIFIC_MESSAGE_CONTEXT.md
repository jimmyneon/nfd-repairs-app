# Alex: repair-specific message context and procedure reinforcement

**Status:** Implementation specification / audit — not deployed  
**Date:** 23 November 2026  
**Owner:** New Forest Device Repairs  
**Primary codebases:** jimmyneon/nfd-repairs-app (repair records / messages) and jimmyneon/AiDesk (Alex voice receptionist)

## 1. Goal

When a customer phones after the team has already emailed or texted them, Alex should be able to identify the **specific repair or enquiry**, read the relevant prior correspondence and its current next action, then politely reinforce the existing process.

Do **not** start a new intake process, invent a booking, promise a part order, imply the owner will call back, or let a phone conversation replace the required written reply.

Example: "I can see the team sent a message about your repair and is waiting for a reply. Please open that message and reply directly to it so your details stay with the repair."

**Important:** Say "we sent you a message" rather than "you received it" unless delivery is confirmed. Neither sent status nor delivery confirmation proves the customer actually read it.

## 2. Findings — checked against the repair app GitHub code AND live Supabase schema

The live repair app database is Supabase project **repair app**; the following source locations were checked on the main branch.

| Location | Current behaviour | Consequence |
| --- | --- | --- |
| supabase/migrations/20260911130000_create_conversation_messages_view.sql | Unified view combines outbound sms_logs, inbound CUSTOMER_SMS job_events, outbound SMS_SENT job_events, outbound email_logs, and inbound enquiry customer_notes | There are useful per-job/per-enquiry IDs, but no complete all-channel conversation record |
| app/api/conversations/route.ts | Can filter by phone, job_id, enquiry_id; combines supplied filters | Querying phone plus job ID excludes outbound email rows with null phone; querying both job and enquiry IDs also excludes the opposite type |
| app/api/conversations/inbox/route.ts | Inbox groups by phone and chooses a job/enquiry ID from any of that phone's messages | Distinct repairs from the same phone may be displayed or contextualised together; email rows with null phone collect under "(unknown)" |
| app/api/conversations/search/route.ts | Search results grouped by phone; job/name may be assigned based on phone lookup | Search results are not reliably repair-specific |
| app/api/sms/reply/route.ts | Inbound SMS routes using phone, latest open quote enquiry, and pickBestJob across candidate jobs; threadId is recorded as metadata on job events | A reply can be assigned using a heuristic, not a proven repair/thread identity; no-match messages become staff notifications rather than conversation_messages rows |
| app/api/macrodroid/sms-sent/route.ts | Manual/outbound phone SMS attempts to assign latest job found for phone, and logs sms_logs plus an SMS_SENT job event | Can attach a manual text to the wrong repair when customer has several jobs; unified view can contain duplicate/outbound-summary rows |
| app/api/email/send/route.ts and app/api/sms/send-custom/route.ts | Outbound emails can be stored with job_id in email_logs | This covers some app-sent email, not all emails John might send elsewhere |
| app/api/email/send-link/route.ts | AI Desk may send email via this route without an email_logs write here | Alex-sent emails via this path may be absent from the repair app conversation view |
| live public.conversation_messages view | Outbound email records have job_id but null phone; no inbound email branch | Alex currently cannot determine from this view whether a customer replied to an email |
| app/api/conversations/** routes | GET endpoints use the Supabase service-role client without a staff/bearer authorisation check in those handlers | **Security blocker:** do not expose or reuse these endpoints for Alex before securing them |

### Recent volume (live database, last 60 days as of 23 November 2026)

The conversation view has **1,054 outbound SMS rows without a job/enquiry ID**, **695 outbound SMS rows with a job ID**, **146 inbound SMS job rows**, **28 inbound SMS enquiry rows**, and **194 outbound email job rows**. These are **view rows, not necessarily unique communications**, and an unlinked row is not automatically an error (e.g. legitimate pre-booking contact). The volume makes repair-level attribution important.

Other schema observations: jobs has id, job_ref, customer_phone, customer_email, quote_request_id and conversation_id; enquiries has id, enquiry_ref, converted_job_id; job_events and sms_logs use job_id; email_logs has job_id but no email thread identifier; enquiry SMS notes live in customer_notes text containing JSON.

## 3. Target behaviour for Alex on calls

1. For a repeat caller, quietly retrieve a **read-only customer communication context** before deciding what has already happened. If no specific matching job/enquiry is confirmed, do not guess.
2. Identify the particular repair/enquiry by verified job reference or enquiry reference. Caller number is only a candidate lookup. If there are multiple plausible repairs, ask a simple distinguishing question such as which device they mean; never merge histories.
3. Retrieve that repair's recent, relevant outbound messages (email and SMS), inbound replies, quote/enquiry status, next required action, and where to reply.
4. Distinguish **sent**, **failed**, **delivered if reliably tracked**, and **customer replied**. Only say "we're waiting for a reply" if the relevant channel's inbound replies are checked and that is still accurate. When incoming email isn't captured, say "the last update I can see was our email" instead.
5. Explain the next action calmly, briefly and consistently. Point them back to **the same written channel/thread used for that repair** — email reply to email, SMS reply to SMS; never create a competing telephone trail.
6. If the customer says they never got the message, check the destination and sending status; suggest junk/spam for email. Alex may briefly **summarise the actual verified message**, but must still instruct them to reply in writing. Offer a controlled resend of the *original* message/thread only after an appropriate send/resend tool exists and reports success.
7. If an intake/booking form is required and incomplete, direct them to complete the existing form link. Do not give later-stage instructions, offer an unconfirmed drop-off, or say a part has been ordered.
8. If the staff request asks for a password, problem description, quote approval, timing, deposit, or other decision, repeat the specific request without guessing the answer. Do not read aloud passwords, payment secrets, private notes, or unrelated information.
9. If the customer says they have already replied but email reply visibility is unavailable, acknowledge it and flag for staff verification; **do not contradict them**. The call itself is not evidence that the original email has been answered.
10. If the lookup is missing, ambiguous, stale, or fails, Alex must not invent correspondence. Offer the established written route and create a concise staff task with the call reference.

### Suggested spoken wording (adapt naturally; don't read a rigid script)

- **Awaiting written answer:** "I can see the team sent you an email about your [device] repair. Could you reply directly to that email, please? It keeps everything together so they can move it forward."
- **Customer asks to explain it:** "Of course. The message asks you to [short, verified request]. Please send your answer as a reply to the original email so it goes onto the repair record."
- **Customer cannot locate it:** "No problem. Have a look in your junk folder as well. If it isn't there, I can help arrange for the message to be resent."
- **Form not completed:** "The next step is to fill in the repair form using the link we sent. Once that's submitted, the team can confirm the next steps."
- **Multiple repairs on same number:** "Is this about the [first device] or the [second device]?" Only mention device details if the caller is sufficiently verified for disclosure.
- **Cannot verify reply status:** "The latest update I can see is the message we sent. I'll flag your reply for the team to check."

Tone: very polite, patient, brief and firm on the procedure; never chastise callers for phoning.

## 4. Repair-specific linking rules (critical)

**Never treat a phone number as the conversation identifier.**

- Primary identity: immutable job.id or enquiry.id, confirmed by job_ref/enquiry_ref and matching customer identity.
- Preserve origin linkage: jobs.quote_request_id ↔ enquiries.id and enquiries.converted_job_id ↔ jobs.id. If enquiry converts, retain its earlier written history, but clearly mark the original enquiry and the current job.
- Store every outgoing communication with job_id or enquiry_id (where known), channel, message body, external message ID, origin, timestamp, sending result and reply destination.
- Route incoming messages by signed provider/external message thread ID (email In-Reply-To/References/Message-ID; SMS service thread ID only when genuinely repair-specific), explicit job/enquiry reference, or a staff-approved link; caller phone alone may narrow candidates but is not enough to attach it conclusively where several repairs are possible.
- For historical records linked only by phone, expose as **unassigned candidate messages**, not verified context. Do not silently backfill them to the newest job.
- Where a customer has multiple open jobs or enquiries and no reliable thread/job association exists, mark **ambiguous** and request clarification or staff linking.
- Show communications in date order, labelled by job/enquiry, channel, sender, and status. Separate unrelated jobs even when phone/email are identical.
- Use an explicit 'awaiting_customer_response' or 'next_required_action' record per job/enquiry, set/cleared by verified staff workflows and inbound replies. Do not infer it merely from the newest phone message.

### Recommended future canonical table

A normalised communication_messages table or equivalent with:
- id; job_id nullable; enquiry_id nullable; customer_id nullable
- channel (sms/email); direction; body/subject; sender identity; recipient
- provider_message_id; provider_thread_id; parent_message_id
- sent_at; delivered_at; received_at; status; source (staff/system/Alex/provider)
- action_required; action_type; action_resolved_at; original_message_id
- association_source / confidence; needs_staff_linking; redacted customer-safe content

Keep legacy sms_logs, email_logs, job_events and enquiry notes operational during migration, and avoid duplicating the same SMS from MacroDroid tracking. Backfill only when attribution is certain.

## 5. Private API Alex can safely use

Implement a **new read-only authenticated endpoint**, for example POST /api/ai-desk/communication-context, rather than exposing the existing public conversation APIs.

Input: caller phone and optional verified job_ref/enquiry_ref (and/or explicit job_id/enquiry_id from trusted caller workflow), plus a bounded limit. Output only the *confirmed* repair/enquiry context, safe customer-facing latest messages, contact channel, last verified send status, last verified reply, required action, and ambiguity/visibility flags. An example response shape:

    {
      "match_status": "confirmed | ambiguous | not_found",
      "job_ref": "REF",
      "enquiry_ref": null,
      "device_label": "device summary",
      "last_outbound": {
        "channel": "email",
        "subject": "Repair update",
        "summary": "The customer was asked to confirm a repair option",
        "sent_status": "SENT",
        "sent_at": "ISO timestamp"
      },
      "inbound_checked": { "sms": true, "email": false },
      "awaiting_customer_response": null,
      "next_required_action": "reply_to_existing_email",
      "reply_channel": "email",
      "can_resend": false
    }

Do not accept arbitrary phone/job IDs as sufficient authorisation for a public client. Authenticate the service call with a dedicated scoped server-to-server credential, strict input validation, per-call auditing, request limits and rate limits; use a carefully scoped query and minimise PII. Avoid exposing full private staff notes or customer passwords. Verify identity before reading repair details to an incoming caller; caller ID alone is spoofable.

**Security prerequisite:** add proper staff/service authentication to app/api/conversations/route.ts, inbox/route.ts and search/route.ts, with explicit checks before using the Supabase service-role client. Review RLS / view grants as part of the rollout; the unified view can bypass base-table RLS unless configured correctly.

## 6. AI Desk integration (jimmyneon/AiDesk)

- lib/connectors/types.ts: introduce a getRepairCommunicationContext method and typed safe response.
- lib/connectors/nfdr.ts: call the new private repair app endpoint via authenticated server-to-server fetch; do not use public service-role credentials in AiDesk.
- lib/openai/tools.ts and tool dispatch: add a get_repair_communication_context tool that supports caller number plus confirmed reference. The existing get_job_status tool is mainly phone-based and does **not** provide correspondence.
- lib/openai/receptionist-prompt.ts and the business-specific instructions: instruct Alex to consult context for returning callers, repeat the **actual outstanding written request**, and redirect answers to the original written thread. Keep current boundaries on not promising bookings, parts, prices or callbacks.
- Distinguish the live voice receptionist AiDesk from legacy NFDRai text-responder; do not assume either already reads the repair app conversation view.
- Preserve current service when context tool is unavailable: Alex should never claim to have inspected correspondence if lookup failed.

## 7. Email completeness and reply detection

At present the repair app conversation view only includes **outbound email logs**; it has no inbound-email row source and its email_log records do not carry Message-ID/References thread linkage. Any correspondence sent manually outside app logging may also be missing.

Before Alex can reliably state **"we're waiting for a reply to our email"**, implement inbound email ingestion through the chosen mailbox/provider (message/thread IDs, verified sender, received timestamp), and link replies to the initiating job/enquiry. Where emails go through different systems, choose one authoritative mailbox or integrate those channels. If not available, explicitly return inbound_checked.email=false and avoid absolute no-reply claims.

A failed or pending outbound send must never be narrated as a successfully delivered email/SMS. Store and check email/SMS send statuses, with no claim of read confirmation.

## 8. Test and rollout checklist

- [ ] Secure three existing conversation GET endpoints before any external access.
- [ ] Build job/enquiry-specific context query with explicit ambiguity results.
- [ ] Confirm enquiry-to-job transition preserves earlier messages.
- [ ] Correct phone-only inbox association; separate email rows by linked job rather than "(unknown)".
- [ ] Attribute new outgoing messages to the intended job/enquiry, and surface unassigned historical messages separately.
- [ ] Ingest incoming email replies or return "email replies not checked" to Alex until implemented.
- [ ] Add a safe read-only tool to AiDesk, with scoped credentials and audit logging.
- [ ] Keep Alex from reading sensitive fields aloud or making unverified promises.
- [ ] Test two different repairs sharing a number; old completed job plus open enquiry; wrong/withheld caller number; customer changed number; and enquiry converted to a job.
- [ ] Test staff-sent email, app SMS, manual MacroDroid text, failed send, customer SMS response, inbound email reply, missing email, and message not received.
- [ ] Confirm Alex cannot assert "no reply" if inbound emails are not synchronised.
- [ ] Confirm customer can ask Alex to summarise the request but is still instructed to reply in the original thread.
- [ ] Confirm unclear/ambiguous cases are flagged for staff and never attached to the wrong repair.
- [ ] Run acceptance call tests before updating the production receptionist prompt.

## 9. Scope of this document

This file records requirements and the current audit. **It does not change Alex's live behaviour, message routing, Supabase schema, integrations or deployment.** Implement and test these changes separately. The immediate priority is secure, repair-specific read-only context; email reply ingestion and exact thread matching are prerequisites for fully reliable "waiting for your reply" claims.
