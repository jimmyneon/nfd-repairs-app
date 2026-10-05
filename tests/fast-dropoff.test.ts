import { afterEach, describe, expect, it, vi } from 'vitest'
import fs from 'fs'
import path from 'path'

const read = (file: string) => fs.readFileSync(path.join(process.cwd(), file), 'utf-8')

afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetModules()
})

describe('Fast Drop-Off flow', () => {
  it('has a short public route that opens agreement-only completion', () => {
    const file = 'app/f/[token]/page.tsx'
    expect(fs.existsSync(path.join(process.cwd(), file))).toBe(true)
    const content = read(file)
    expect(content).toContain('/walk-in/complete/')
    expect(content).toContain('?mode=agreement')
  })

  it('sends fast drop-off customers to the repair app instead of the website', async () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', '')
    vi.stubEnv('NEXT_PUBLIC_SHORT_LINK_BASE', 'https://nfdr.uk')
    vi.resetModules()
    const { shortFastDropoffLink } = await import('../lib/utils')
    expect(shortFastDropoffLink('00000000-0000-0000-0000-000000000000'))
      .toBe('https://nfd-repairs-app.vercel.app/f/00000000-0000-0000-0000-000000000000')
  })

  it('uses the configured app host and removes trailing slashes', async () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://repairs.example.com/')
    vi.resetModules()
    const { shortFastDropoffLink } = await import('../lib/utils')
    expect(shortFastDropoffLink('test-token-123')).toBe('https://repairs.example.com/f/test-token-123')
  })

  it('offers fast drop-off only after an in-stock enquiry is converted', () => {
    const content = read('app/api/enquiries/convert-to-job/route.ts')
    expect(content).toContain("stock_status === 'in_stock'")
    expect(content).toContain('shortFastDropoffLink')
    expect(content).toContain('Want a quicker drop-off?')
    expect(content).toContain('Or ignore this and we’ll do it with you when you arrive.')
  })

  it('offers fast drop-off again when ordered parts arrive', () => {
    const content = read('app/api/jobs/queue-status-sms/route.ts')
    expect(content).toContain("status === 'PARTS_ARRIVED'")
    expect(content).toContain("status === 'AWAITING_DEVICE'")
    expect(content).toContain('shortFastDropoffLink')
  })

  it('keeps the pre-arrival agreement optional and customer friendly', () => {
    const content = read('app/walk-in/complete/[token]/page.tsx')
    expect(content).toContain('Set up Fast Drop-Off')
    expect(content).toContain('If you would rather do this in the shop, simply close this page.')
    expect(content).toContain('Fast Drop-Off ready')
    expect(content).not.toContain('Book next customer')
  })

  it('does not mark the device as physically in the shop when the agreement is completed remotely', () => {
    const content = read('app/api/public/intake/[token]/route.ts')
    const patchSection = content.slice(content.indexOf('export async function PATCH'))
    expect(patchSection).toContain('terms_accepted: true')
    expect(patchSection).not.toContain('device_in_shop: true')
  })

  it('records fast drop-off completion so the funnel can be measured', () => {
    const page = read('app/walk-in/complete/[token]/page.tsx')
    const route = read('app/api/public/intake/[token]/route.ts')
    expect(page).toContain("completion_mode: agreementOnly ? 'fast_dropoff' : 'standard'")
    expect(route).toContain("completionMode === 'fast_dropoff'")
    expect(route).toContain('Fast Drop-Off ready')
  })

  it('keeps Fast Drop-Off visible on the customer tracking page until terms are complete', () => {
    const api = read('app/api/tracking/[token]/route.ts')
    const client = read('app/t/[token]/TrackingPageClient.tsx')
    expect(api).toContain('terms_accepted')
    expect(client).toContain('Set Up Fast Drop-Off')
    expect(client).toContain("['AWAITING_DEVICE', 'PARTS_ARRIVED']")
  })

  it('includes fast drop-off in customer email notifications', () => {
    const route = read('app/api/email/send/route.ts')
    const template = read('lib/email-templates-embedded.ts')
    expect(route).toContain('fastDropoffUrl')
    expect(template).toContain('Set Up Fast Drop-Off')
  })
})
