import { Job } from './types-v3'

export interface PostCollectionEmailData {
  job: Job
  googleReviewLink: string
}

/**
 * Get cross-sell content based on device type
 * Returns relevant services the customer might be interested in
 */
function getCrossSellContent(deviceMake: string, deviceModel: string): {
  heading: string
  services: Array<{ icon: string; title: string; description: string }>
} {
  const deviceLower = `${deviceMake} ${deviceModel}`.toLowerCase()
  
  // Mobile phones
  if (deviceLower.includes('iphone') || deviceLower.includes('samsung') || 
      deviceLower.includes('huawei') || deviceLower.includes('pixel') ||
      deviceLower.includes('oneplus') || deviceLower.includes('motorola') ||
      deviceLower.includes('nokia') || deviceLower.includes('oppo')) {
    return {
      heading: 'We also repair other devices',
      services: [
        {
          icon: '💻',
          title: 'Laptop Repairs',
          description: 'Screen replacements, battery issues, running slow? We can help with all laptop brands.'
        },
        {
          icon: '📱',
          title: 'Tablet Repairs',
          description: 'iPad and Android tablet repairs - screens, batteries, charging ports and more.'
        },
        {
          icon: '🎮',
          title: 'Console Repairs',
          description: 'PlayStation, Xbox, Nintendo Switch - we fix them all. HDMI ports, disc drives, overheating.'
        }
      ]
    }
  }
  
  // Tablets (iPad, Samsung Tab, etc)
  if (deviceLower.includes('ipad') || deviceLower.includes('tab ') || 
      deviceLower.includes('tablet') || deviceLower.includes('surface')) {
    return {
      heading: 'We also repair other devices',
      services: [
        {
          icon: '📱',
          title: 'Mobile Phone Repairs',
          description: 'iPhone, Samsung, and all major brands. Screen repairs, battery replacements, water damage.'
        },
        {
          icon: '💻',
          title: 'Laptop Repairs',
          description: 'Laptop running slow? Broken screen? Battery issues? We repair all brands.'
        },
        {
          icon: '🎮',
          title: 'Console Repairs',
          description: 'PlayStation, Xbox, Nintendo Switch repairs. HDMI issues, disc drives, overheating.'
        }
      ]
    }
  }
  
  // Laptops (MacBook, Dell, HP, etc)
  if (deviceLower.includes('macbook') || deviceLower.includes('laptop') || 
      deviceLower.includes('dell') || deviceLower.includes('hp') || 
      deviceLower.includes('lenovo') || deviceLower.includes('asus') ||
      deviceLower.includes('acer') || deviceLower.includes('surface')) {
    return {
      heading: 'We also repair other devices',
      services: [
        {
          icon: '📱',
          title: 'Mobile Phone Repairs',
          description: 'iPhone, Samsung, and all major brands. Screen repairs, battery replacements, charging issues.'
        },
        {
          icon: '📱',
          title: 'Tablet Repairs',
          description: 'iPad and Android tablet repairs - screens, batteries, charging ports and more.'
        },
        {
          icon: '🎮',
          title: 'Console Repairs',
          description: 'PlayStation, Xbox, Nintendo Switch. HDMI ports, disc drives, overheating issues.'
        }
      ]
    }
  }
  
  // Gaming Consoles
  if (deviceLower.includes('playstation') || deviceLower.includes('ps4') || 
      deviceLower.includes('ps5') || deviceLower.includes('xbox') || 
      deviceLower.includes('switch') || deviceLower.includes('nintendo')) {
    return {
      heading: 'We also repair other devices',
      services: [
        {
          icon: '📱',
          title: 'Mobile Phone Repairs',
          description: 'iPhone, Samsung, and all major brands. Screen repairs, battery replacements, water damage.'
        },
        {
          icon: '💻',
          title: 'Laptop Repairs',
          description: 'Laptop running slow? Broken screen? Battery issues? We repair all laptop brands.'
        },
        {
          icon: '📱',
          title: 'Tablet Repairs',
          description: 'iPad and Android tablet repairs - screens, batteries, charging ports and more.'
        }
      ]
    }
  }
  
  // Default fallback
  return {
    heading: 'We repair all types of devices',
    services: [
      {
        icon: '📱',
        title: 'Mobile Phones',
        description: 'iPhone, Samsung, and all major brands. Screen repairs, battery replacements, charging issues.'
      },
      {
        icon: '💻',
        title: 'Laptops & Tablets',
        description: 'MacBooks, Windows laptops, iPads, Android tablets. Screens, batteries, performance issues.'
      },
      {
        icon: '🎮',
        title: 'Gaming Consoles',
        description: 'PlayStation, Xbox, Nintendo Switch. HDMI ports, disc drives, overheating issues.'
      }
    ]
  }
}

/**
 * Generate post-collection email with review request and dynamic cross-sell
 */
