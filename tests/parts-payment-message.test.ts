import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { generateEmbeddedJobEmail } from '@/lib/email-templates-embedded'
import { repairPaymentLink } from '@/lib/utils'

import { partsPaymentMessage } from '@/lib/parts-payment-message'

describe('parts payment messages', () => {
  let enquiry: any
  let job: any
  let template: string | null
  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_DEPOSIT_URL', 'https://pay.sumup.com/old')
    vi.stubEnv('MACRODROID_WEBHOOK_URL', 'https://example.test/sms')
    enquiry = { id: 'enquiry', enquiry_ref: 'TEST', customer_name: 'Test Customer', customer_phone: '07000000000', customer_email: null, device_make: 'Apple', device_model: 'iPhone', quoted_price: 100 }
    job = { id: 'job', job_ref: 'TEST-001', short_token: 'test123', tracking_token: 'long-test-token', deposit_required: true, deposit_amount: 20, price_total: 100, created_at: '2026-10-14', status: 'AWAITING_DEPOSIT' }
    template = null
  })
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals() })
  it('offers the repair-specific link in status replies', () => {
    const text = partsPaymentMessage({...job,price_total:100})
    expect(text).toContain('/pay/?t=test123')
    expect(text).toContain('Klarna')
    expect(text).not.toContain('sumup')
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
  it('offers an in-stock full-payment link in email without demanding a deposit', () => {
    job.deposit_required = false
    job.status = 'AWAITING_DEVICE'
    const email = generateEmbeddedJobEmail({job,trackingUrl:'https://example.test/track',depositUrl:repairPaymentLink(job)}, 'JOB_CREATED')
    expect(email.text).toContain('Prefer to pay online?')
    expect(email.text).toContain('/pay/?t=test123')
    expect(email.text).not.toContain('deposit to order your parts')
  })
})
