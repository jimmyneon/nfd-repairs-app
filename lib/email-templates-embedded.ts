import { Job } from './types-v3'

export interface EmbeddedEmailData {
  job: Job
  trackingUrl: string
  depositUrl?: string
  statusMessage?: string
}

export function generateEmbeddedJobEmail(data: EmbeddedEmailData, type: 'JOB_CREATED' | 'STATUS_UPDATE'): { subject: string; html: string; text: string } {
  const { job, trackingUrl, depositUrl, statusMessage } = data

  const statusLabels: Record<string, string> = {
    QUOTE_APPROVED: 'Quote Approved',
    DROPPED_OFF: 'Dropped Off',
    RECEIVED: 'Received',
    AWAITING_DEPOSIT: 'Awaiting Deposit',
    PARTS_ORDERED: 'Parts Ordered',
    PARTS_ARRIVED: 'Parts Arrived',
    IN_REPAIR: 'In Repair',
    DELAYED: 'Delayed',
    READY_TO_BOOK_IN: 'Ready to Book In',
    READY_TO_COLLECT: 'Ready to Collect',
    COLLECTED: 'Collected',
    COMPLETED: 'Completed',
    CANCELLED: 'Cancelled',
  }

  const statusColors: Record<string, string> = {
    QUOTE_APPROVED: '#0891B2',
    DROPPED_OFF: '#3B82F6',
    RECEIVED: '#2563EB',
    AWAITING_DEPOSIT: '#EAB308',
    PARTS_ORDERED: '#9333EA',
    PARTS_ARRIVED: '#7C3AED',
    IN_REPAIR: '#EA580C',
    DELAYED: '#DC2626',
    READY_TO_BOOK_IN: '#3B82F6',
    READY_TO_COLLECT: '#16A34A',
    COLLECTED: '#15803D',
    COMPLETED: '#6B7280',
    CANCELLED: '#1F2937',
  }

  const subject = type === 'JOB_CREATED' 
    ? `Job Created: ${job.job_ref} - ${job.device_make} ${job.device_model}`
    : `Status Update: ${job.job_ref} - ${statusLabels[job.status]}`

  // Embedded job tracking section
  const embeddedTracking = `
    <div style="background-color: #f8f9fa; border-radius: 8px; padding: 20px; margin: 20px 0;">
      <h3 style="color: #333333; margin: 0 0 15px 0; font-size: 18px;">Job Details</h3>
      
      <!-- Status Badge -->
      <div style="text-align: center; margin-bottom: 20px;">
        <span style="display: inline-block; background-color: ${statusColors[job.status]}; color: #ffffff; padding: 10px 20px; border-radius: 20px; font-weight: bold; font-size: 14px;">
          ${statusLabels[job.status]}
        </span>
      </div>

      <!-- Job Information -->
      <table width="100%" cellpadding="8" cellspacing="0" style="border-collapse: collapse;">
        <tr>
          <td style="border-bottom: 1px solid #e5e7eb; padding: 12px 0;">
            <strong style="color: #6B7280; font-size: 14px;">Job Reference</strong><br>
            <span style="color: #111827; font-size: 16px; font-weight: bold;">${job.job_ref}</span>
          </td>
        </tr>
        <tr>
          <td style="border-bottom: 1px solid #e5e7eb; padding: 12px 0;">
            <strong style="color: #6B7280; font-size: 14px;">Device</strong><br>
            <span style="color: #111827; font-size: 16px;">${job.device_make} ${job.device_model}</span>
          </td>
        </tr>
        <tr>
          <td style="border-bottom: 1px solid #e5e7eb; padding: 12px 0;">
            <strong style="color: #6B7280; font-size: 14px;">Issue</strong><br>
            <span style="color: #111827; font-size: 16px;">${job.issue}</span>
          </td>
        </tr>
        <tr>
          <td style="border-bottom: 1px solid #e5e7eb; padding: 12px 0;">
            <strong style="color: #6B7280; font-size: 14px;">Total Price</strong><br>
            <span style="color: #111827; font-size: 20px; font-weight: bold;">£${job.price_total.toFixed(2)}</span>
          </td>
        </tr>
        ${job.deposit_required ? `
        <tr>
          <td style="border-bottom: 1px solid #e5e7eb; padding: 12px 0;">
            <strong style="color: #6B7280; font-size: 14px;">Deposit Required</strong><br>
            <span style="color: #F59E0B; font-size: 18px; font-weight: bold;">£${job.deposit_amount?.toFixed(2) || '20.00'}</span>
            ${!job.deposit_received ? '<br><span style="color: #DC2626; font-size: 12px;">⚠️ Not yet received</span>' : '<br><span style="color: #059669; font-size: 12px;">✓ Received</span>'}
          </td>
        </tr>
        ` : ''}
        <tr>
          <td style="padding: 12px 0;">
            <strong style="color: #6B7280; font-size: 14px;">Created</strong><br>
            <span style="color: #111827; font-size: 14px;">${new Date(job.created_at).toLocaleDateString('en-GB', { 
              day: 'numeric', 
              month: 'long', 
              year: 'numeric',
              hour: '2-digit',
              minute: '2-digit'
            })}</span>
          </td>
        </tr>
      </table>
    </div>
  `

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
</head>
<body style="margin: 0; padding: 0; font-family: 'Poppins', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f8f9fa;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f8f9fa; padding: 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.1);">
          
          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #009B4D 0%, #007A3D 100%); padding: 40px 30px; text-align: center;">
              <h1 style="color: #ffffff; margin: 0; font-size: 28px; font-weight: 600; font-family: 'Poppins', sans-serif;">New Forest Device Repairs</h1>
              <p style="color: rgba(255,255,255,0.9); margin: 8px 0 0 0; font-size: 14px; font-weight: 300;">Professional Device Repair Services</p>
            </td>
          </tr>

          <!-- Main Content -->
          <tr>
            <td style="padding: 40px 30px;">
              <h2 style="color: #333333; margin: 0 0 20px 0; font-size: 24px;">Hi ${job.customer_name},</h2>
              
              ${type === 'JOB_CREATED' ? `
                <p style="color: #666666; font-size: 16px; line-height: 1.6; margin: 0 0 20px 0;">
                  Thank you for choosing New Forest Device Repairs! We've received your <strong>${job.device_make} ${job.device_model}</strong> and created a repair job for you.
                </p>
              ` : `
                <p style="color: #666666; font-size: 16px; line-height: 1.6; margin: 0 0 20px 0;">
                  Your <strong>${job.device_make} ${job.device_model}</strong> repair has been updated.
                </p>
                ${statusMessage ? `
                  <div style="background-color: #E8F5E9; border-left: 4px solid #009B4D; padding: 15px; margin: 20px 0; border-radius: 4px;">
                    <p style="color: #1B5E20; margin: 0; font-size: 15px; line-height: 1.5;">
                      ${statusMessage}
                    </p>
                  </div>
                ` : ''}
              `}

              <!-- Embedded Job Tracking -->
              ${embeddedTracking}

              ${job.deposit_required && !job.deposit_received && depositUrl ? `
                <!-- Deposit Alert -->
                <div style="background-color: #FFF3CD; border-left: 4px solid #F59E0B; padding: 20px; margin: 20px 0; border-radius: 4px;">
                  <h3 style="color: #856404; margin: 0 0 10px 0; font-size: 18px;">💳 Deposit Required</h3>
                  <p style="color: #856404; margin: 0 0 15px 0; font-size: 15px;">
                    We need a <strong>£${job.deposit_amount?.toFixed(2) || '20.00'}</strong> deposit to order the parts for your repair.
                  </p>
                  <table width="100%" cellpadding="0" cellspacing="0">
                    <tr>
                      <td align="center">
                        <a href="${depositUrl}" style="display: inline-block; background-color: #F59E0B; color: #ffffff; padding: 14px 35px; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 16px; box-shadow: 0 2px 4px rgba(245, 158, 11, 0.3);">Pay Deposit Now</a>
                      </td>
                    </tr>
                  </table>
                </div>
              ` : ''}

              <!-- Action Buttons -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin: 30px 0;">
                <tr>
                  <td align="center">
                    <a href="${trackingUrl}" style="display: inline-block; background-color: #009B4D; color: #ffffff; padding: 16px 45px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px; box-shadow: 0 2px 8px rgba(0, 155, 77, 0.25); margin-bottom: 12px;">View Full Tracking Page</a>
                  </td>
                </tr>
                <tr>
                  <td align="center" style="padding-top: 12px;">
                    <a href="https://www.newforestdevicerepairs.co.uk/start" style="display: inline-block; background-color: #ffffff; color: #009B4D; padding: 14px 35px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 15px; border: 2px solid #009B4D;">Contact Us</a>
                  </td>
                </tr>
              </table>

              <p style="color: #999999; font-size: 12px; line-height: 1.5; margin: 25px 0 0 0; text-align: center; font-style: italic;">
                ⚠️ This is an automated notification email. Please do not reply to this email.<br>
                For questions or support, please use the Contact Us button above.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #f8f9fa; padding: 30px; text-align: center; border-top: 1px solid #e5e7eb;">
              <p style="color: #1a1a2e; font-size: 15px; font-weight: 600; margin: 0 0 12px 0;">
                New Forest Device Repairs
              </p>
              <p style="color: #666666; font-size: 13px; margin: 0 0 8px 0;">
                🌐 <a href="https://www.newforestdevicerepairs.co.uk" style="color: #009B4D; text-decoration: none; font-weight: 500;">newforestdevicerepairs.co.uk</a>
              </p>
              <p style="color: #999999; font-size: 11px; margin: 15px 0 0 0; line-height: 1.4;">
                Job Reference: ${job.job_ref}<br>
                This is an automated notification from newforestdevicerepairs.co.uk
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
Hi ${job.customer_name},

${type === 'JOB_CREATED' 
  ? `Thank you for choosing New Forest Device Repairs! We've received your ${job.device_make} ${job.device_model} and created a repair job for you.`
  : `Your ${job.device_make} ${job.device_model} repair has been updated.`
}

${statusMessage ? `\n${statusMessage}\n` : ''}

JOB DETAILS
-----------
Job Reference: ${job.job_ref}
Device: ${job.device_make} ${job.device_model}
Issue: ${job.issue}
Status: ${statusLabels[job.status]}
Total Price: £${job.price_total.toFixed(2)}
${job.deposit_required ? `Deposit Required: £${job.deposit_amount?.toFixed(2) || '20.00'} ${!job.deposit_received ? '(Not yet received)' : '(Received)'}` : ''}
Created: ${new Date(job.created_at).toLocaleDateString('en-GB')}

${job.deposit_required && !job.deposit_received && depositUrl ? `
DEPOSIT REQUIRED
We need a £${job.deposit_amount?.toFixed(2) || '20.00'} deposit to order the parts for your repair.
Pay here: ${depositUrl}
` : ''}

View full tracking page: ${trackingUrl}

Contact us: https://www.newforestdevicerepairs.co.uk/start

---
⚠️ DO NOT REPLY TO THIS EMAIL
This is an automated notification. For questions or support, please use the contact link above.

New Forest Device Repairs
Web: newforestdevicerepairs.co.uk
Job Reference: ${job.job_ref}
  `

  return { subject, html, text }
}
