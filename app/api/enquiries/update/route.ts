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
    const { enquiry_ref, action, data } = body

    if (!enquiry_ref || !action) {
      return NextResponse.json({ error: 'Missing enquiry_ref or action' }, { status: 400 })
    }

    // Find the enquiry
    const { data: enquiry, error: fetchError } = await supabase
      .from('enquiries')
      .select('*')
      .eq('enquiry_ref', enquiry_ref)
      .single()

    if (fetchError || !enquiry) {
      return NextResponse.json({ error: 'Enquiry not found' }, { status: 404 })
    }

    const now = new Date().toISOString()
    let updateFields: Record<string, any> = { updated_at: now }
    let notificationTitle = ''
    let notificationBody = ''

    switch (action) {
      case 'reserve_repair': {
        updateFields.repair_reserved = true
        updateFields.status = 'converted'
        updateFields.proceed_with_repair = true
        notificationTitle = `Repair Reserved: ${enquiry.device_make || ''} ${enquiry.device_model || ''}`
        notificationBody = `${enquiry.customer_name} reserved their repair${enquiry.quoted_price ? ' (£' + enquiry.quoted_price + ')' : ''}. Text them to arrange a time.`
        break
      }

      case 'reserve_part': {
        updateFields.part_reserved = true
        updateFields.status = 'pending'
        notificationTitle = `Part Reserved: ${enquiry.device_make || ''} ${enquiry.device_model || ''}`
        notificationBody = `${enquiry.customer_name} asked to reserve a part until payday. Text them to confirm.`
        break
      }

      case 'send_quote': {
        const method = data?.method || 'sms'
        updateFields.quote_sent_method = method
        notificationTitle = `Quote Sent: ${enquiry.device_make || ''} ${enquiry.device_model || ''}`
        notificationBody = `${enquiry.customer_name} asked to receive their quote via ${method}.`

        // Actually send the quote
        const quoteUrl = `https://newforestdevicerepairs.co.uk/quote/accept/?ref=${enquiry.enquiry_ref}`
        const priceText = enquiry.quoted_price ? `£${enquiry.quoted_price}` : 'Personalized quote'
        const warranty = enquiry.screen_option || 'Standard warranty'
        const turnaround = '30–60 mins'

        if (method === 'sms' || method === 'both') {
          const webhookUrl = process.env.MACRODROID_WEBHOOK_URL
          if (webhookUrl && enquiry.customer_phone) {
            const smsMessage = `Hi ${enquiry.customer_name}, your ${enquiry.device_make || ''} ${enquiry.device_model || ''} ${enquiry.repair_type || 'repair'} quote: ${priceText}. ${warranty}. ~${turnaround}. View & reserve: ${quoteUrl} - NFD Repairs`
            try {
              await fetch(webhookUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ phone: enquiry.customer_phone, message: smsMessage }),
              })
              try {
                await supabase.from('sms_logs').insert({
                  template_key: 'QUOTE_SENT',
                  body_rendered: smsMessage,
                  status: 'SENT',
                  sent_at: now,
                } as any)
              } catch (e) { console.error('SMS log failed:', e) }
            } catch (e) { console.error('Quote SMS failed:', e) }
          }
        }

        if (method === 'email' || method === 'both') {
          if (enquiry.customer_email) {
            const emailSubject = `Your Quote: ${enquiry.device_make || ''} ${enquiry.device_model || ''} ${enquiry.repair_type || ''} - ${priceText}`
            const emailHtml = `<!DOCTYPE html><html><body style="margin:0;padding:0;font-family:Arial,sans-serif;background:#FAF5E9;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#FAF5E9;padding:20px;"><tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 4px rgba(0,0,0,0.1);">
<tr><td style="background:#009B4D;padding:30px;text-align:center;"><h1 style="color:#fff;margin:0;font-size:24px;">New Forest Device Repairs</h1></td></tr>
<tr><td style="padding:40px 30px;">
<h2 style="color:#333;margin:0 0 20px;">Hi ${enquiry.customer_name},</h2>
<p style="color:#666;font-size:16px;line-height:1.6;">Here's your quote as requested.</p>
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f8f9fa;border-radius:6px;padding:20px;margin:20px 0;">
<tr><td>
<p style="margin:0 0 10px;color:#666;"><strong>Device:</strong> ${enquiry.device_make || ''} ${enquiry.device_model || ''}</p>
<p style="margin:0 0 10px;color:#666;"><strong>Repair:</strong> ${enquiry.repair_type || ''}</p>
${enquiry.screen_option ? `<p style="margin:0 0 10px;color:#666;"><strong>Option:</strong> ${enquiry.screen_option}</p>` : ''}
<p style="margin:0 0 10px;color:#666;"><strong>Price:</strong> ${priceText}</p>
<p style="margin:0 0 10px;color:#666;"><strong>Warranty:</strong> ${warranty}</p>
<p style="margin:0;color:#666;"><strong>Turnaround:</strong> ${turnaround}</p>
</td></tr>
</table>
<p style="color:#666;font-size:16px;line-height:1.6;">Ready to go ahead? Click below to reserve your repair — we'll text you to arrange a time.</p>
<table width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0;"><tr><td align="center">
<a href="${quoteUrl}" style="display:inline-block;background:#009B4D;color:#fff;padding:15px 40px;text-decoration:none;border-radius:4px;font-weight:bold;font-size:16px;">Reserve My Repair</a>
</td></tr></table>
<p style="color:#666;font-size:14px;line-height:1.6;margin-top:30px;">This quote is valid for 14 days. No obligation — we'll confirm everything with you before any work starts.</p>
</td></tr>
<tr><td style="background:#f8f9fa;padding:20px 30px;text-align:center;">
<p style="color:#666;font-size:14px;margin:0 0 10px;"><strong>New Forest Device Repairs</strong><br>Phone: 07410 381247<br>Web: <a href="https://newforestdevicerepairs.co.uk" style="color:#009B4D;">newforestdevicerepairs.co.uk</a></p>
</td></tr>
</table></td></tr></table></body></html>`
            const emailText = `Hi ${enquiry.customer_name},\n\nYour quote for ${enquiry.device_make || ''} ${enquiry.device_model || ''} ${enquiry.repair_type || 'repair'}: ${priceText}\nWarranty: ${warranty}\nTurnaround: ${turnaround}\n\nReserve your repair: ${quoteUrl}\n\nValid for 14 days. No obligation.\n\nNew Forest Device Repairs\n07410 381247\nnewforestdevicerepairs.co.uk`
            try {
              await sendEmail(enquiry.customer_email, emailSubject, emailHtml, emailText)
              try {
                await supabase.from('email_logs').insert({
                  subject: emailSubject,
                  body: emailText,
                  status: 'SENT',
                } as any)
              } catch (e) { console.error('Email log failed:', e) }
            } catch (e) { console.error('Quote email failed:', e) }
          }
        }
        break
      }

      case 'set_hesitation': {
        updateFields.hesitation_reason = data?.reason || null
        updateFields.customer_notes = data?.notes || null
        notificationTitle = `Hesitation: ${enquiry.device_make || ''} ${enquiry.device_model || ''}`
        const reasonLabels: Record<string, string> = {
          more_than_expected: 'More than expected',
          comparing_prices: 'Comparing prices',
          need_more_info: 'Needs more info',
          wait_until_payday: 'Waiting until payday',
          other: 'Other reason',
        }
        notificationBody = `${enquiry.customer_name} hesitated: ${reasonLabels[data?.reason] || data?.reason}${data?.notes ? '. Notes: ' + data.notes : ''}`
        break
      }

      case 'set_budget': {
        updateFields.customer_budget = data?.budget || null
        updateFields.hesitation_reason = 'more_than_expected'
        notificationTitle = `Budget Flag: ${enquiry.device_make || ''} ${enquiry.device_model || ''}`
        notificationBody = `${enquiry.customer_name} indicated budget of £${data?.budget}. Quote was £${enquiry.quoted_price || 'N/A'}. Check for alternative options.`
        break
      }

      case 'set_contact_method': {
        updateFields.preferred_contact_method = data?.method || 'sms'
        break
      }

      default: {
        return NextResponse.json({ error: 'Unknown action: ' + action }, { status: 400 })
      }
    }

    // Update enquiry
    const { error: updateError } = await supabase
      .from('enquiries')
      .update(updateFields)
      .eq('id', enquiry.id)

    if (updateError) {
      console.error('Failed to update enquiry:', updateError)
    }

    // Create notification for staff (for significant actions)
    if (notificationTitle) {
      try {
        await supabase.from('notifications').insert({
          type: 'QUOTE_ACTION',
          title: notificationTitle,
          body: notificationBody,
          is_read: false,
        } as any)
      } catch (e) { console.error('Notification insert failed:', e) }
    }

    // Send confirmation SMS for reserve actions
    if (action === 'reserve_repair' || action === 'reserve_part') {
      const webhookUrl = process.env.MACRODROID_WEBHOOK_URL
      if (webhookUrl && enquiry.customer_phone) {
        const smsMessage = action === 'reserve_repair'
          ? `Great choice, ${enquiry.customer_name}! We've reserved your repair slot for your ${enquiry.device_make || ''} ${enquiry.device_model || ''}. We'll text you very shortly to confirm the details. Any questions? Call 07410 381247. - NFD Repairs`
          : `No problem, ${enquiry.customer_name}! We'll look into reserving a part for your ${enquiry.device_make || ''} ${enquiry.device_model || ''} repair. We'll be in touch to confirm. Any questions? Call 07410 381247. - NFD Repairs`
        try {
          await fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone: enquiry.customer_phone, message: smsMessage }),
          })
          try {
            await supabase.from('sms_logs').insert({
              template_key: action === 'reserve_repair' ? 'REPAIR_RESERVED' : 'PART_RESERVED',
              body_rendered: smsMessage,
              status: 'SENT',
              sent_at: now,
            } as any)
          } catch (e) { console.error('SMS log failed:', e) }
        } catch (e) { console.error('Confirmation SMS failed:', e) }
      }
    }

    return NextResponse.json({
      success: true,
      action,
      enquiry_ref: enquiry.enquiry_ref,
    }, {
      headers: { 'Access-Control-Allow-Origin': '*' },
    })
  } catch (error) {
    console.error('Error in enquiry update:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
