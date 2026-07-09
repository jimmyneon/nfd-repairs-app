import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendEmail } from '@/lib/email'

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
    const body = await request.json()

    const {
      name,
      phone,
      email,
      company,
      helpType,
      otherDetail,
      deviceCount,
      urgency,
      supportType,
      message,
      source,
    } = body

    if (!name || !phone || !email) {
      return NextResponse.json(
        { error: 'Missing required fields: name, phone, email' },
        { status: 400, headers: { 'Access-Control-Allow-Origin': '*' } }
      )
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const { data: enquiry, error: enquiryError } = await supabase
      .from('enquiries')
      .insert({
        enquiry_type: 'business',
        customer_name: name,
        customer_email: email,
        customer_phone: phone,
        company: company || null,
        help_type: helpType || null,
        other_detail: otherDetail || null,
        device_count: deviceCount || null,
        urgency: urgency || null,
        support_type: supportType || null,
        description: message || null,
        additional_info: message || null,
        status: 'pending',
      })
      .select()
      .single() as any

    if (enquiryError) {
      console.error('Failed to create business enquiry:', enquiryError)
      return NextResponse.json(
        { error: 'Failed to create enquiry', details: enquiryError.message },
        { status: 500, headers: { 'Access-Control-Allow-Origin': '*' } }
      )
    }

    // Create staff notification in dashboard
    await supabase.from('notifications').insert({
      type: 'NEW_ENQUIRY',
      title: 'New Business Enquiry',
      body: `${name}${company ? ' - ' + company : ''} - ${helpType || 'General enquiry'}`,
      is_read: false,
    } as any)

    // Send email notification to staff
    const staffEmail = process.env.STAFF_EMAIL || 'nfdrepairs@gmail.com'
    const emailSubject = `New Business Enquiry: ${name}${company ? ' - ' + company : ''}`
    const emailHtml = generateBusinessEnquiryEmail({
      name,
      phone,
      email,
      company,
      helpType,
      otherDetail,
      deviceCount,
      urgency,
      supportType,
      message,
      enquiryRef: enquiry.enquiry_ref,
    })

    try {
      await sendEmail(staffEmail, emailSubject, emailHtml)
    } catch (emailErr) {
      console.error('Failed to send staff email notification:', emailErr)
    }

    return NextResponse.json({
      success: true,
      enquiry_ref: enquiry.enquiry_ref,
      message: 'Your enquiry has been submitted successfully. We will contact you shortly.',
    }, {
      headers: { 'Access-Control-Allow-Origin': '*' },
    })
  } catch (error) {
    console.error('Error processing business enquiry:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: { 'Access-Control-Allow-Origin': '*' } }
    )
  }
}

function generateBusinessEnquiryEmail(data: {
  name: string
  phone: string
  email: string
  company?: string
  helpType?: string
  otherDetail?: string
  deviceCount?: string
  urgency?: string
  supportType?: string
  message?: string
  enquiryRef: string
}): string {
  const rows: string[] = []

  const addRow = (label: string, value?: string) => {
    if (value) {
      rows.push(`<tr><td style="padding:8px 0;color:#666;font-weight:bold;width:160px;">${label}</td><td style="padding:8px 0;color:#333;">${value}</td></tr>`)
    }
  }

  addRow('Reference', data.enquiryRef)
  addRow('Name', data.name)
  addRow('Company', data.company)
  addRow('Phone', data.phone)
  addRow('Email', data.email)
  addRow('Help Type', data.helpType)
  addRow('Other Detail', data.otherDetail)
  addRow('Device Count', data.deviceCount)
  addRow('Urgency', data.urgency)
  addRow('Support Type', data.supportType)
  addRow('Message', data.message)

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;font-family:Arial,sans-serif;background-color:#FAF5E9;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#FAF5E9;padding:20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 4px rgba(0,0,0,0.1);">
          <tr>
            <td style="background-color:#009B4D;padding:20px 30px;">
              <h1 style="color:#ffffff;margin:0;font-size:22px;">New Business Enquiry</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:30px;">
              <table width="100%" cellpadding="0" cellspacing="0">
                ${rows.join('')}
              </table>
              <p style="margin-top:24px;color:#666;font-size:14px;">
                View this enquiry in the <a href="https://nfd-repairs-app.vercel.app/app/enquiries" style="color:#009B4D;">dashboard</a>.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}
