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

        // Update enquiry with the latest quote state from the client
        // (user may have selected an option after initial submit)
        if (data?.quoted_price !== undefined) {
          updateFields.quoted_price = data.quoted_price
          enquiry.quoted_price = data.quoted_price
        }
        if (data?.quote_type) {
          updateFields.quote_type = data.quote_type
          enquiry.quote_type = data.quote_type
        }
        if (data?.quote_key) {
          updateFields.quote_key = data.quote_key
          enquiry.quote_key = data.quote_key
          // Also try to get warranty/part_option from catalogue via quote_key
          if (data?.part_option) {
            updateFields.part_option = data.part_option
            enquiry.part_option = data.part_option
          }
          if (data?.warranty) {
            updateFields.warranty = data.warranty
            enquiry.warranty = data.warranty
          }
        }
        if (data?.additional_repairs !== undefined) {
          updateFields.additional_repairs = data.additional_repairs
          enquiry.additional_repairs = data.additional_repairs
        }

        notificationTitle = method === 'none' ? '' : `Quote Sent: ${enquiry.device_make || ''} ${enquiry.device_model || ''}`
        notificationBody = method === 'none' ? '' : `${enquiry.customer_name} asked to receive their quote via ${method}.`

        // Guard: don't send the personalized fallback email if this should be an instant quote
        // but the user hasn't selected an option yet
        if (enquiry.quote_type === 'instant' && !enquiry.quoted_price) {
          return NextResponse.json(
            { error: 'Cannot send quote: no price selected. Please select a repair option first.' },
            { status: 400, headers: { 'Access-Control-Allow-Origin': '*' } }
          )
        }

        // Actually send the quote
        const quoteUrl = `https://newforestdevicerepairs.co.uk/quote/accept/?ref=${enquiry.enquiry_ref}`
        const isInstant = enquiry.quoted_price && enquiry.quote_type === 'instant'
        const priceText = isInstant ? `£${enquiry.quoted_price}` : 'Personalised quote'
        const warranty = enquiry.warranty || enquiry.screen_option || 'Standard warranty'
        const turnaround = '30–60 mins'
        const deviceName = `${enquiry.device_make || ''} ${enquiry.device_model || ''}`.trim()
        const repairName = enquiry.repair_type || 'repair'

        // Only send SMS/email if method is not 'none' (used for silent enquiry updates)
        if (method !== 'none') {
        if (method === 'sms' || method === 'both') {
          const webhookUrl = process.env.MACRODROID_WEBHOOK_URL
          if (webhookUrl && enquiry.customer_phone) {
            // SMS with line breaks for readability
            // Build additional repairs text for SMS
            const addRepairsText = enquiry.additional_repairs && enquiry.additional_repairs.length > 0
              ? `\n\nAlso booked:\n${enquiry.additional_repairs.map((r: any) => `${r.display_name || r.repair} — £${r.price}`).join('\n')}\nTotal: £${(enquiry.quoted_price || 0) + enquiry.additional_repairs.reduce((s: number, r: any) => s + r.price, 0)}`
              : ''
            const smsMessage = isInstant
              ? `Hi ${enquiry.customer_name},\n\nThanks for filling in the form online. Here's your quote:\n\n${deviceName} ${repairName}: ${priceText}${addRepairsText}\n\nWarranty: ${warranty}\nTurnaround: ${turnaround}\n\nTo proceed, click here:\n${quoteUrl}\n\nValid 14 days. No obligation.\n\nMany thanks,\nNew Forest Device Repairs`
              : `Hi ${enquiry.customer_name},\n\nThanks for filling in the form online about your ${deviceName}.\n\nWe'll get back to you with a personalised quote within working hours (Mon–Fri 10–5, Sat 10–3).\n\nMany thanks,\nNew Forest Device Repairs`
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
            const emailSubject = isInstant
              ? `Your Repair Quote: ${deviceName} ${repairName} — ${priceText}`
              : `Your Repair Enquiry: ${deviceName} — We'll be in touch`

            const emailHtml = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;background:#FAF5E9;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#FAF5E9;padding:24px 0;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 12px rgba(0,0,0,0.08);max-width:600px;">

<!-- Header -->
<tr><td style="background:linear-gradient(135deg,#009B4D,#007a3d);padding:32px 30px;text-align:center;">
<h1 style="color:#fff;margin:0;font-size:22px;font-weight:700;letter-spacing:0.5px;">New Forest Device Repairs</h1>
<p style="color:rgba(255,255,255,0.85);margin:6px 0 0;font-size:13px;">Professional repairs with warranty</p>
</td></tr>

<!-- Body -->
<tr><td style="padding:36px 30px 20px;">
<h2 style="color:#1a1a2e;margin:0 0 16px;font-size:20px;">Hi ${enquiry.customer_name},</h2>
${isInstant ? `
<p style="color:#555;font-size:15px;line-height:1.7;margin:0 0 24px;">Here's your quote for your <strong style="color:#1a1a2e;">${deviceName}</strong> ${repairName}. Ready to go ahead? Just click the button below to reserve your repair — we'll text you to arrange a time that works for you.</p>

<!-- Quote card -->
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fdf9;border:1px solid #e0e0e0;border-radius:12px;margin:0 0 24px;">
<tr><td style="padding:24px 20px;">
<table width="100%" cellpadding="0" cellspacing="0">
<tr>
<td style="padding:8px 0;color:#888;font-size:14px;width:130px;">Device</td>
<td style="padding:8px 0;color:#1a1a2e;font-size:15px;font-weight:600;">${deviceName}</td>
</tr>
<tr>
<td style="padding:8px 0;color:#888;font-size:14px;">Repair</td>
<td style="padding:8px 0;color:#1a1a2e;font-size:15px;font-weight:600;">${repairName}</td>
</tr>
${(enquiry.part_option || enquiry.screen_option) ? `<tr>
<td style="padding:8px 0;color:#888;font-size:14px;">Option</td>
<td style="padding:8px 0;color:#1a1a2e;font-size:15px;font-weight:600;">${enquiry.part_option || enquiry.screen_option}</td>
</tr>` : ''}
<tr>
<td style="padding:8px 0;color:#888;font-size:14px;">Warranty</td>
<td style="padding:8px 0;color:#1a1a2e;font-size:15px;font-weight:600;">${warranty}</td>
</tr>
<tr>
<td style="padding:8px 0;color:#888;font-size:14px;">Turnaround</td>
<td style="padding:8px 0;color:#1a1a2e;font-size:15px;font-weight:600;">${turnaround}</td>
</tr>
${enquiry.additional_repairs && enquiry.additional_repairs.length > 0 ? enquiry.additional_repairs.map((r: any) => `<tr>
<td style="padding:8px 0;color:#888;font-size:14px;">+ ${r.display_name || r.repair}</td>
<td style="padding:8px 0;color:#1a1a2e;font-size:15px;font-weight:600;">£${r.price}</td>
</tr>`).join('') : ''}
<tr><td colspan="2" style="padding:16px 0 0;border-top:2px solid #e0e0e0;margin-top:8px;">
<table width="100%" cellpadding="0" cellspacing="0"><tr>
<td style="padding-top:14px;color:#888;font-size:14px;">${enquiry.additional_repairs && enquiry.additional_repairs.length > 0 ? 'Grand total' : 'Total price'}</td>
<td align="right" style="padding-top:14px;color:#009B4D;font-size:28px;font-weight:700;">£${(enquiry.quoted_price || 0) + (enquiry.additional_repairs ? enquiry.additional_repairs.reduce((s: number, r: any) => s + r.price, 0) : 0)}</td>
</tr></table>
</td></tr>
</table>
</td></tr>
</table>

<!-- CTA button -->
<table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 16px;"><tr><td align="center">
<a href="${quoteUrl}" style="display:inline-block;background:#009B4D;color:#fff;padding:16px 48px;text-decoration:none;border-radius:8px;font-weight:700;font-size:16px;letter-spacing:0.3px;">Reserve My Repair</a>
</td></tr></table>

<p style="color:#999;font-size:13px;line-height:1.6;text-align:center;margin:0 0 0;">This quote is valid for 14 days. No obligation — we'll confirm everything with you before any work starts.</p>
` : `
<p style="color:#555;font-size:15px;line-height:1.7;margin:0 0 20px;">Thanks for your enquiry about your <strong style="color:#1a1a2e;">${deviceName}</strong>. We'll review the details and get back to you with a personalised quote within working hours <strong style="color:#1a1a2e;">(Mon–Fri 10–5, Sat 10–3)</strong>.</p>

${enquiry.issue_description ? `<table width="100%" cellpadding="0" cellspacing="0" style="background:#f8f9fa;border-radius:10px;margin:0 0 24px;"><tr><td style="padding:18px 20px;">
<p style="color:#888;font-size:13px;margin:0 0 6px;text-transform:uppercase;letter-spacing:0.5px;">Your description</p>
<p style="color:#555;font-size:14px;line-height:1.6;margin:0;">${enquiry.issue_description}</p>
</td></tr></table>` : ''}
`}
</td></tr>

<!-- Sign-off -->
<tr><td style="padding:0 30px 24px;">
<p style="color:#555;font-size:15px;line-height:1.7;margin:0 0 8px;">Many thanks,</p>
<p style="color:#1a1a2e;font-size:15px;font-weight:600;margin:0;">New Forest Device Repairs</p>
</td></tr>

<!-- Footer -->
<tr><td style="background:#f8f9fa;padding:24px 30px;border-top:1px solid #eee;">
<table width="100%" cellpadding="0" cellspacing="0">
<tr><td align="center">
<p style="color:#888;font-size:14px;margin:0 0 8px;"><strong style="color:#555;">New Forest Device Repairs</strong></p>
<p style="color:#aaa;font-size:13px;margin:0 0 12px;line-height:1.6;">
Phone: <a href="tel:07410381247" style="color:#009B4D;text-decoration:none;">07410 381247</a> &nbsp;|&nbsp;
Web: <a href="https://newforestdevicerepairs.co.uk" style="color:#009B4D;text-decoration:none;">newforestdevicerepairs.co.uk</a>
</p>
<p style="color:#bbb;font-size:12px;margin:0;">Lymington, New Forest &nbsp;|&nbsp; Mon–Fri 10–5, Sat 10–3</p>
</td></tr>
</table>
</td></tr>

</table>
</td></tr>
</table>
</body></html>`

            const emailText = isInstant
              ? `Hi ${enquiry.customer_name},\n\nThanks for filling in the form online. Here's your quote:\n\n${deviceName} ${repairName}: ${priceText}${enquiry.additional_repairs && enquiry.additional_repairs.length > 0 ? '\n\nAlso booked:\n' + enquiry.additional_repairs.map((r: any) => `${r.display_name || r.repair} — £${r.price}`).join('\n') + '\nTotal: £' + ((enquiry.quoted_price || 0) + enquiry.additional_repairs.reduce((s: number, r: any) => s + r.price, 0)) : ''}\n\nWarranty: ${warranty}\nTurnaround: ${turnaround}\n\nTo proceed, click here:\n${quoteUrl}\n\nValid for 14 days. No obligation — we'll confirm everything before any work starts.\n\nMany thanks,\nNew Forest Device Repairs\n07410 381247\nnewforestdevicerepairs.co.uk`
              : `Hi ${enquiry.customer_name},\n\nThanks for filling in the form online about your ${deviceName}. We'll get back to you with a personalised quote within working hours (Mon–Fri 10–5, Sat 10–3).\n\nMany thanks,\nNew Forest Device Repairs\n07410 381247\nnewforestdevicerepairs.co.uk`
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
        } // end if method !== 'none'
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
