import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { PDFDocument } from 'pdf-lib'
import { DEFAULT_BILLING, emptyInvoice } from '@/lib/invoices'
const state = vi.hoisted(() => ({
  staff: true,
  allowed: true,
  sent: true,
  send: vi.fn(),
  rpc: vi.fn(),
}))
vi.mock('@/lib/invoice-service', () => ({
  invoiceHeaders: { 'Cache-Control': 'private, no-store' },
  invoiceStaff: async () =>
    state.staff
      ? {
          user: { id: 'staff-id', email: 'staff@example.com' },
          db: { rpc: state.rpc },
        }
      : { response: new Response('{}', { status: 401 }) },
  billingSettings: async () => DEFAULT_BILLING,
  loadInvoice: async () => ({id:'issued',number:'NFDR-123',status:'issued',payload:p(),paid_pence:75000,sent_at:'2026-11-23T10:00:00Z',job_id:'job-id'}),
}))
vi.mock('@/lib/rate-limit', () => ({
  getClientIP: () => '127.0.0.1',
  checkRateLimit: async () => ({ allowed: state.allowed }),
}))
vi.mock('@/lib/email', () => ({
  sendEmail: async (...args: unknown[]) => {
    state.send(...args)
    return { success: state.sent }
  },
}))
import { POST } from '@/app/api/invoices/preview/route'
const p = () => ({
  ...emptyInvoice(),
  customer_name: 'Example customer',
  customer_email: 'customer@example.com',
  items: [{ description: 'Rent {period}', quantity: 1, unit_pence: 75000 }],
})
const req = (body: unknown) =>
  new NextRequest('https://test/api/invoices/preview', {
    method: 'POST',
    body: JSON.stringify(body),
  })
beforeEach(() => {
  state.staff = true
  state.allowed = true
  state.sent = true
  state.send.mockClear()
  state.rpc.mockClear()
})
describe('staff invoice previews', () => {
  it('requires staff authentication and enforces preview rate limits', async () => {
    state.staff = false
    expect((await POST(req({}))).status).toBe(401)
    state.staff = true
    state.allowed = false
    expect((await POST(req({}))).status).toBe(429)
  })
  it('previews an unissued PDF without inserting or issuing an invoice', async () => {
    const r = await POST(
      req({
        payload: p(),
        format: 'pdf',
        schedule: { next_date: '2026-11-23', anchor_day: 23, ends_on: '' },
      }),
    )
    expect(r.status).toBe(200)
    expect(r.headers.get('Content-Type')).toBe('application/pdf')
    expect((await PDFDocument.load(await r.arrayBuffer())).getPageCount()).toBe(
      1,
    )
    expect(state.rpc).not.toHaveBeenCalled()
    expect(state.send).not.toHaveBeenCalled()
  })
  it('sends email previews only to the verified staff email, ignoring a supplied recipient', async () => {
    const r = await POST(
      req({ payload: p(), format: 'email', to: 'customer@example.com' }),
    )
    expect(r.status).toBe(200)
    expect(await r.json()).toMatchObject({
      sent: true,
      to: 'staff@example.com',
    })
    expect(state.send.mock.calls[0][0]).toBe('staff@example.com')
    expect(state.send.mock.calls[0][2]).not.toMatch(/<img\b/)
    expect(state.send.mock.calls[0][4][0].filename).toBe(
      'NFDR-invoice-preview.pdf',
    )
    expect(state.rpc).not.toHaveBeenCalled()
  })
  it('preserves paid amounts and numbering when previewing an issued invoice', async () => {
    const r = await POST(req({invoiceId:'issued',format:'email'}))
    expect(r.status).toBe(200)
    expect(state.send.mock.calls[0][2]).toContain('NFDR-123')
    expect(state.send.mock.calls[0][2]).toContain('Paid in full')
    expect(state.rpc).not.toHaveBeenCalled()
  })
  it('reports failed delivery without claiming to issue or send a customer invoice', async () => {
    state.sent = false
    const r = await POST(req({ payload: p(), format: 'email' }))
    expect(r.status).toBe(400)
    expect((await r.json()).error).toContain('could not be sent')
    expect(state.rpc).not.toHaveBeenCalled()
  })
})
