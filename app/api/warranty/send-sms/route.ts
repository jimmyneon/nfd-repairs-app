import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

/**
 * POST /api/warranty/send-sms
 * Send an SMS to a warranty ticket customer.
 * Works without a linked job by sending directly via MacroDroid webhook.
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    const { ticketId, message } = await request.json()

    if (!ticketId || !message?.trim()) {
      return NextResponse.json(
        { error: 'ticketId and message are required' },
        { status: 400 }
      )
    }

    // Get ticket details
    const { data: ticketData, error: tError } = await supabase
      .from('warranty_tickets')
      .select('id, customer_phone, customer_name, ticket_ref, matched_job_id')
      .eq('id', ticketId)
      .single()

    if (tError || !ticketData) {
      return NextResponse.json({ error: 'Warranty ticket not found' }, { status: 404 })
    }

    if (!ticketData.customer_phone) {
      return NextResponse.json({ error: 'No customer phone number on ticket' }, { status: 400 })
    }

    const webhookUrl = process.env.MACRODROID_WEBHOOK_URL
    if (!webhookUrl) {
      return NextResponse.json({ error: 'SMS service not configured' }, { status: 500 })
    }

    const smsPayload = {
      phone: ticketData.customer_phone,
      message: message.trim(),
    }

    const smsResponse = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(smsPayload),
    })

    const sentAt = new Date().toISOString()

    if (smsResponse.ok) {
      // Log event in warranty_ticket_events
      await supabase.from('warranty_ticket_events').insert({
        ticket_id: ticketId,
        type: 'SMS_SENT',
        message: `SMS sent to customer: ${message.trim().substring(0, 80)}...`,
        metadata: { phone: ticketData.customer_phone, sent_at: sentAt, full_message: message.trim() }
      } as any)

      // If there's a matched job, also log in sms_logs
      if (ticketData.matched_job_id) {
        await supabase.from('sms_logs').insert({
          job_id: ticketData.matched_job_id,
          template_key: 'WARRANTY_APPROVED',
          body_template: message.trim(),
          body_rendered: message.trim(),
          status: 'SENT',
          sent_at: sentAt,
        } as any)
      }

      return NextResponse.json({ success: true })
    } else {
      const errorText = await smsResponse.text()
      console.error('Warranty SMS failed:', errorText)

      await supabase.from('warranty_ticket_events').insert({
        ticket_id: ticketId,
        type: 'SMS_FAILED',
        message: `SMS send failed: ${errorText.substring(0, 200)}`,
        metadata: { error: errorText }
      } as any)

      return NextResponse.json(
        { error: 'Failed to send SMS', details: errorText },
        { status: 500 }
      )
    }
  } catch (error) {
    console.error('Error sending warranty SMS:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
