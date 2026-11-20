import type { createServiceClient } from '@/lib/resilience'

type Client = ReturnType<typeof createServiceClient>
type Alert = { title: string; body: string; jobId?: string | null; deepLink: string }

/** Acknowledgement means an alert service accepted the message, not that the
 * handset displayed it. Keep failures retryable by Stripe after payment settles. */
export async function sendStaffPaymentNotification(
  supabase: Client,
  alert: Alert,
  paymentId?: string
) {
  let metadata: Record<string, unknown> = {}
  if (paymentId) {
    const { data, error } = await supabase.from('payments')
      .select('metadata').eq('id', paymentId).single()
    if (error) throw error
    metadata = data?.metadata || {}
    if (metadata.staff_alert_sent_at) return
  }

  const notification = {
    ...(paymentId ? { id: paymentId } : {}),
    type: 'PAYMENT', title: alert.title, body: alert.body,
    job_id: alert.jobId || null, link: alert.deepLink, is_read: false,
  }
  // The payment UUID gives redeliveries a stable identity without resetting read state.
  const { error: insertError } = paymentId
    ? await supabase.from('notifications').upsert(notification, { onConflict: 'id', ignoreDuplicates: true })
    : await supabase.from('notifications').insert(notification)
  if (insertError) throw insertError

  let channel = 'nf-hub'
  try {
    const response = await fetch(process.env.NOTIFY_API_URL ||
      'https://notify-50nol3u3c-jimmys-projects-9bf84ee4.vercel.app/api/send', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(8000),
      body: JSON.stringify({ app_id: 'nfd-repairs', title: alert.title,
        body: alert.body, category: 'payment', priority: 'high', deep_link: alert.deepLink }),
    })
    if (!response.ok) throw new Error(`Notify API returned ${response.status}`)
    const result = await response.json()
    if (result.success !== true || !(result.sent > 0)) {
      throw new Error('Notify API did not deliver to any devices')
    }
  } catch (error) {
    console.error('[Payment alert] NF Hub unavailable; using MacroDroid:', error)
    channel = 'macrodroid'
    // This is the staff-alert macro, separate from the customer SMS webhook.
    // It opens the raw request body as a URL, so do not wrap it in JSON/text.
    const response = await fetch(process.env.MACRODROID_NOTIFICATION_WEBHOOK_URL ||
      'https://trigger.macrodroid.com/4e59ada0-b4c6-443d-b189-3c7aa21a8454/repair-request', {
      method: 'POST', body: alert.deepLink, signal: AbortSignal.timeout(8000),
    })
    if (!response.ok) throw new Error(`Staff alert webhook returned ${response.status}`)
  }

  if (paymentId) {
    const { error } = await supabase.from('payments').update({ metadata: {
      ...metadata, staff_alert_sent_at: new Date().toISOString(), staff_alert_channel: channel,
    } }).eq('id', paymentId)
    if (error) throw error
  }
}
