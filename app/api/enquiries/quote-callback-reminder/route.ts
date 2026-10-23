import { NextRequest, NextResponse } from 'next/server'
import { requireCronSecret } from '@/lib/api-auth'
import { createServiceClient, isWithinUKSendingHours } from '@/lib/resilience'
import { parseOpeningHours } from '@/lib/awaiting-device-followup'
import { isShopOpenOnDate } from '@/lib/quote-followup'
import { getFirstName, safeDeviceLabel } from '@/lib/sms-template'

export const maxDuration = 60

const REMINDER_TYPE = 'CALLBACK_REMINDER'
// Alex tells personalised-quote callers the team will get back to them
// "usually within the hour" — nudge staff once that hour has slipped.
const REMIND_AFTER_MS = 60 * 60 * 1000
// Beyond ~26h a stale pending enquiry is no longer a live callback promise.
const TOO_OLD_MS = 26 * 60 * 60 * 1000

export async function GET(request: NextRequest) {
  const cronResponse = requireCronSecret(request)
  if (cronResponse) return cronResponse

  if (!isWithinUKSendingHours()) {
    return NextResponse.json({ success: true, skipped: true, reminded: 0, message: 'Outside UK sending hours' })
  }

  try {
    const supabase = createServiceClient()

    const { data: hoursSetting } = await supabase
      .from('admin_settings')
      .select('value')
      .eq('key', 'opening_hours')
      .maybeSingle()

    const openingHours = parseOpeningHours(hoursSetting?.value)
    const now = new Date()

    if (!isShopOpenOnDate(openingHours, now)) {
      return NextResponse.json({ success: true, skipped: true, reminded: 0, message: 'Shop is closed; reminders roll to the next open day.' })
    }

    const overdueSince = new Date(Date.now() - REMIND_AFTER_MS).toISOString()
    const tooOld = new Date(Date.now() - TOO_OLD_MS).toISOString()

    // Still-waiting personalised quotes: pending, unpriced, unsent, unconverted.
    const { data: waiting, error } = await supabase
      .from('enquiries')
      .select('id,enquiry_ref,customer_name,device_make,device_model,repair_type,preferred_contact_method,created_at')
      .eq('enquiry_type', 'repair_quote')
      .eq('status', 'pending')
      .is('quoted_price', null)
      .is('quote_sent_at', null)
      .or('converted_to_job.is.null,converted_to_job.eq.false')
      .lte('created_at', overdueSince)
      .gte('created_at', tooOld)
      .order('created_at', { ascending: true })
      .limit(20)

    if (error) {
      console.error('[callback-reminder] Enquiry query failed:', error)
      return NextResponse.json({ error: 'Failed to query pending quotes' }, { status: 500 })
    }

    if (!waiting?.length) {
      return NextResponse.json({ success: true, reminded: 0 })
    }

    // One reminder per enquiry — dedup on the notification we already filed.
    const links = waiting.map(e => `/app/enquiries?ref=${e.enquiry_ref}`)
    const { data: already } = await supabase
      .from('notifications')
      .select('link')
      .eq('type', REMINDER_TYPE)
      .in('link', links)
    const remindedLinks = new Set((already || []).map((n: { link: string | null }) => n.link))
    const due = waiting.filter(e => !remindedLinks.has(`/app/enquiries?ref=${e.enquiry_ref}`))

    if (!due.length) {
      return NextResponse.json({ success: true, reminded: 0 })
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://nfd-repairs-app.vercel.app'
    let reminded = 0

    for (const enquiry of due) {
      const name = enquiry.customer_name || 'Customer'
      const device = safeDeviceLabel(enquiry.device_make, enquiry.device_model) || 'device'
      const repair = enquiry.repair_type || 'repair'
      const via = enquiry.preferred_contact_method === 'call'
        ? 'asked for a phone call back'
        : enquiry.preferred_contact_method === 'email'
          ? 'asked for the quote by email'
          : 'asked for the quote by text'
      const link = `/app/enquiries?ref=${enquiry.enquiry_ref}`
      const title = `⏰ QUOTE OVERDUE: ${device}`
      const body = `${getFirstName(name)} (${name}) — ${repair} — ${via}. Filed ${new Date(enquiry.created_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })} and still no quote sent — the caller was told within the hour.`

      const { error: notifError } = await supabase.from('notifications').insert({
        type: REMINDER_TYPE,
        title,
        body,
        link,
        is_read: false,
      } as any)
      if (notifError) {
        console.error('[callback-reminder] Notification insert failed:', notifError)
        continue
      }

      // NF Hub push — same channel as the original enquiry alert so the
      // reminder lands on the staff phone, not just the in-app list.
      try {
        await fetch('https://notify-50nol3u3c-jimmys-projects-9bf84ee4.vercel.app/api/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            app_id: 'nfd-repairs',
            title,
            body,
            category: 'status_update',
            priority: 'high',
            deep_link: `${appUrl}${link}`,
          }),
        })
      } catch (e) {
        console.error('[callback-reminder] Push send failed:', e)
      }

      reminded++
    }

    return NextResponse.json({ success: true, reminded, waiting: waiting.length })
  } catch (e: any) {
    console.error('[callback-reminder] Handler error:', e)
    return NextResponse.json({ error: e?.message || 'Reminder failed' }, { status: 500 })
  }
}
