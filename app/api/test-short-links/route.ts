import { NextRequest, NextResponse } from 'next/server'
import { sendEmail } from '@/lib/email'
import { shortTrackingLink, shortOnboardingLink, shortPasswordLink, shortQuoteApprovalLink, shortReviewLink } from '@/lib/utils'

export async function POST(request: NextRequest) {
  try {
    const { email } = await request.json()

    if (!email) {
      return NextResponse.json({ error: 'Email address required' }, { status: 400 })
    }

    const testToken = 'a1b2c3d4e5f6'
    const testJobId = 'test-job-123'
    const testJobRef = 'NFD-TEST-001'

    const links = [
      { label: 'Tracking Link', url: shortTrackingLink(testToken), redirectsTo: 'nfd-repairs-app.vercel.app/t/' + testToken },
      { label: 'Onboarding Link', url: shortOnboardingLink(testToken), redirectsTo: 'nfd-repairs-app.vercel.app/onboard/' + testToken },
      { label: 'Password Link', url: shortPasswordLink(testToken), redirectsTo: 'nfd-repairs-app.vercel.app/password/' + testToken },
      { label: 'Quote Approval Link', url: shortQuoteApprovalLink(testJobId), redirectsTo: 'nfd-repairs-app.vercel.app/quote/approve?jobId=' + testJobId },
      { label: 'Review Link', url: shortReviewLink(testJobRef), redirectsTo: 'newforestdevicerepairs.co.uk/review/?ref=' + testJobRef },
    ]

    const html = `
<!DOCTYPE html>
<html>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
  <h1 style="color: #009B4D;">Short Link Test — nfdr.uk</h1>
  <p style="color: #666; font-size: 15px;">Click each link below to verify the redirects work correctly. Each link should redirect to the destination shown.</p>

  <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
    <tr style="background: #f3f4f6;">
      <th style="padding: 12px; text-align: left; border: 1px solid #e5e7eb;">Link Type</th>
      <th style="padding: 12px; text-align: left; border: 1px solid #e5e7eb;">Short URL (click to test)</th>
      <th style="padding: 12px; text-align: left; border: 1px solid #e5e7eb;">Should Redirect To</th>
    </tr>
    ${links.map(l => `
    <tr>
      <td style="padding: 12px; border: 1px solid #e5e7eb; font-weight: 600;">${l.label}</td>
      <td style="padding: 12px; border: 1px solid #e5e7eb;"><a href="${l.url}" style="color: #009B4D;">${l.url}</a></td>
      <td style="padding: 12px; border: 1px solid #e5e7eb; font-size: 12px; color: #666; word-break: break-all;">${l.redirectsTo}</td>
    </tr>
    `).join('')}
  </table>

  <p style="color: #999; font-size: 13px; margin-top: 30px;">
    Test sent at ${new Date().toISOString()}<br>
    If a link doesn't redirect, check the .htaccess rules on nfdr.uk.
  </p>
</body>
</html>
    `

    const text = `
Short Link Test — nfdr.uk

${links.map(l => `${l.label}: ${l.url} → ${l.redirectsTo}`).join('\n\n')}

Test sent at ${new Date().toISOString()}
    `

    const result = await sendEmail(
      email,
      'Test: nfdr.uk Short Links — Click to verify redirects',
      html,
      text
    )

    if (result.success) {
      return NextResponse.json({ success: true, message: `Test email sent to ${email}`, links })
    } else {
      return NextResponse.json({ error: 'Failed to send email', details: result.error }, { status: 500 })
    }
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown' }, { status: 500 })
  }
}
