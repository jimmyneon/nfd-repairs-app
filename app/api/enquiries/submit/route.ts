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
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    const body = await request.json()
    
    const {
      enquiry_type,
      customer_name,
      customer_email,
      customer_phone,
      // Web Services fields
      project_type,
      sector,
      number_pages,
      goals,
      project_description,
      existing_website,
      existing_url,
      budget,
      timeline,
      // Home Services fields
      service_type,
      address,
      address_type,
      preferred_date,
      preferred_time,
      description,
      // Repair Quote fields
      device_category,
      device_make,
      device_model,
      repair_type,
      screen_option,
      quoted_price,
      quote_type,
      issue_description,
      terms_accepted,
      proceed_with_repair,
      marketing_consent,
      quote_source,
      // Common
      additional_info,
    } = body

    // Validate required fields based on enquiry type
    if (!enquiry_type || !customer_name) {
      return NextResponse.json(
        { error: 'Missing required fields: enquiry_type, customer_name' },
        { status: 400, headers: { 'Access-Control-Allow-Origin': '*' } }
      )
    }

    // Email required for web/home services, optional for repair_quote and business
    if (enquiry_type !== 'repair_quote' && !customer_email) {
      return NextResponse.json(
        { error: 'Missing required field: customer_email' },
        { status: 400, headers: { 'Access-Control-Allow-Origin': '*' } }
      )
    }

    // Phone required for repair_quote
    if (enquiry_type === 'repair_quote' && !customer_phone) {
      return NextResponse.json(
        { error: 'Missing required field: customer_phone' },
        { status: 400, headers: { 'Access-Control-Allow-Origin': '*' } }
      )
    }

    if (enquiry_type === 'web_services') {
      if (!project_type || !sector || !number_pages || !goals || !project_description) {
        return NextResponse.json(
          { error: 'Missing required web services fields' },
          { status: 400, headers: { 'Access-Control-Allow-Origin': '*' } }
        )
      }
    } else if (enquiry_type === 'home_services') {
      if (!service_type || !address || !description) {
        return NextResponse.json(
          { error: 'Missing required home services fields' },
          { status: 400, headers: { 'Access-Control-Allow-Origin': '*' } }
        )
      }
    }

    // Insert enquiry into database
    const { data: enquiry, error: enquiryError } = await supabase
      .from('enquiries')
      .insert({
        enquiry_type,
        customer_name,
        customer_email: customer_email || null,
        customer_phone: customer_phone || null,
        // Web Services fields
        project_type: project_type || null,
        sector: sector || null,
        number_pages: number_pages || null,
        goals: goals || null,
        project_description: project_description || null,
        existing_website: existing_website || null,
        existing_url: existing_url || null,
        budget: budget || null,
        timeline: timeline || null,
        // Home Services fields
        service_type: service_type || null,
        address: address || null,
        address_type: address_type || null,
        preferred_date: preferred_date || null,
        preferred_time: preferred_time || null,
        description: description || null,
        // Repair Quote fields
        device_category: device_category || null,
        device_make: device_make || null,
        device_model: device_model || null,
        repair_type: repair_type || null,
        screen_option: screen_option || null,
        quoted_price: quoted_price || null,
        quote_type: quote_type || null,
        issue_description: issue_description || null,
        terms_accepted: terms_accepted || false,
        proceed_with_repair: proceed_with_repair || false,
        marketing_consent: marketing_consent || false,
        quote_source: quote_source || null,
        // Common
        additional_info: additional_info || null,
        status: 'pending',
      })
      .select()
      .single() as any

    if (enquiryError) {
      console.error('Failed to create enquiry:', enquiryError)
      return NextResponse.json(
        { error: 'Failed to create enquiry' },
        { status: 500, headers: { 'Access-Control-Allow-Origin': '*' } }
      )
    }

    // Create notification for staff
    await supabase.from('notifications').insert({
      type: 'NEW_ENQUIRY',
      title: enquiry_type === 'repair_quote'
        ? `New Repair Quote: ${device_make || ''} ${device_model || ''}`
        : `New ${enquiry_type === 'web_services' ? 'Web Services' : enquiry_type === 'business' ? 'Business' : 'Home Services'} Enquiry`,
      body: enquiry_type === 'repair_quote'
        ? `${customer_name} - ${repair_type || 'Repair'}${quoted_price ? ' - £' + quoted_price : ' - Personalized quote'}`
        : `${customer_name} - ${enquiry_type === 'web_services' ? project_type : enquiry_type === 'business' ? (body.help_type || 'Business') : service_type}`,
      is_read: false,
    } as any)

    // Auto-send quote via SMS + email to whatever contact info the customer provided
    if (enquiry_type === 'repair_quote') {
      try {
        const quoteUrl = `https://newforestdevicerepairs.co.uk/quote/accept/?ref=${enquiry.enquiry_ref}`
        const isInstant = quoted_price && quote_type === 'instant'
        const priceText = isInstant ? `£${quoted_price}` : 'personalized quote'
        const now = new Date().toISOString()

        // Send SMS if phone provided
        if (customer_phone) {
          const webhookUrl = process.env.MACRODROID_WEBHOOK_URL
          if (webhookUrl) {
            const smsMessage = isInstant
              ? `Hi ${customer_name}, your ${device_make || ''} ${device_model || ''} ${repair_type || 'repair'} quote: ${priceText}. View & reserve here: ${quoteUrl} - NFD Repairs`
              : `Hi ${customer_name}, thanks for your ${device_make || ''} ${device_model || ''} repair enquiry. We'll get back to you with a quote within working hours. Your ref: ${enquiry.enquiry_ref} - NFD Repairs`

            await fetch(webhookUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ phone: customer_phone, message: smsMessage }),
            }).catch(err => console.error('Quote SMS send failed:', err))

            try {
              await supabase.from('sms_logs').insert({
                template_key: 'REPAIR_QUOTE',
                body_rendered: smsMessage,
                status: 'SENT',
                sent_at: now,
              } as any)
            } catch (e) { console.error('SMS log failed:', e) }
          }
        }

        // Send email if address provided
        if (customer_email) {
          const emailSubject = isInstant
            ? `Your Repair Quote: ${device_make || ''} ${device_model || ''} ${repair_type || ''} - ${priceText}`
            : `Your Repair Enquiry: ${device_make || ''} ${device_model || ''} - We'll be in touch`

          const emailHtml = `<!DOCTYPE html><html><body style="margin:0;padding:0;font-family:Arial,sans-serif;background:#FAF5E9;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#FAF5E9;padding:20px;"><tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 4px rgba(0,0,0,0.1);">
<tr><td style="background:#009B4D;padding:30px;text-align:center;"><h1 style="color:#fff;margin:0;font-size:24px;">New Forest Device Repairs</h1></td></tr>
<tr><td style="padding:40px 30px;">
<h2 style="color:#333;margin:0 0 20px;">Hi ${customer_name},</h2>
${isInstant ? `
<p style="color:#666;font-size:16px;line-height:1.6;">Here's your quote for your <strong>${device_make || ''} ${device_model || ''}</strong> ${repair_type || 'repair'}.</p>
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f8f9fa;border-radius:6px;padding:20px;margin:20px 0;">
<tr><td>
<p style="margin:0 0 10px;color:#666;"><strong>Device:</strong> ${device_make || ''} ${device_model || ''}</p>
<p style="margin:0 0 10px;color:#666;"><strong>Repair:</strong> ${repair_type || ''}</p>
${screen_option ? `<p style="margin:0 0 10px;color:#666;"><strong>Option:</strong> ${screen_option}</p>` : ''}
<p style="margin:0;color:#666;"><strong>Price:</strong> ${priceText}</p>
</td></tr>
</table>
<p style="color:#666;font-size:16px;line-height:1.6;">Ready to go ahead? Click below to reserve your repair — we'll text you to arrange a time.</p>
<table width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0;"><tr><td align="center">
<a href="${quoteUrl}" style="display:inline-block;background:#009B4D;color:#fff;padding:15px 40px;text-decoration:none;border-radius:4px;font-weight:bold;font-size:16px;">Reserve My Repair</a>
</td></tr></table>
` : `
<p style="color:#666;font-size:16px;line-height:1.6;">Thanks for your enquiry about your <strong>${device_make || ''} ${device_model || ''}</strong>. We'll review the details and get back to you with a personalized quote within working hours (Mon–Fri 10–5, Sat 10–3).</p>
${issue_description ? `<p style="color:#666;font-size:14px;line-height:1.6;background:#f8f9fa;padding:15px;border-radius:6px;"><strong>Your description:</strong> ${issue_description}</p>` : ''}
<p style="color:#666;font-size:16px;line-height:1.6;">Your reference: <strong>${enquiry.enquiry_ref}</strong></p>
`}
<p style="color:#666;font-size:14px;line-height:1.6;margin-top:30px;">No obligation — we'll confirm everything with you before any work starts.</p>
</td></tr>
<tr><td style="background:#f8f9fa;padding:20px 30px;text-align:center;">
<p style="color:#666;font-size:14px;margin:0 0 10px;"><strong>New Forest Device Repairs</strong><br>Phone: 07410 381247<br>Web: <a href="https://newforestdevicerepairs.co.uk" style="color:#009B4D;">newforestdevicerepairs.co.uk</a></p>
</td></tr>
</table></td></tr></table></body></html>`

          const emailText = isInstant
            ? `Hi ${customer_name},\n\nYour quote for ${device_make || ''} ${device_model || ''} ${repair_type || 'repair'}: ${priceText}\n\n${screen_option ? `Option: ${screen_option}\n` : ''}Reserve your repair: ${quoteUrl}\n\nNo obligation — we'll confirm everything before any work starts.\n\nNew Forest Device Repairs\n07410 381247\nnewforestdevicerepairs.co.uk`
            : `Hi ${customer_name},\n\nThanks for your enquiry about your ${device_make || ''} ${device_model || ''}. We'll get back to you with a personalized quote within working hours.\n\nYour ref: ${enquiry.enquiry_ref}\n\nNew Forest Device Repairs\n07410 381247\nnewforestdevicerepairs.co.uk`

          await sendEmail(customer_email, emailSubject, emailHtml, emailText).catch(err =>
            console.error('Quote email send failed:', err)
          )

          try {
            await supabase.from('email_logs').insert({
              subject: emailSubject,
              body: emailText,
              status: 'SENT',
            } as any)
          } catch (e) { console.error('Email log failed:', e) }
        }
      } catch (commErr) {
        console.error('Failed to send quote SMS/email:', commErr)
      }
    }

    return NextResponse.json({
      success: true,
      enquiry_ref: enquiry.enquiry_ref,
      message: 'Your enquiry has been submitted successfully. We will contact you within 24 hours.',
    }, {
      headers: {
        'Access-Control-Allow-Origin': '*',
      },
    })
  } catch (error) {
    console.error('Error processing enquiry submission:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: { 'Access-Control-Allow-Origin': '*' } }
    )
  }
}
