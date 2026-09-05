import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendViaMacroDroid } from '@/lib/resilience'
import { getFirstName } from '@/lib/sms-template'
import { getAppUrl } from '@/lib/utils'

/**
 * POST /api/public/start-repair
 *
 * Public endpoint that accepts the "freeform" repair request shape used by
 * the static website's repair-request-form.js. This is a thin adapter that
 * normalises the simple field names into the enquiries table schema and
 * inserts a `repair_quote` enquiry with no quoted price (staff follow up).
 *
 * This replaces the old NFDRai /api/public/start-repair endpoint. The priced
 * catalogue quote form continues to use /api/enquiries/submit directly.
 *
 * Expected payload (JSON):
 *   {
 *     name: string,
 *     phone: string,             // UK mobile, any common format
 *     email?: string,
 *     device_make?: string,
 *     device_model?: string,
 *     issue?: string,            // e.g. "Screen replacement"
 *     description?: string,      // freeform description
 *     additionalIssues?: { issue: string, description: string }[],
 *     referringPage?: string,
 *     source?: string            // defaults to 'website'
 *   }
 *
 * Returns:
 *   { success, enquiry_ref, quote_url, sms_sent }
 */
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  })
}

export async function POST(request: NextRequest) {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    const body = await request.json()
    const {
      name,
      phone,
      email,
      device_make,
      device_model,
      issue,
      description,
      additionalIssues,
      referringPage,
      source = 'website',
    } = body

    // --- Validate required fields ---
    if (!name || typeof name !== 'string' || !name.trim()) {
      return NextResponse.json(
        { error: 'Missing required field: name' },
        { status: 400, headers: { 'Access-Control-Allow-Origin': '*' } }
      )
    }
    if (!phone || typeof phone !== 'string' || !phone.trim()) {
      return NextResponse.json(
        { error: 'Missing required field: phone' },
        { status: 400, headers: { 'Access-Control-Allow-Origin': '*' } }
      )
    }

    // --- Normalise UK phone to +44 form for consistent lookup ---
    const normalisedPhone = normaliseUkPhone(phone)
    if (!normalisedPhone) {
      return NextResponse.json(
        { error: 'Please provide a valid UK mobile number' },
        { status: 400, headers: { 'Access-Control-Allow-Origin': '*' } }
      )
    }

    // --- Insert enquiry (repair_quote type, no quoted price — staff follow up) ---
    const enquiryRow: Record<string, any> = {
      enquiry_type: 'repair_quote',
      customer_name: name.trim(),
      customer_email: email?.trim() || null,
      customer_phone: normalisedPhone,
      device_make: device_make?.trim() || null,
      device_model: device_model?.trim() || null,
      repair_type: issue?.trim() || null,
      issue_description: description?.trim() || null,
      additional_repairs: Array.isArray(additionalIssues) && additionalIssues.length > 0
        ? additionalIssues
        : null,
      quote_source: source || 'website',
      quote_type: 'personalized', // no instant price — staff will quote manually
      terms_accepted: false,
      proceed_with_repair: false,
      marketing_consent: false,
      status: 'pending',
    }

    const { data: enquiry, error: enquiryError } = await supabase
      .from('enquiries')
      .insert(enquiryRow)
      .select()
      .single()

    if (enquiryError || !enquiry) {
      console.error('[start-repair] Failed to insert enquiry:', enquiryError)
      return NextResponse.json(
        { error: 'Failed to submit repair request' },
        { status: 500, headers: { 'Access-Control-Allow-Origin': '*' } }
      )
    }

    // --- Staff notification ---
    try {
      await supabase.from('notifications').insert({
        type: 'NEW_ENQUIRY',
        title: `New repair request: ${device_make || ''} ${device_model || ''}`.trim(),
        body: `${name} - ${issue || 'Repair'} - ${normalisedPhone}${referringPage ? ` (from ${referringPage})` : ''}`,
        is_read: false,
      } as any)
    } catch (e) {
      console.error('[start-repair] Notification insert failed:', e)
    }

    // --- Acknowledgment SMS to customer ---
    let smsSent = false
    const webhookUrl = process.env.MACRODROID_WEBHOOK_URL
    if (webhookUrl) {
      const ackMessage = `Hi ${getFirstName(name)},\n\nThanks for your repair request${device_make || device_model ? ` for your ${device_make || ''} ${device_model || ''}`.trim() : ''}. John will review it and get back to you with a quote — usually within 2 hours during business hours.\n\nOpening hours: nfdr.uk/h\n\nNew Forest Device Repairs`

      try {
        const result = await sendViaMacroDroid(webhookUrl, normalisedPhone, ackMessage)
        smsSent = result.ok
        if (!result.ok) {
          console.error('[start-repair] Acknowledgment SMS failed:', result.body)
        }

        // Log SMS
        try {
          await supabase.from('sms_logs').insert({
            template_key: 'REPAIR_REQUEST_ACK',
            body_rendered: ackMessage,
            status: result.ok ? 'SENT' : 'FAILED',
            sent_at: result.ok ? new Date().toISOString() : null,
            error_message: result.ok ? null : result.body,
          } as any)
        } catch (e) {
          console.error('[start-repair] SMS log failed:', e)
        }
      } catch (e) {
        console.error('[start-repair] Acknowledgment SMS exception:', e)
      }
    }

    // --- Notify staff via MacroDroid repair-request webhook ---
    // Uses the same MACRODROID_WEBHOOK_URL with /repair-request appended
    // (matches the old NFDRai behaviour — triggers a notification on John's phone)
    const macrodroidWebhookUrl = process.env.MACRODROID_WEBHOOK_URL
    if (macrodroidWebhookUrl) {
      const appUrl = getAppUrl()
      const enquiryUrl = `${appUrl}/app/enquiries?ref=${enquiry.enquiry_ref}`
      const notifyUrl = `${macrodroidWebhookUrl}/repair-request`
      try {
        await fetch(notifyUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain' },
          body: enquiryUrl,
        })
      } catch (e) {
        console.error('[start-repair] Staff MacroDroid ping failed:', e)
      }
    }

    return NextResponse.json({
      success: true,
      enquiry_ref: enquiry.enquiry_ref,
      quote_url: `${getAppUrl()}/app/enquiries?ref=${enquiry.enquiry_ref}`,
      sms_sent: smsSent,
    }, {
      headers: { 'Access-Control-Allow-Origin': '*' },
    })
  } catch (error) {
    console.error('[start-repair] Error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: { 'Access-Control-Allow-Origin': '*' } }
    )
  }
}

/**
 * Normalise a UK phone number to +44XXXXXXXXX format.
 * Accepts: 07XXXXXXXXX, +447XXXXXXXXX, 00447XXXXXXXXX, 447XXXXXXXXX
 * Returns null if not a valid UK mobile.
 */
function normaliseUkPhone(raw: string): string | null {
  const digits = raw.replace(/[^\d+]/g, '')
  if (/^\+447\d{9}$/.test(digits)) return digits
  if (/^00447\d{9}$/.test(digits)) return `+447${digits.slice(5)}`
  if (/^447\d{9}$/.test(digits)) return `+${digits}`
  if (/^07\d{9}$/.test(digits)) return `+44${digits.slice(1)}`
  return null
}
