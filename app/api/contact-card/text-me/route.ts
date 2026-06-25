import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 200, headers: corsHeaders })
}

export async function POST(request: NextRequest) {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const { phone } = await request.json()

    if (!phone || phone.trim().length < 7) {
      return NextResponse.json(
        { success: false, message: 'Please enter a valid mobile number' },
        { status: 400, headers: corsHeaders }
      )
    }

    // Normalise phone number
    let normalisedPhone = phone.trim().replace(/\s+/g, '')
    if (normalisedPhone.startsWith('07')) {
      normalisedPhone = '+44' + normalisedPhone.substring(1)
    } else if (normalisedPhone.startsWith('7') && !normalisedPhone.startsWith('+')) {
      normalisedPhone = '+44' + normalisedPhone
    }

    // Fetch links from admin_settings (never hardcode)
    const { data: mapsSetting } = await supabase
      .from('admin_settings')
      .select('value')
      .eq('key', 'google_maps_link')
      .single()

    const { data: hoursSetting } = await supabase
      .from('admin_settings')
      .select('value')
      .eq('key', 'opening_hours_link')
      .single()

    const mapsLink = mapsSetting?.value || 'https://maps.app.goo.gl/AEfEr4ZRhjB8rVSC7'
    const hoursLink = hoursSetting?.value || mapsLink

    const contactCardUrl = 'https://newforestdevicerepairs.co.uk/contact-card.html'

    const smsBody = `New Forest Device Repairs
Phone, Tablet, Laptop & Console Repairs
Lymington

Call/Text: 07410 381247
Email: nfdrepairs@gmail.com

Save us to your contacts:
${contactCardUrl}

Find us: ${mapsLink}
Opening hours: ${hoursLink}`

    // Send via MacroDroid webhook
    const webhookUrl = process.env.MACRODROID_WEBHOOK_URL
    if (!webhookUrl) {
      console.error('MACRODROID_WEBHOOK_URL not configured')
      return NextResponse.json(
        { success: false, message: 'SMS service not configured' },
        { status: 500, headers: corsHeaders }
      )
    }

    const smsResponse = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        phone: normalisedPhone,
        message: smsBody
      })
    })

    if (!smsResponse.ok) {
      const errorText = await smsResponse.text()
      console.error('SMS send failed:', errorText)
      return NextResponse.json(
        { success: false, message: 'Failed to send SMS' },
        { status: 500, headers: corsHeaders }
      )
    }

    // Log to sms_logs for audit trail
    await supabase.from('sms_logs').insert({
      template_key: 'CONTACT_CARD_TEXT_ME',
      body_rendered: smsBody,
      status: 'SENT',
      sent_at: new Date().toISOString(),
    } as any)

    console.log('Contact card SMS sent to:', normalisedPhone)

    return NextResponse.json({ success: true }, { headers: corsHeaders })
  } catch (error) {
    console.error('Error sending contact card SMS:', error)
    return NextResponse.json(
      { success: false, message: 'Something went wrong' },
      { status: 500, headers: corsHeaders }
    )
  }
}
