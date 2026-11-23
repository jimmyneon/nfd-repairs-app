import { describe, it, expect, vi } from 'vitest'
import {
  DEFAULT_BILLING,
  EMPTY_INVOICE_BANK,
  emptyInvoice,
  validateBilling,
  validateInvoiceBank,
  Invoice,
} from '@/lib/invoices'
import {
  invoiceToDraft,
  draftToInvoice,
  poundsToPence,
  recurringPreview,
  invoiceApi,
} from '@/lib/invoice-editor'
import { invoiceHtml } from '@/lib/invoice-template'
const payload = () => ({
  ...emptyInvoice(),
  customer_name: 'Test customer',
  customer_email: 'customer@example.com',
  items: [
    { description: 'Monthly service {period}', quantity: 1, unit_pence: 75000 },
  ],
})
const inv = (): Invoice => ({
  id: 'example',
  number: null,
  status: 'draft',
  payload: payload(),
  job_id: null,
  series_id: null,
  occurrence_date: null,
  paid_pence: 0,
  sent_at: null,
  email_error: null,
  created_at: '',
})
describe('invoice editor inputs', () => {
  it('preserves currency input until submit and converts pounds exactly', () => {
    for (const [value, pence] of [
      ['12.', 1200],
      ['12.3', 1230],
      ['12.34', 1234],
      ['.50', 50],
      ['£1,234.56', 123456],
      ['0', 0],
    ] as const)
      expect(poundsToPence(value)).toBe(pence)
    for (const value of ['', ' ', '1.234', '1e2', '-10', 'word'])
      expect(() => poundsToPence(value)).toThrow()
  })
  it('round trips a saved draft including its separate bank account', () => {
    const p = {
      ...payload(),
      bank_account: {
        ...EMPTY_INVOICE_BANK,
        bank_name: 'Example Bank',
        account_name: 'Rental account',
        sort_code: '12-34-56',
        account_number: '12345678',
      },
    }
    const form = invoiceToDraft(p)
    expect(form.items[0].unit_price).toBe('750.00')
    expect(draftToInvoice(form)).toEqual(p)
    form.bank_account!.account_name = 'Changed draft'
    expect(p.bank_account.account_name).toBe('Rental account')
  })
  it('does not silently save an empty price or quantity as zero', () => {
    const f = invoiceToDraft(payload())
    f.items[0].unit_price = ''
    expect(() => draftToInvoice(f)).toThrow()
    f.items[0].unit_price = '0'
    f.items[0].quantity = ''
    expect(() => draftToInvoice(f)).toThrow()
    f.items[0].quantity = '1.5'
    expect(draftToInvoice(f).items[0]).toMatchObject({
      quantity: 1.5,
      unit_pence: 0,
    })
  })
  it('accepts a hostname and pasted bank spacing in settings', () => {
    expect(
      validateBilling({
        ...DEFAULT_BILLING,
        website: 'nfdr.uk',
        sort_code: '12 34 56',
        account_number: '1234 5678',
      }),
    ).toMatchObject({
      website: 'https://nfdr.uk',
      sort_code: '12-34-56',
      account_number: '12345678',
    })
    expect(validateBilling({ ...DEFAULT_BILLING, website: '' }).website).toBe(
      '',
    )
    expect(() =>
      validateBilling({ ...DEFAULT_BILLING, website: 'javascript:alert(1)' }),
    ).toThrow()
    expect(
      validateInvoiceBank({
        ...EMPTY_INVOICE_BANK,
        sort_code: '12 34 56',
        account_number: '1234 5678',
      }),
    ).toMatchObject({ sort_code: '12-34-56', account_number: '12345678' })
  })
})
describe('monthly invoice previews', () => {
  it('replaces the period placeholder with the actual first service month', () => {
    const p = recurringPreview(payload(), {
      next_date: '2026-11-23',
      anchor_day: 23,
      ends_on: '',
    })
    expect(p.items[0].description).toBe(
      'Monthly service 23 Nov 2026 to 22 Dec 2026',
    )
    expect(p.issue_date).toBe('2026-11-23')
    expect(p.due_date).toBe('2026-11-23')
  })
  it('matches month-end and final-period calculations', () => {
    expect(
      recurringPreview(payload(), {
        next_date: '2027-01-31',
        anchor_day: 31,
        ends_on: '',
      }).period_end,
    ).toBe('2027-02-27')
    expect(
      recurringPreview(payload(), {
        next_date: '2028-01-31',
        anchor_day: 31,
        ends_on: '',
      }).period_end,
    ).toBe('2028-02-28')
    const final = recurringPreview(payload(), {
      next_date: '2027-10-23',
      anchor_day: 23,
      ends_on: '2027-11-11',
    })
    expect(final.items[0].unit_pence).toBe(48387)
    expect(final.period_end).toBe('2027-11-11')
    expect(() =>
      recurringPreview(payload(), {
        next_date: '2027-10-23',
        anchor_day: 23,
        ends_on: '2027-10-22',
      }),
    ).toThrow()
  })
})
describe('image-free invoice email', () => {
  it('renders without remote images and stays mobile friendly', () => {
    const html = invoiceHtml(inv())
    expect(html).not.toMatch(/<img\b/i)
    expect(html).not.toContain('/images/logo.png')
    expect(html).toContain('color-scheme')
    expect(html).toContain('prefers-color-scheme:dark')
    expect(html).toContain('max-width:520px')
    expect(html).toContain('Invoice date')
    expect(html).toContain('1 × £750.00')
  })
  it('supports explicit light/dark previews with readable contrasting palettes', () => {
    expect(invoiceHtml(inv(), undefined, { theme: 'dark' })).toContain(
      'background-color:#111b17!important;color:#e9f0ec!important',
    )
    expect(invoiceHtml(inv(), undefined, { theme: 'light' })).not.toContain(
      'prefers-color-scheme:dark',
    )
    expect(invoiceHtml(inv())).not.toMatch(/<script\b/)
  })
})
describe('save and preview transport', () => {
  it('keeps a useful message when a session expires or the server is unreachable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('{}', { status: 401 })),
    )
    await expect(invoiceApi('/settings', {})).rejects.toThrow(
      'session has expired',
    )
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new Error('network failed')),
    )
    await expect(invoiceApi('/series', {})).rejects.toThrow(
      'Your changes are still here',
    )
    vi.unstubAllGlobals()
  })
  it('supports a PDF preview without trying to parse it as JSON', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response('%PDF-preview', {
            headers: { 'Content-Type': 'application/pdf' },
          }),
        ),
    )
    const d = await invoiceApi('/preview', { format: 'pdf' })
    expect(await d.blob.text()).toBe('%PDF-preview')
    vi.unstubAllGlobals()
  })
})
