import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({
  sendEmail: vi.fn(),
  sendSms: vi.fn(),
  createClient: vi.fn(),
}))

vi.mock('@/lib/email', () => ({ sendEmail: mocks.sendEmail }))
vi.mock('@/lib/email-post-collection', () => ({
  generatePostCollectionEmail: () => ({ subject: 'Review request', html: '<p>Review</p>', text: 'Review' }),
}))
vi.mock('@/lib/resilience', () => ({
  createServiceClient: mocks.createClient,
  supabaseRetry: (operation: () => unknown) => operation(),
  sendViaMacroDroid: mocks.sendSms,
  isWithinUKSendingHours: () => true,
}))

import { GET, POST } from '@/app/api/jobs/send-collection-sms/route'

describe('post-collection notification retries', () => {
  let job: Record<string, any>
  let events: Record<string, any>[]
  let updates: Record<string, any>[]
  let updateError: null | { message: string }

  const send = (manual = false) => POST(new NextRequest('https://example.test/api/jobs/send-collection-sms', {
    method: 'POST',
    body: JSON.stringify({ jobId: 'test-job', manual }),
  }))

  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv('MACRODROID_WEBHOOK_URL', 'https://example.test/sms')
    job = {
      id: 'test-job', job_ref: 'TEST-001', customer_name: 'Test Customer',
      customer_phone: '07123456789', customer_email: 'customer@example.test',
      device_model: 'Test phone', tracking_token: 'test-token',
      post_collection_sms_sent_at: null, post_collection_email_sent_at: null,
    }
    events = []
    updates = []
    updateError = null
    mocks.sendSms.mockResolvedValue({ ok: true })
    mocks.sendEmail.mockResolvedValue({ success: true })
    mocks.createClient.mockReturnValue({
      from: (table: string) => {
        let pendingUpdate: Record<string, any> | undefined
        const query: any = {
          select: () => query,
          eq: () => query,
          single: async () => ({ data: table === 'jobs' ? { ...job } : null, error: null }),
          update: (values: Record<string, any>) => { pendingUpdate = values; return query },
          insert: async (values: Record<string, any>[]) => { events.push(...values); return { error: null } },
          then: (resolve: (value: unknown) => unknown) => {
            if (pendingUpdate && !updateError) {
              updates.push(pendingUpdate)
              Object.assign(job, pendingUpdate)
            }
            return Promise.resolve({ error: updateError }).then(resolve)
          },
        }
        return query
      },
    })
  })

  afterEach(() => vi.unstubAllEnvs())

  it('sends email once across repeated SMS failures, then retries only the SMS', async () => {
    mocks.sendSms.mockResolvedValue({ ok: false })
    await send()
    const emailSentAt = job.post_collection_email_sent_at
    expect(emailSentAt).toBeTruthy()
    expect(job.post_collection_sms_sent_at).toBeNull()
    await send()
    await send()
    mocks.sendSms.mockResolvedValue({ ok: true })
    await send()
    expect(mocks.sendEmail).toHaveBeenCalledTimes(1)
    expect(mocks.sendSms).toHaveBeenCalledTimes(4)
    expect(job.post_collection_email_sent_at).toBe(emailSentAt)
    expect(events.filter(event => event.message.startsWith('Post-collection email'))).toHaveLength(1)
    expect((await (await send()).json()).alreadySent).toBe(true)
    expect(mocks.sendEmail).toHaveBeenCalledTimes(1)
    expect(mocks.sendSms).toHaveBeenCalledTimes(4)
  })

  it('preserves existing successful email metadata while retrying an SMS', async () => {
    Object.assign(job, {
      post_collection_email_sent_at: '2026-09-20T10:00:00Z',
      post_collection_email_delivery_status: 'SENT',
      post_collection_email_subject: 'Original subject',
      post_collection_email_body: 'Original body',
    })
    await send()
    expect(mocks.sendEmail).not.toHaveBeenCalled()
    expect(job.post_collection_email_subject).toBe('Original subject')
    expect(job.post_collection_email_body).toBe('Original body')
    expect(updates.every(update => !Object.keys(update).some(key => key.startsWith('post_collection_email')))).toBe(true)
  })

  it('retries failed email without resending a successful SMS, even with no SMS configuration', async () => {
    mocks.sendEmail.mockResolvedValueOnce({ success: false }).mockResolvedValue({ success: true })
    await send()
    const smsSentAt = job.post_collection_sms_sent_at
    expect(job.post_collection_email_sent_at).toBeNull()
    vi.stubEnv('MACRODROID_WEBHOOK_URL', '')
    await send()
    expect(mocks.sendSms).toHaveBeenCalledTimes(1)
    expect(mocks.sendEmail).toHaveBeenCalledTimes(2)
    expect(job.post_collection_sms_sent_at).toBe(smsSentAt)
    expect(job.post_collection_email_sent_at).toBeTruthy()
  })

  it('records successful SMS before starting email delivery', async () => {
    mocks.sendEmail.mockImplementation(async () => {
      expect(job.post_collection_sms_sent_at).toBeTruthy()
      return { success: true }
    })
    await send()
    expect(mocks.sendEmail).toHaveBeenCalledTimes(1)
  })

  it('does not repeatedly send SMS when the customer has no email address', async () => {
    job.customer_email = null
    await send()
    expect((await (await send()).json()).alreadySent).toBe(true)
    expect(mocks.sendSms).toHaveBeenCalledTimes(1)
    expect(mocks.sendEmail).not.toHaveBeenCalled()
  })

  it('still allows a deliberate manual resend', async () => {
    await send()
    await send(true)
    expect(mocks.sendSms).toHaveBeenCalledTimes(2)
    expect(mocks.sendEmail).toHaveBeenCalledTimes(2)
  })

  it.each([
    { skip_review_request: true },
    { repair_outcome: 'unrepaired' },
    { customer_flag: 'sensitive' },
    { customer_flag: 'awkward' },
  ])('honours review exclusions: %j', async (exclusion) => {
    Object.assign(job, exclusion)
    expect((await (await send()).json()).skipped).toBe(true)
    expect(mocks.sendSms).not.toHaveBeenCalled()
    expect(mocks.sendEmail).not.toHaveBeenCalled()
  })

  it('reports a persistence failure rather than claiming the delivery was recorded', async () => {
    updateError = { message: 'Database unavailable' }
    expect((await send()).status).toBe(500)
    expect(mocks.sendEmail).not.toHaveBeenCalled()
  })
})

