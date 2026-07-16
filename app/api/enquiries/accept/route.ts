import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

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
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    const { enquiry_ref } = await request.json()

    if (!enquiry_ref) {
      return NextResponse.json({ error: 'Missing enquiry_ref' }, { status: 400 })
    }

    // Find the enquiry
    const { data: enquiry, error: fetchError } = await supabase
      .from('enquiries')
      .select('*')
      .eq('enquiry_ref', enquiry_ref)
      .single()

    if (fetchError || !enquiry) {
      return NextResponse.json({ error: 'Quote not found' }, { status: 404 })
    }

    if (enquiry.enquiry_type !== 'repair_quote') {
      return NextResponse.json({ error: 'Invalid quote type' }, { status: 400 })
    }

    // Update enquiry status to accepted
    const { error: updateError } = await supabase
      .from('enquiries')
      .update({
        status: 'converted',
        proceed_with_repair: true,
        updated_at: new Date().toISOString(),
      })
      .eq('id', enquiry.id)

    if (updateError) {
      console.error('Failed to update enquiry:', updateError)
    }

    // Create notification for staff
    try {
      await supabase.from('notifications').insert({
        type: 'QUOTE_ACCEPTED',
        title: `Quote Accepted: ${enquiry.device_make || ''} ${enquiry.device_model || ''}`,
        body: `${enquiry.customer_name} accepted their quote${enquiry.quoted_price ? ' (£' + enquiry.quoted_price + ')' : ''}. Call them to arrange the repair.`,
        is_read: false,
      } as any)
    } catch (e) {
      console.error('Notification insert failed:', e)
    }

    // Send confirmation SMS to customer
    const webhookUrl = process.env.MACRODROID_WEBHOOK_URL
    if (webhookUrl && enquiry.customer_phone) {
      const smsMessage = `Great choice, ${enquiry.customer_name}! We've got your repair request for your ${enquiry.device_make || ''} ${enquiry.device_model || ''}. We'll text you shortly to arrange a time. Any questions? Call 07410 381247. - NFD Repairs`

      try {
        await fetch(webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone: enquiry.customer_phone, message: smsMessage }),
        })
      } catch (e) {
        console.error('Confirmation SMS failed:', e)
      }

      try {
        await supabase.from('sms_logs').insert({
          template_key: 'QUOTE_ACCEPTED',
          body_rendered: smsMessage,
          status: 'SENT',
          sent_at: new Date().toISOString(),
        } as any)
      } catch (e) {
        console.error('SMS log failed:', e)
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Quote accepted successfully',
    }, {
      headers: { 'Access-Control-Allow-Origin': '*' },
    })
  } catch (error) {
    console.error('Error accepting quote:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
