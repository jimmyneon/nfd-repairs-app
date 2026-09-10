import { NextRequest, NextResponse } from 'next/server'
import { requireStaffUser } from '@/lib/api-auth'
import { getAppUrl } from '@/lib/utils'
import { sendViaMacroDroid } from '@/lib/resilience'

export const dynamic = 'force-dynamic'

const LINKS = {
  quote: 'https://nfdr.uk/quote',
  walk_in: `${getAppUrl()}/walk-in`,
} as const

export async function POST(request: NextRequest) {
  const auth = await requireStaffUser(request)
  if (auth.response) return auth.response

  const { phone, customerName, formType } = await request.json()
  const cleanPhone = typeof phone === 'string' ? phone.trim() : ''
  const type = formType as keyof typeof LINKS

  if (!cleanPhone || !LINKS[type]) {
    return NextResponse.json({ error: 'A phone number and valid form type are required' }, { status: 400 })
  }

  const firstName = typeof customerName === 'string' && customerName.trim()
    ? customerName.trim().split(/\s+/)[0]
    : 'there'
  const isQuote = type === 'quote'
  const message = isQuote
    ? `Hi ${firstName}! 👋\n\nPlease use this link to get a repair quote for your device:\n${LINKS.quote}\n\nNFD Repairs`
    : `Hi ${firstName}! 👋\n\nPlease use this link to check in your device and fill in your details:\n${LINKS.walk_in}\n\nYou can fill it in now or later — the link works on your phone.\n\nNFD Repairs`

  const webhookUrl = process.env.MACRODROID_WEBHOOK_URL
  if (!webhookUrl) return NextResponse.json({ error: 'SMS service is not configured' }, { status: 500 })

  const smsResponse = await sendViaMacroDroid(webhookUrl, cleanPhone, message)

  if (!smsResponse.ok) {
    return NextResponse.json({ error: 'The SMS service did not accept the message' }, { status: 502 })
  }

  return NextResponse.json({ success: true, message, link: LINKS[type] })
}
