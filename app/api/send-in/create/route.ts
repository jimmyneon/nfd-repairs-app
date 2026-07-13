import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendEmail } from '@/lib/email'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    const {
      name,
      phone,
      email,
      address,
      device_type,
      device_model,
      issue,
    } = body

    if (!name || !phone || !email || !address || !device_type || !issue) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      )
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const { data: sendInRequest, error } = await supabase
      .from('send_in_requests')
      .insert({
        customer_name: name,
        customer_phone: phone,
        customer_email: email,
        collection_address: address,
        device_type,
        device_model: device_model || null,
        issue_description: issue,
        diagnostic_fee_paid: false,
        diagnostic_fee_amount: 29.00,
        status: 'pending',
      })
      .select()
      .single() as any

    if (error) {
      console.error('Failed to create send-in request:', error)
      return NextResponse.json(
        { error: 'Failed to create request', details: error.message },
        { status: 500 }
      )
    }

    // Staff notification in dashboard
    await supabase.from('notifications').insert({
      type: 'NEW_JOB',
      title: 'New send-in repair request',
      body: `${device_type}${device_model ? ' ' + device_model : ''} - ${name}`,
      is_read: false,
    } as any)

    // Email notification to shop
    const shopEmail = 'nfdrepairs@gmail.com'
    const emailSubject = `New Send-In Request: ${sendInRequest.request_ref} - ${device_type}${device_model ? ' ' + device_model : ''}`
    const emailHtml = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;font-family:Arial,sans-serif;background-color:#f3f4f6;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f3f4f6;padding:20px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:8px;box-shadow:0 2px 4px rgba(0,0,0,0.1);">
        <tr>
          <td style="background:linear-gradient(135deg,#009B4D 0%,#007A3D 100%);padding:25px;text-align:center;border-radius:8px 8px 0 0;">
            <h1 style="color:#ffffff;margin:0;font-size:24px;">New Send-In Repair Request</h1>
            <p style="color:rgba(255,255,255,0.9);margin:8px 0 0 0;font-size:14px;">Reference: ${sendInRequest.request_ref}</p>
          </td>
        </tr>
        <tr>
          <td style="padding:30px;">
            <h2 style="color:#111827;margin:0 0 20px 0;font-size:20px;">Customer Details</h2>
            <table width="100%" cellpadding="8" cellspacing="0" style="border-collapse:collapse;">
              <tr><td style="border-bottom:1px solid #e5e7eb;padding:10px 0;"><strong style="color:#6B7280;font-size:14px;">Name</strong><br><span style="color:#111827;font-size:16px;">${name}</span></td></tr>
              <tr><td style="border-bottom:1px solid #e5e7eb;padding:10px 0;"><strong style="color:#6B7280;font-size:14px;">Phone</strong><br><span style="color:#111827;font-size:16px;">${phone}</span></td></tr>
              <tr><td style="border-bottom:1px solid #e5e7eb;padding:10px 0;"><strong style="color:#6B7280;font-size:14px;">Email</strong><br><span style="color:#111827;font-size:16px;">${email}</span></td></tr>
              <tr><td style="border-bottom:1px solid #e5e7eb;padding:10px 0;"><strong style="color:#6B7280;font-size:14px;">Collection Address</strong><br><span style="color:#111827;font-size:16px;">${address}</span></td></tr>
            </table>
            <h2 style="color:#111827;margin:25px 0 15px 0;font-size:20px;">Device Details</h2>
            <table width="100%" cellpadding="8" cellspacing="0" style="border-collapse:collapse;">
              <tr><td style="border-bottom:1px solid #e5e7eb;padding:10px 0;"><strong style="color:#6B7280;font-size:14px;">Device Type</strong><br><span style="color:#111827;font-size:16px;">${device_type}</span></td></tr>
              <tr><td style="border-bottom:1px solid #e5e7eb;padding:10px 0;"><strong style="color:#6B7280;font-size:14px;">Model</strong><br><span style="color:#111827;font-size:16px;">${device_model || 'Not specified'}</span></td></tr>
              <tr><td style="border-bottom:1px solid #e5e7eb;padding:10px 0;"><strong style="color:#6B7280;font-size:14px;">Issue</strong><br><span style="color:#111827;font-size:16px;">${issue}</span></td></tr>
            </table>
            <div style="background-color:#FEF3C7;border-left:4px solid #F59E0B;padding:15px;margin:25px 0;border-radius:4px;">
              <p style="color:#92400E;margin:0;font-weight:bold;font-size:14px;">Payment Status: Awaiting £29 Diagnostic Fee</p>
              <p style="color:#78350F;margin:8px 0 0 0;font-size:13px;">Customer has been redirected to SumUp to pay. Check your SumUp dashboard to confirm payment before arranging collection.</p>
            </div>
          </td>
        </tr>
        <tr>
          <td style="background-color:#f8f9fa;padding:20px 30px;text-align:center;border-top:1px solid #e5e7eb;">
            <p style="color:#999999;font-size:12px;margin:0;">New Forest Device Repairs - Send-In Service Notification</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
    const emailText = `New Send-In Repair Request
Reference: ${sendInRequest.request_ref}

CUSTOMER DETAILS
Name: ${name}
Phone: ${phone}
Email: ${email}
Collection Address: ${address}

DEVICE DETAILS
Type: ${device_type}
Model: ${device_model || 'Not specified'}
Issue: ${issue}

Payment Status: Awaiting £29 diagnostic fee (customer redirected to SumUp)`

    try {
      await sendEmail(shopEmail, emailSubject, emailHtml, emailText)
      console.log('✓ Send-in notification email sent to', shopEmail)
    } catch (emailErr) {
      console.error('Failed to send send-in notification email:', emailErr)
    }

    const sumupLink = process.env.NEXT_PUBLIC_SUMUP_DIAGNOSTIC_URL || 'https://pay.sumup.com/b2c/Q9OZOAJT'

    return NextResponse.json({
      success: true,
      request_ref: sendInRequest.request_ref,
      payment_url: sumupLink,
    })
  } catch (error) {
    console.error('Error in send-in create:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
