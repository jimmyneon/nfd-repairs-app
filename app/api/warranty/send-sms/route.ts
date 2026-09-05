import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getFirstName, renderSmsTemplate } from '@/lib/sms-template'
import { requireStaffUser } from '@/lib/api-auth'
import { sendViaMacroDroid } from '@/lib/resilience'

/**
 * POST /api/warranty/send-sms
 * Send an SMS to a warranty ticket customer.
 * Works without a linked job by sending directly via MacroDroid webhook.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireStaffUser(request)
    if (auth.response) return auth.response

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    const { ticketId, message, templateKey, variables = {} } = await request.json()

    if (!ticketId || (!message?.trim() && !templateKey)) {
      return NextResponse.json(
        { error: 'ticketId and either message or templateKey are required' },
        { status: 400 }
      )
    }

    // Get ticket details
    const { data: ticketData, error: tError } = await supabase
      .from('warranty_tickets')
      .select('id, customer_phone, customer_name, ticket_ref, matched_job_id, device_model, issue_description')
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

    let smsBody = message?.trim() || ''
    let resolvedTemplateKey = templateKey || 'WARRANTY_CUSTOM'

    if (templateKey) {
      const { data: template } = await supabase
        .from('sms_templates')
        .select('body')
        .eq('key', templateKey)
        .eq('is_active', true)
        .single()

      const fallbackTemplates: Record<string, string> = {
        WARRANTY_APPROVED: 'Hi {first_name}, good news — we have approved your warranty request for your {device_model}. Please bring it in when convenient. Ref: {ticket_ref}. New Forest Device Repairs',
        WARRANTY_APPROVED_PARTS: 'Hi {first_name}, we have approved your warranty request for your {device_model}. We need to order parts and will text when they arrive. Ref: {ticket_ref}. New Forest Device Repairs',
        WARRANTY_DECLINED: 'Hi {first_name}, we have reviewed your warranty request for your {device_model}. Unfortunately this issue is not covered: {decline_reason}. Please reply if you would like a paid repair quote. New Forest Device Repairs',
      }

      smsBody = renderSmsTemplate(template?.body || fallbackTemplates[templateKey] || '', {
        customer_name: ticketData.customer_name,
        first_name: getFirstName(ticketData.customer_name),
        device_make: '',
        device_model: ticketData.device_model || 'device',
        ticket_ref: ticketData.ticket_ref,
        ...variables,
      })
    }

    if (!smsBody) {
      return NextResponse.json({ error: 'SMS template is empty or unavailable' }, { status: 500 })
    }

    const smsResponse = await sendViaMacroDroid(webhookUrl, ticketData.customer_phone, smsBody)

    const sentAt = new Date().toISOString()

    if (smsResponse.ok) {
      // Log event in warranty_ticket_events
      await supabase.from('warranty_ticket_events').insert({
        ticket_id: ticketId,
        type: 'SYSTEM',
        message: `SMS sent to customer (${resolvedTemplateKey}): ${smsBody.substring(0, 80)}...`,
        metadata: { phone: ticketData.customer_phone, sent_at: sentAt, full_message: smsBody, template_key: resolvedTemplateKey }
      } as any)

      // If there's a matched job, also log in sms_logs
      if (ticketData.matched_job_id) {
        await supabase.from('sms_logs').insert({
          job_id: ticketData.matched_job_id,
          template_key: resolvedTemplateKey,
          body_template: smsBody,
          body_rendered: smsBody,
          status: 'SENT',
          sent_at: sentAt,
        } as any)
      }

      return NextResponse.json({ success: true })
    } else {
      const errorText = smsResponse.body
      console.error('Warranty SMS failed:', errorText)

      await supabase.from('warranty_ticket_events').insert({
        ticket_id: ticketId,
        type: 'SYSTEM',
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
