import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { generateEmbeddedJobEmail } from '@/lib/email-templates-embedded'
import { repairPaymentLink } from '@/lib/utils'

const mocks = vi.hoisted(() => ({ createClient: vi.fn(), sendSms: vi.fn() }))
vi.mock('@supabase/supabase-js', () => ({ createClient: mocks.createClient }))
vi.mock('@/lib/api-auth', () => ({
  requireStaffUser: async () => ({ response: null }),
  requireStaffOrCron: async () => null,
}))
vi.mock('@/lib/resilience', () => ({ sendViaMacroDroid: mocks.sendSms }))
import { POST } from '@/app/api/enquiries/convert-to-job/route'

describe('parts payment messages', () => {
  let enquiry: any
  let job: any
  let template: string | null
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv('NEXT_PUBLIC_DEPOSIT_URL', 'https://pay.sumup.com/old')
    vi.stubEnv('MACRODROID_WEBHOOK_URL', 'https://example.test/sms')
    enquiry = { id: 'enquiry', enquiry_ref: 'TEST', customer_name: 'Test Customer', customer_phone: '07000000000', customer_email: null, device_make: 'Apple', device_model: 'iPhone', quoted_price: 100 }
    job = { id: 'job', job_ref: 'TEST-001', short_token: 'test123', tracking_token: 'long-test-token', deposit_required: true, deposit_amount: 20, price_total: 100, created_at: '2026-10-14', status: 'AWAITING_DEPOSIT' }
    template = null
    mocks.sendSms.mockResolvedValue({ ok: true })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ success: true }) }))
    mocks.createClient.mockReturnValue({ from: (table: string) => {
      let inserted = false
      const query: any = {
        select: () => query, eq: () => query, in: () => query,
        update: () => query, delete: () => query,
        insert: () => { inserted = true; return query },
        single: async () => ({ data: table === 'enquiries' ? enquiry : table === 'jobs' ? job : null }),
        then: (resolve: any) => Promise.resolve({ data: table === 'sms_templates' && template ? [{ key: 'DEPOSIT_REQUEST', body: template }] : null, count: 0, error: null }).then(resolve),
      }
      return query
    } })
  })
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals() })
  const convert = (stock_status = 'parts_needed') => POST(new NextRequest('https://example.test/api/enquiries/convert-to-job', { method: 'POST', body: JSON.stringify({ enquiry_id: 'enquiry', stock_status }) }))

  it('sends a repair-specific payment link and both choices without the old env URL', async () => {
    expect((await convert()).status).toBe(200)
    const text = mocks.sendSms.mock.calls[0][2]
    expect(text).toContain('https://newforestdevicerepairs.co.uk/pay/?t=test123')
    expect(text).toContain('£20 deposit')
    expect(text).toContain('pay in full by card or Klarna')
    expect(text).not.toMatch(/sumup|Reply PAID/i)
  })
  it('replaces the database template payment variable with the job link', async () => {
    template = 'Hi {first_name}, £{deposit_amount} deposit or full payment with Klarna: {deposit_link}'
    await convert()
    expect(mocks.sendSms.mock.calls[0][2]).toContain('/pay/?t=test123')
    expect(mocks.sendSms.mock.calls[0][2]).not.toContain('sumup')
  })
  it('notifies email-only customers without attempting SMS', async () => {
    enquiry.customer_phone = null
    enquiry.customer_email = 'customer@example.test'
    const result = await (await convert()).json()
    expect(result.email_sent).toBe(true)
    expect(result.customer_notified).toBe(true)
    expect(mocks.sendSms).not.toHaveBeenCalled()
  })
  it('offers both payment choices in HTML and plain text emails', () => {
    const email = generateEmbeddedJobEmail({ job, trackingUrl: 'https://example.test/track', depositUrl: repairPaymentLink(job) }, 'JOB_CREATED')
    for (const body of [email.html, email.text]) {
      expect(body).toContain('/pay/?t=test123')
      expect(body).toContain('pay in full by card or Klarna')
      expect(body).not.toContain('sumup')
    }
    expect(email.html).toContain('Choose Payment Option')
  })
  it('does not ask fully paid customers for another deposit', () => {
    job.payment_received = true
    const email = generateEmbeddedJobEmail({ job, trackingUrl: 'https://example.test/track', depositUrl: repairPaymentLink(job) }, 'STATUS_UPDATE')
    expect(email.html).not.toContain('Choose Payment Option')
    expect(email.text).not.toContain('Pay here:')
  })
  it('offers optional full online payment when parts are in stock', async () => {
    await convert('in_stock')
    const text = mocks.sendSms.mock.calls[0][2]
    expect(text).toContain('Prefer to pay online? Card or eligible Klarna')
    expect(text).toContain('/pay/?t=test123')
  })
  it('offers an in-stock full-payment link in email without demanding a deposit', () => {
    job.deposit_required = false
    job.status = 'AWAITING_DEVICE'
    const email = generateEmbeddedJobEmail({job,trackingUrl:'https://example.test/track',depositUrl:repairPaymentLink(job)}, 'JOB_CREATED')
    expect(email.text).toContain('Prefer to pay online?')
    expect(email.text).toContain('/pay/?t=test123')
    expect(email.text).not.toContain('deposit to order your parts')
  })
})