export function generatePostCollectionEmail(data: PostCollectionEmailData): {
  subject: string
  html: string
  text: string
} {
  const { job, googleReviewLink } = data
  const firstName = job.customer_name.split(' ')[0]
  const crossSell = getCrossSellContent(job.device_make, job.device_model)

  const subject = `Thanks for choosing us - ${job.job_ref}`

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f3f4f6;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f3f4f6; padding: 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); max-width: 600px;">
          
          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #009B4D 0%, #007A3D 100%); padding: 30px; text-align: center; border-radius: 8px 8px 0 0;">
              <h1 style="color: #ffffff; margin: 0; font-size: 28px; font-weight: bold;">New Forest Device Repairs</h1>
              <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0 0; font-size: 14px;">Thanks for choosing us!</p>
            </td>
          </tr>

          <!-- Main Content -->
          <tr>
            <td style="padding: 30px;">
              <h2 style="color: #111827; margin: 0 0 20px 0; font-size: 24px;">Hi ${firstName},</h2>
              
              <p style="color: #4B5563; font-size: 16px; line-height: 1.6; margin: 0 0 20px 0;">
                Thanks again for choosing New Forest Device Repairs for your <strong>${job.device_make} ${job.device_model}</strong> repair.
              </p>

              <!-- Support Section -->
              <div style="background-color: #F0FDF4; border-left: 4px solid #009B4D; border-radius: 8px; padding: 20px; margin: 25px 0;">
                <h3 style="color: #009B4D; margin: 0 0 12px 0; font-size: 18px; font-weight: bold;">Need Help?</h3>
                <p style="color: #166534; margin: 0; font-size: 15px; line-height: 1.6;">
                  If you notice any problems at all with your repair, please don't hesitate to get in touch. Just reply to this email or give us a call, and we'll sort it out straight away.
                </p>
              </div>

              <!-- Review Request -->
              <div style="background-color: #EFF6FF; border: 2px solid #3B82F6; border-radius: 8px; padding: 25px; margin: 25px 0; text-align: center;">
                <h3 style="color: #1E40AF; margin: 0 0 15px 0; font-size: 20px; font-weight: bold;">Everything Working Well?</h3>
                <p style="color: #1E3A8A; margin: 0 0 20px 0; font-size: 15px; line-height: 1.6;">
                  We'd really appreciate a quick 5-star review. It helps other local customers know they can rely on us for quality repairs.
                </p>
                <a href="${googleReviewLink}" style="display: inline-block; background-color: #3B82F6; color: #ffffff; padding: 14px 35px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px; box-shadow: 0 2px 8px rgba(59, 130, 246, 0.3);">
                  Leave a 5-Star Review
                </a>
                <p style="color: #6B7280; margin: 15px 0 0 0; font-size: 13px; font-style: italic;">
                  Takes less than 60 seconds
                </p>
              </div>

              <!-- Cross-Sell Section -->
              <div style="margin: 30px 0;">
                <h3 style="color: #111827; margin: 0 0 20px 0; font-size: 20px; text-align: center;">${crossSell.heading}</h3>
                
                ${crossSell.services.map(service => `
                <div style="background-color: #F9FAFB; border-radius: 8px; padding: 20px; margin-bottom: 15px;">
                  <table width="100%" cellpadding="0" cellspacing="0">
                    <tr>
                      <td width="50" valign="top">
                        <div style="font-size: 32px; line-height: 1;">${service.icon}</div>
                      </td>
                      <td style="padding-left: 15px;">
                        <h4 style="color: #111827; margin: 0 0 8px 0; font-size: 16px; font-weight: bold;">${service.title}</h4>
                        <p style="color: #6B7280; margin: 0; font-size: 14px; line-height: 1.5;">
                          ${service.description}
                        </p>
                      </td>
                    </tr>
                  </table>
                </div>
                `).join('')}
              </div>

              <!-- Contact CTA -->
              <div style="text-align: center; margin: 30px 0;">
                <p style="color: #6B7280; margin: 0 0 15px 0; font-size: 15px;">
                  Got another device that needs fixing?
                </p>
                <a href="https://www.newforestdevicerepairs.co.uk/start" style="display: inline-block; background-color: #009B4D; color: #ffffff; padding: 14px 35px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px; box-shadow: 0 2px 8px rgba(0, 155, 77, 0.25);">
                  Get in Touch
                </a>
              </div>

              <!-- Footer Note -->
              <div style="border-top: 1px solid #E5E7EB; padding-top: 20px; margin-top: 30px;">
                <p style="color: #6B7280; font-size: 13px; line-height: 1.6; margin: 0; text-align: center;">
                  <strong>Job Reference:</strong> ${job.job_ref}<br>
                  <strong>Device:</strong> ${job.device_make} ${job.device_model}
                </p>
              </div>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #f8f9fa; padding: 25px; text-align: center; border-top: 1px solid #e5e7eb;">
              <p style="color: #1a1a2e; font-size: 15px; font-weight: 600; margin: 0 0 10px 0;">
                New Forest Device Repairs
              </p>
              <p style="color: #666666; font-size: 13px; margin: 0 0 5px 0;">
                📞 07410 381247
              </p>
              <p style="color: #666666; font-size: 13px; margin: 0 0 8px 0;">
                🌐 <a href="https://www.newforestdevicerepairs.co.uk" style="color: #009B4D; text-decoration: none; font-weight: 500;">newforestdevicerepairs.co.uk</a>
              </p>
              <p style="color: #999999; font-size: 11px; margin: 15px 0 0 0; line-height: 1.4;">
                Thanks for supporting a local business!
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
Hi ${firstName},

Thanks again for choosing New Forest Device Repairs for your ${job.device_make} ${job.device_model} repair.

NEED HELP?
If you notice any problems at all with your repair, please don't hesitate to get in touch. Just reply to this email or give us a call, and we'll sort it out straight away.

EVERYTHING WORKING WELL?
We'd really appreciate a quick 5-star review. It helps other local customers know they can rely on us for quality repairs.

Leave a review here: ${googleReviewLink}

${crossSell.heading.toUpperCase()}

${crossSell.services.map(service => `
${service.icon} ${service.title}
${service.description}
`).join('\n')}

Got another device that needs fixing?
Get in touch: https://www.newforestdevicerepairs.co.uk/start

---
Job Reference: ${job.job_ref}
Device: ${job.device_make} ${job.device_model}

New Forest Device Repairs
Phone: 07410 381247
Web: newforestdevicerepairs.co.uk

Thanks for supporting a local business!
  `

  return { subject, html, text }
}
