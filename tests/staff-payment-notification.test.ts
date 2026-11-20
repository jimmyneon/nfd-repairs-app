import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { sendStaffPaymentNotification } from '@/lib/staff-payment-notification'

describe('staff payment notification delivery', () => {
  const alert = { title: 'Repair payment — £75.00', body: 'Test customer paid £75.00.',
    jobId: 'test-job', deepLink: 'https://nfd-repairs-app.vercel.app/app/jobs/test-job' }
  let metadata: Record<string, unknown>
  let insertError: any
  let upsert: any
  let update: any
  let fetchMock: any
  let client: any
  beforeEach(() => {
    metadata = { existing_checkout_field: 'keep' }
    insertError = null
    upsert = vi.fn()
    update = vi.fn()
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    vi.stubEnv('NOTIFY_API_URL', 'https://notify.example.test/api/send')
    vi.stubEnv('MACRODROID_NOTIFICATION_WEBHOOK_URL', 'https://macro.example.test/alert')
    client = { from: (table: string) => {
      const query: any = {
        select: () => query, eq: () => query,
        single: async () => ({ data: { metadata }, error: null }),
        upsert: (...args: any[]) => { upsert(...args); return query },
        update: (values: any) => { update(values); metadata = values.metadata; return query },
        then: (resolve: any) => Promise.resolve({ error: table === 'notifications' ? insertError : null }).then(resolve),
      }
      return query
    } }
  })
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals() })
  const send = () => sendStaffPaymentNotification(client, alert, 'payment-uuid')

  it('records delivery and skips completed webhook redeliveries', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ success: true, sent: 1 }) })
    await send()
    await send()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({ id: 'payment-uuid', link: alert.deepLink }),
      { onConflict: 'id', ignoreDuplicates: true })
    expect(metadata).toMatchObject({ existing_checkout_field: 'keep', staff_alert_channel: 'nf-hub', staff_alert_sent_at: expect.any(String) })
  })
  it.each(['http-error', 'zero-devices', 'network-error'])('falls back to the staff phone macro after %s', async failure => {
    if (failure === 'network-error') fetchMock.mockRejectedValueOnce(new Error('timeout'))
    else fetchMock.mockResolvedValueOnce(failure === 'http-error' ? { ok: false, status: 500 }
      : { ok: true, json: async () => ({ success: true, sent: 0 }) })
    fetchMock.mockResolvedValueOnce({ ok: true })
    await send()
    const [url, options] = fetchMock.mock.calls[1]
    const webhook = new URL(url)
    expect(webhook.origin + webhook.pathname).toBe('https://macro.example.test/alert')
    expect(webhook.searchParams.get('nfdr_payment_title')).toBe(alert.title)
    expect(webhook.searchParams.get('nfdr_payment_message')).toBe(alert.body)
    expect(options).toMatchObject({ method: 'POST', body: alert.deepLink })
    expect(metadata.staff_alert_channel).toBe('macrodroid')
  })
  it('keeps both-service failures retryable and does not mark them delivered', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 503 })
    await expect(send()).rejects.toThrow('Staff alert webhook returned 503')
    expect(update).not.toHaveBeenCalled()
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ success: true, sent: 1 }) })
    await send()
    expect(metadata.staff_alert_sent_at).toBeTruthy()
  })
  it('checks database errors before attempting delivery', async () => {
    insertError = new Error('Database unavailable')
    await expect(send()).rejects.toThrow('Database unavailable')
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