describe('scheduled collection retries', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
    vi.useRealTimers()
  })

  it('processes an email-only retry alongside an SMS for the same phone', async () => {
    vi.stubEnv('CRON_SECRET', 'test-secret')
    vi.useFakeTimers()
    const requests: string[] = []
    const filters: string[] = []
    const queued = [
      { id: 'email-retry', job_ref: 'TEST-EMAIL', customer_phone: '07123456789', post_collection_sms_sent_at: '2026-09-20T10:00:00Z' },
      { id: 'sms-retry', job_ref: 'TEST-SMS', customer_phone: '07123456789', post_collection_sms_sent_at: null },
    ]
    let jobQueryCount = 0
    mocks.createClient.mockReturnValue({
      from: () => {
        const index = jobQueryCount++
        const query: any = {
          select: () => query, not: () => query, is: () => query, lte: () => query,
          or: (filter: string) => { if (index === 0) filters.push(filter); return query },
          order: async () => ({ data: index === 0 ? queued : [], error: null }),
        }
        return query
      },
    })
    vi.stubGlobal('fetch', vi.fn(async (_url: string, options: RequestInit) => {
      requests.push(JSON.parse(options.body as string).jobId)
      return { json: async () => ({ success: true }) }
    }))
    const result = GET(new NextRequest('https://example.test/api/jobs/send-collection-sms', {
      headers: { Authorization: 'Bearer test-secret' },
    }))
    await vi.runAllTimersAsync()
    expect((await result).status).toBe(200)
    expect(requests).toEqual(['email-retry', 'sms-retry'])
    // Restrict new email retries to actual failures, never historical unsent
    // emails or intentionally skipped review requests.
    expect(filters[0]).toContain('post_collection_sms_sent_at.is.null')
    expect(filters[0]).toContain('and(post_collection_sms_delivery_status.eq.SENT,post_collection_email_sent_at.is.null,post_collection_email_delivery_status.eq.FAILED,')
  })
})
