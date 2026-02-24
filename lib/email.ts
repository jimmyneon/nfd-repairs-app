import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY || 'dummy_key_for_build')

export interface EmailTemplate {
  subject: string
  html: string
  text: string
}

export async function sendEmail(
  to: string,
  subject: string,
  html: string,
  text?: string
) {
  try {
    // Check if API key is configured
    if (!process.env.RESEND_API_KEY || process.env.RESEND_API_KEY === 'dummy_key_for_build') {
      console.warn('RESEND_API_KEY not configured - email not sent')
      return { success: false, error: 'Email service not configured' }
    }

    const { data, error } = await resend.emails.send({
      from: 'NFD Repairs <repairs@updates.newforestdevicerepairs.co.uk>',
      to: [to],
      subject,
      html,
      text: text || stripHtml(html),
    })

    if (error) {
      console.error('Failed to send email:', error)
      return { success: false, error }
    }

    return { success: true, data }
  } catch (error) {
    console.error('Email send error:', error)
    return { success: false, error }
  }
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim()
}

export function generateJobCreatedEmail(
  customerName: string,
  jobRef: string,
  deviceMake: string,
  deviceModel: string,
  issue: string,
  priceTotal: number,
  trackingUrl: string,
  depositRequired: boolean,
  depositAmount?: number,
  depositUrl?: string
): EmailTemplate {
  const subject = `Job Created: ${jobRef} - ${deviceMake} ${deviceModel}`
  
  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
</head>
<body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #FAF5E9;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #FAF5E9; padding: 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
          <tr>
            <td style="background-color: #009B4D; padding: 30px; text-align: center;">
              <h1 style="color: #ffffff; margin: 0; font-size: 28px;">New Forest Device Repairs</h1>
            </td>
          </tr>
          <tr>
            <td style="padding: 40px 30px;">
              <h2 style="color: #333333; margin: 0 0 20px 0;">Hi ${customerName},</h2>
              <p style="color: #666666; font-size: 16px; line-height: 1.6; margin: 0 0 20px 0;">
                We've received your <strong>${deviceMake} ${deviceModel}</strong> for repair.
              </p>
              
              <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f8f9fa; border-radius: 6px; padding: 20px; margin: 20px 0;">
                <tr>
                  <td>
                    <p style="margin: 0 0 10px 0; color: #666666;"><strong>Job Reference:</strong> ${jobRef}</p>
                    <p style="margin: 0 0 10px 0; color: #666666;"><strong>Device:</strong> ${deviceMake} ${deviceModel}</p>
                    <p style="margin: 0 0 10px 0; color: #666666;"><strong>Issue:</strong> ${issue}</p>
                    <p style="margin: 0; color: #666666;"><strong>Total Price:</strong> £${priceTotal.toFixed(2)}</p>
                  </td>
                </tr>
              </table>

              ${depositRequired ? `
              <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #fff3cd; border-left: 4px solid #ffc107; padding: 20px; margin: 20px 0;">
                <tr>
                  <td>
                    <h3 style="color: #856404; margin: 0 0 10px 0;">Deposit Required</h3>
                    <p style="color: #856404; margin: 0 0 15px 0;">
                      We need a £${depositAmount?.toFixed(2) || '20.00'} deposit to order the parts for your repair.
                    </p>
                    <a href="${depositUrl}" style="display: inline-block; background-color: #009B4D; color: #ffffff; padding: 12px 30px; text-decoration: none; border-radius: 4px; font-weight: bold;">Pay Deposit Now</a>
                  </td>
                </tr>
              </table>
              ` : ''}

              <p style="color: #666666; font-size: 16px; line-height: 1.6; margin: 20px 0;">
                You can track your repair progress at any time using the link below:
              </p>

              <table width="100%" cellpadding="0" cellspacing="0" style="margin: 20px 0;">
                <tr>
                  <td align="center">
                    <a href="${trackingUrl}" style="display: inline-block; background-color: #009B4D; color: #ffffff; padding: 15px 40px; text-decoration: none; border-radius: 4px; font-weight: bold; font-size: 16px;">Track Your Repair</a>
                  </td>
                </tr>
              </table>

              <p style="color: #666666; font-size: 14px; line-height: 1.6; margin: 20px 0 0 0;">
                If you have any questions, please don't hesitate to contact us.
              </p>
            </td>
          </tr>
          <tr>
            <td style="background-color: #f8f9fa; padding: 20px 30px; text-align: center;">
              <p style="color: #666666; font-size: 14px; margin: 0 0 10px 0;">
                <strong>New Forest Device Repairs</strong><br>
                Phone: 07410 381247<br>
                Web: <a href="https://newforestdevicerepairs.co.uk" style="color: #009B4D;">newforestdevicerepairs.co.uk</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `

  const text = `
Hi ${customerName},

We've received your ${deviceMake} ${deviceModel} for repair.

Job Reference: ${jobRef}
Device: ${deviceMake} ${deviceModel}
Issue: ${issue}
Total Price: £${priceTotal.toFixed(2)}

${depositRequired ? `
DEPOSIT REQUIRED
We need a £${depositAmount?.toFixed(2) || '20.00'} deposit to order the parts for your repair.
Pay here: ${depositUrl}
` : ''}

Track your repair: ${trackingUrl}

If you have any questions, please don't hesitate to contact us.

New Forest Device Repairs
Phone: 07410 381247
Web: newforestdevicerepairs.co.uk
  `

  return { subject, html, text }
}

export function generateStatusUpdateEmail(
  customerName: string,
  jobRef: string,
  deviceMake: string,
  deviceModel: string,
  status: string,
  statusLabel: string,
  trackingUrl: string,
  message?: string
): EmailTemplate {
  const subject = `Status Update: ${jobRef} - ${statusLabel}`
  
  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
</head>
<body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #FAF5E9;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #FAF5E9; padding: 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
          <tr>
            <td style="background-color: #009B4D; padding: 30px; text-align: center;">
              <h1 style="color: #ffffff; margin: 0; font-size: 28px;">New Forest Device Repairs</h1>
            </td>
          </tr>
          <tr>
            <td style="padding: 40px 30px;">
              <h2 style="color: #333333; margin: 0 0 20px 0;">Hi ${customerName},</h2>
              <p style="color: #666666; font-size: 16px; line-height: 1.6; margin: 0 0 20px 0;">
                Your <strong>${deviceMake} ${deviceModel}</strong> repair has been updated.
              </p>
              
              <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #e8f5e9; border-radius: 6px; padding: 20px; margin: 20px 0;">
                <tr>
                  <td align="center">
                    <p style="margin: 0 0 10px 0; color: #666666; font-size: 14px;">New Status</p>
                    <p style="margin: 0; color: #009B4D; font-size: 24px; font-weight: bold;">${statusLabel}</p>
                  </td>
                </tr>
              </table>

              ${message ? `
              <p style="color: #666666; font-size: 16px; line-height: 1.6; margin: 20px 0;">
                ${message}
              </p>
              ` : ''}

              <table width="100%" cellpadding="0" cellspacing="0" style="margin: 20px 0;">
                <tr>
                  <td align="center">
                    <a href="${trackingUrl}" style="display: inline-block; background-color: #009B4D; color: #ffffff; padding: 15px 40px; text-decoration: none; border-radius: 4px; font-weight: bold; font-size: 16px;">View Full Details</a>
                  </td>
                </tr>
              </table>

              <p style="color: #666666; font-size: 14px; line-height: 1.6; margin: 20px 0 0 0;">
                Job Reference: ${jobRef}
              </p>
            </td>
          </tr>
          <tr>
            <td style="background-color: #f8f9fa; padding: 20px 30px; text-align: center;">
              <p style="color: #666666; font-size: 14px; margin: 0 0 10px 0;">
                <strong>New Forest Device Repairs</strong><br>
                Phone: 07410 381247<br>
                Web: <a href="https://newforestdevicerepairs.co.uk" style="color: #009B4D;">newforestdevicerepairs.co.uk</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `

  const text = `
Hi ${customerName},

Your ${deviceMake} ${deviceModel} repair has been updated.

New Status: ${statusLabel}

${message ? message : ''}

Track your repair: ${trackingUrl}

Job Reference: ${jobRef}

New Forest Device Repairs
Phone: 07410 381247
Web: newforestdevicerepairs.co.uk
  `

  return { subject, html, text }
}
