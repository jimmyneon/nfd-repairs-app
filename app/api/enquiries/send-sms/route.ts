import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { renderSmsTemplate, getFirstName } from '@/lib/sms-template'
import { requireStaffUser } from '@/lib/api-auth'
import { sendViaMacroDroid } from '@/lib/resilience'

export async function OPTIONS(request: NextRequest) {
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
  const { response: authResponse } = await requireStaffUser(request)
  if (authResponse) return authResponse

  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    const { enquiryId, message, templateKey } = await request.json()

    if (!enquiryId || !message?.trim()) {
      return NextResponse.json(
        { error: 'enquiryId and message are required' },
        { status: 400 }
      )
    }

    const { data: enquiry, error: fetchError } = await supabase
      .from('enquiries')
      .select('*')
      .eq('id', enquiryId)
      .single()

    if (fetchError || !enquiry) {
      return NextResponse.json({ error: 'Enquiry not found' }, { status: 404 })
    }

    if (!enquiry.customer_phone) {
      return NextResponse.json({ error: 'No customer phone number on enquiry' }, { status: 400 })
    }

    const webhookUrl = process.env.MACRODROID_WEBHOOK_URL
    if (!webhookUrl) {
      return NextResponse.json({ error: 'SMS service not configured' }, { status: 500 })
    }

    const smsBody = message.trim()
    const now = new Date().toISOString()

    const smsResponse = await sendViaMacroDroid(webhookUrl, enquiry.customer_phone, smsBody)

    const deliveryStatus = smsResponse.ok ? 'SENT' : 'FAILED'

    // Log to sms_logs
    await supabase.from('sms_logs').insert({
      template_key: templateKey || 'ENQUIRY_CUSTOM',
      body_rendered: smsBody,
      status: deliveryStatus,
      sent_at: deliveryStatus === 'SENT' ? now : null,
    } as any)

    // Update enquiry with staff_response and timestamp
    await supabase
      .from('enquiries')
      .update({
        staff_response: smsBody,
        responded_at: now,
        updated_at: now,
      })
      .eq('id', enquiryId)

    if (!smsResponse.ok) {
      console.error('Enquiry SMS failed:', smsResponse.body)
      return NextResponse.json(
        { error: 'Failed to send SMS', details: smsResponse.body },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error in enquiry send-sms:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
