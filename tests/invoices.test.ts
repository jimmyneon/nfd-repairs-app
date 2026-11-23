import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { readFileSync, mkdirSync, writeFileSync } from 'fs'
import { PDFDocument } from 'pdf-lib'
import {
  DEFAULT_BILLING,
  emptyInvoice,
  invoiceTotal,
  validateInvoice,
  validateBilling,
  bankReady,
  paymentText,
  todayUK,
} from '@/lib/invoices'
import { invoiceHtml } from '@/lib/invoice-template'
import { invoicePdf } from '@/lib/invoice-pdf'
import { NextRequest } from 'next/server'
const state = vi.hoisted(() => ({ staff: true, db: null as any, allow: true }))
vi.mock('@/lib/api-auth', () => ({
  requireStaffUser: async () =>
    state.staff
      ? { user: { email: 'staff@example.com' }, response: null }
      : { response: new Response('{}', { status: 401 }) },
}))
vi.mock('@/lib/resilience', () => ({ createServiceClient: () => state.db }))
vi.mock('@/lib/rate-limit', () => ({
  getClientIP: () => '',
  checkRateLimit: async () => ({ allowed: state.allow }),
}))
import { GET as publicGet } from '@/app/api/invoices/public/[token]/route'
import { GET as staffGet } from '@/app/api/invoices/[id]/route'
import { GET as trackingGet } from '@/app/api/tracking/[token]/invoice/route'

const bank = {
  ...DEFAULT_BILLING,
  bank_name: 'Test Bank',
  account_name: 'Example business',
  sort_code: '12-34-56',
  account_number: '12345678',
}
const payload = () => ({
  ...emptyInvoice(),
  customer_name: 'Sample Customer',
  customer_email: 'customer@example.com',
  title: 'Workshop services',
  issue_date: '2026-11-23',
  due_date: '2026-11-23',
  items: [
    { description: 'Screen replacement', quantity: 1, unit_pence: 10000 },
  ],
})
const invoice = (p = payload()) => ({
  id: 'sample',
  number: 'NFDR-000001',
  status: 'issued' as const,
  payload: { ...p, seller: bank },
  job_id: null,
  series_id: null,
  occurrence_date: null,
  paid_pence: 2000,
  sent_at: null,
  email_error: null,
  created_at: '',
})
let pg: PGlite
const job = '10000000-0000-4000-8000-000000000001'
async function sql(q: string, args: any[] = []) {
  return (await pg.query<any>(q, args)).rows
}
async function save(p = payload(), issue = true, id: string | null = null) {
  return (
    await sql('SELECT billing_save_invoice($1,$2,$3) id', [
      id,
      JSON.stringify(p),
      issue,
    ])
  )[0].id
}
async function series(
  next: string,
  anchor: number,
  end: string | null = null,
  p = payload(),
) {
  return (
    await sql(
      'INSERT INTO billing_series(name,template,next_date,anchor_day,ends_on,active) VALUES($1,$2,$3,$4,$5,true) RETURNING id',
      ['Monthly invoice', JSON.stringify(p), next, anchor, end],
    )
  )[0].id
}
async function occurrence(id: string, today: string) {
  return (
    await sql('SELECT billing_generate_occurrence($1,$2) id', [id, today])
  )[0].id
}

beforeAll(async () => {
  pg = new PGlite()
  await pg.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;
 CREATE TABLE jobs(id uuid PRIMARY KEY,status text,price_total numeric,customer_name text,customer_email text,job_ref text,device_make text,device_model text);
 INSERT INTO jobs VALUES('${job}','IN_REPAIR',100,'Repair Customer','repair@example.com','JOB-123','Apple','iPhone');`)
  await pg.exec(
    readFileSync(
      'supabase/migrations/20261123132119_pdf_recurring_invoices.sql',
      'utf8',
    ),
  )
})
afterAll(async () => {
  await pg.close()
})

describe('Invoice calculations and input', () => {
  it('uses integer pence with fractional quantities', () =>
    expect(
      invoiceTotal({
        ...payload(),
        items: [{ description: 'Service', quantity: 1.5, unit_pence: 3333 }],
      }),
    ).toBe(5000))
  it('rejects negative, non-integer, missing and excessive money values', () => {
    for (const unit_pence of [-1, 0.1, Infinity, 100000001])
      expect(() =>
        validateInvoice({
          ...payload(),
          items: [{ description: 'x', quantity: 1, unit_pence }],
        }),
      ).toThrow()
    expect(() => validateInvoice({ ...payload(), items: [] })).toThrow()
    expect(() =>
      validateInvoice({
        ...payload(),
        items: [{ description: 'x', quantity: 0, unit_pence: 1 }],
      }),
    ).toThrow()
  })
  it('rejects impossible dates and invalid email', () => {
    for (const date of ['2026-02-30', '23/11/2026', '2026-13-01'])
      expect(() =>
        validateInvoice({ ...payload(), issue_date: date }),
      ).toThrow()
    expect(() =>
      validateInvoice({ ...payload(), due_date: '2026-11-22' }),
    ).toThrow()
    expect(() =>
      validateInvoice({ ...payload(), customer_email: 'bad@example\n.org' }),
    ).toThrow()
  })
  it('removes caller-supplied seller details', () =>
    expect(
      validateInvoice({ ...payload(), seller: { account_number: 'evil' } })
        .seller,
    ).toBeUndefined())
  it('requires complete bank details and suppresses online checkout links', () => {
    expect(bankReady(DEFAULT_BILLING)).toBe(false)
    expect(bankReady(bank)).toBe(true)
    expect(() => validateBilling({ ...bank, account_number: '123' })).toThrow()
    const t = paymentText({
      ...payload(),
      seller: bank,
      payment_method: 'bank_transfer',
    })
    expect(t).toContain('12-34-56')
    expect(t).toContain('12345678')
    expect(t).not.toMatch(/stripe|klarna|checkout/i)
  })
  it('uses the UK date across UTC/BST boundaries', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-01T23:30:00Z'))
    expect(todayUK()).toBe('2026-07-02')
    vi.useRealTimers()
  })
  it('escapes HTML in descriptions and notes', () => {
    const i = invoice({
      ...payload(),
      notes: '<script>alert(1)</script>',
      customer_name: '<img src=x onerror=alert(1)>',
    })
    expect(invoiceHtml(i)).toContain('&lt;script&gt;')
    expect(invoiceHtml(i)).not.toContain('<script>')
    expect(invoiceHtml(i)).not.toContain('<img src=x')
  })
})

describe('Database billing invariants', () => {
  it('numbers issued invoices once and keeps drafts private and unnumbered', async () => {
    const id = await save(payload(), false)
    expect(
      (
        await sql('SELECT number,status FROM billing_invoices WHERE id=$1', [
          id,
        ])
      )[0],
    ).toMatchObject({ number: null, status: 'draft' })
    await save(payload(), true, id)
    expect(
      (
        await sql('SELECT number,status FROM billing_invoices WHERE id=$1', [
          id,
        ])
      )[0],
    ).toMatchObject({ number: 'NFDR-000001', status: 'issued' })
    await expect(
      save({ ...payload(), title: 'Changed' }, false, id),
    ).rejects.toThrow('cannot be edited')
  })
  it('snapshots seller details on issue', async () => {
    const id = await save()
    await sql(
      "UPDATE billing_settings SET data=jsonb_set(data,'{business_name}','\"Changed shop\"')",
    )
    expect(
      (
        await sql(
          "SELECT payload->'seller'->>'business_name' name FROM billing_invoices WHERE id=$1",
          [id],
        )
      )[0].name,
    ).toBe(DEFAULT_BILLING.business_name)
    await sql('UPDATE billing_settings SET data=$1', [
      JSON.stringify(DEFAULT_BILLING),
    ])
  })
  it('cannot issue bank invoices before bank information exists', async () => {
    await expect(
      save({ ...payload(), payment_method: 'bank_transfer' }),
    ).rejects.toThrow('bank account details')
    await sql('UPDATE billing_settings SET data=$1', [JSON.stringify(bank)])
    expect(
      await save({ ...payload(), payment_method: 'bank_transfer' }),
    ).toBeTruthy()
  })
  it('only creates invoices for completed repairs and reuses one invoice per job', async () => {
    expect(
      (await sql('SELECT billing_job_invoice($1) id', [job]))[0].id,
    ).toBeNull()
    await sql("UPDATE jobs SET status='READY_TO_COLLECT' WHERE id=$1", [job])
    const a = (await sql('SELECT billing_job_invoice($1) id', [job]))[0].id
    const b = (await sql('SELECT billing_job_invoice($1) id', [job]))[0].id
    expect(a).toBe(b)
    await sql('UPDATE jobs SET price_total=200 WHERE id=$1', [job])
    expect(
      (await sql('SELECT payload FROM billing_invoices WHERE id=$1', [a]))[0]
        .payload.items[0].unit_pence,
    ).toBe(10000)
  })
  it('preserves the 31st across February and catches up once per run', async () => {
    const id = await series('2027-01-31', 31)
    const a = await occurrence(id, '2027-03-31')
    expect(
      (
        await sql('SELECT next_date::text FROM billing_series WHERE id=$1', [
          id,
        ])
      )[0].next_date,
    ).toBe('2027-02-28')
    const b = await occurrence(id, '2027-03-31')
    expect(a).not.toBe(b)
    expect(
      (
        await sql('SELECT next_date::text FROM billing_series WHERE id=$1', [
          id,
        ])
      )[0].next_date,
    ).toBe('2027-03-31')
    await occurrence(id, '2027-03-31')
    expect(await occurrence(id, '2027-03-31')).toBeNull()
    expect(
      (
        await sql(
          'SELECT count(*)::int n FROM billing_invoices WHERE series_id=$1',
          [id],
        )
      )[0].n,
    ).toBe(3)
  })
  it('uses the 29th in leap year February', async () => {
    const id = await series('2028-01-31', 31)
    await occurrence(id, '2028-01-31')
    expect(
      (
        await sql('SELECT next_date::text FROM billing_series WHERE id=$1', [
          id,
        ])
      )[0].next_date,
    ).toBe('2028-02-29')
  })
  it('prorates the final rental period and stops the schedule', async () => {
    const id = await series('2027-10-23', 23, '2027-11-11', {
      ...payload(),
      items: [
        { description: 'Rent: {period}', quantity: 1, unit_pence: 75000 },
      ],
    })
    const invoiceId = await occurrence(id, '2027-10-23')
    const p = (
      await sql('SELECT payload FROM billing_invoices WHERE id=$1', [invoiceId])
    )[0].payload
    expect(p.items[0].unit_pence).toBe(48387)
    expect(p.items[0].description).toBe('Rent: 23 Oct 2027 to 11 Nov 2027')
    expect(p.period_end).toBe('2027-11-11')
    expect(await occurrence(id, '2028-01-01')).toBeNull()
    expect(
      (await sql('SELECT active FROM billing_series WHERE id=$1', [id]))[0]
        .active,
    ).toBe(false)
  })
  it('never generates a future or paused occurrence', async () => {
    const id = await series('2026-12-23', 23)
    expect(await occurrence(id, '2026-11-23')).toBeNull()
    await sql('UPDATE billing_series SET active=false WHERE id=$1', [id])
    expect(await occurrence(id, '2027-12-23')).toBeNull()
  })
  it('serialises repeated generation and email claims', async () => {
    const id = await series('2026-11-23', 23)
    const [a, b] = await Promise.all([
      occurrence(id, '2026-11-23'),
      occurrence(id, '2026-11-23'),
    ])
    expect([a, b].filter(Boolean)).toHaveLength(1)
    const inv = a || b
    expect(
      (await sql('SELECT billing_claim_email($1,false) ok', [inv]))[0].ok,
    ).toBe(true)
    expect(
      (await sql('SELECT billing_claim_email($1,false) ok', [inv]))[0].ok,
    ).toBe(false)
    await sql(
      'UPDATE billing_invoices SET email_lock_until=null,sent_at=now() WHERE id=$1',
      [inv],
    )
    expect(
      (await sql('SELECT billing_claim_email($1,false) ok', [inv]))[0].ok,
    ).toBe(false)
    expect(
      (await sql('SELECT billing_claim_email($1,true) ok', [inv]))[0].ok,
    ).toBe(true)
  })
  it('denies direct table reads and RPC invocation for anon and normal users', async () => {
    for (const role of ['anon', 'authenticated']) {
      expect(
        (
          await sql(
            "SELECT has_table_privilege($1,'billing_invoices','SELECT') ok",
            [role],
          )
        )[0].ok,
      ).toBe(false)
      expect(
        (
          await sql(
            "SELECT has_table_privilege($1,'billing_settings','SELECT') ok",
            [role],
          )
        )[0].ok,
      ).toBe(false)
      expect(
        (
          await sql(
            "SELECT has_function_privilege($1,'billing_job_invoice(uuid)','EXECUTE') ok",
            [role],
          )
        )[0].ok,
      ).toBe(false)
    }
    expect(
      (
        await sql(
          "SELECT relrowsecurity FROM pg_class WHERE relname='billing_invoices'",
        )
      )[0].relrowsecurity,
    ).toBe(true)
  })
})

describe('Invoice access routes', () => {
  it('requires staff login before returning invoice data', async () => {
    state.staff = false
    expect(
      (
        await staffGet(new NextRequest('https://test/api/invoices/abc'), {
          params: { id: 'abc' },
        })
      ).status,
    ).toBe(401)
    state.staff = true
  })
  it('rejects short or malformed invoice/tracking tokens before database access', async () => {
    expect(
      (
        await publicGet(
          new NextRequest('https://test/api/invoices/public/abcdef'),
          { params: { token: 'abcdef' } },
        )
      ).status,
    ).toBe(404)
    expect(
      (
        await trackingGet(
          new NextRequest('https://test/api/tracking/abcdef/invoice'),
          { params: { token: 'abcdef' } },
        )
      ).status,
    ).toBe(404)
  })
  it('scopes public invoice lookup by secret token and excludes drafts', async () => {
    const clauses: any[] = []
    const q: any = {
      select: () => q,
      eq: (...a: any[]) => {
        clauses.push(a)
        return q
      },
      neq: (...a: any[]) => {
        clauses.push(a)
        return q
      },
      maybeSingle: async () => ({ data: null, error: null }),
    }
    state.db = { from: () => q }
    const token = 'a'.repeat(64)
    const r = await publicGet(
      new NextRequest(`https://test/api/invoices/public/${token}`),
      { params: { token } },
    )
    expect(r.status).toBe(404)
    expect(clauses).toContainEqual(['public_token', token])
    expect(clauses).toContainEqual(['status', 'draft'])
    expect(r.headers.get('Cache-Control')).toContain('no-store')
  })
  it('does not expose secret tokens or private email diagnostics', async () => {
    const q: any = {
      select: () => q,
      eq: () => q,
      neq: () => q,
      maybeSingle: async () => ({
        data: {
          ...invoice(),
          public_token: 'secret',
          email_error: 'private failure',
          email_lock_until: 'private',
        },
        error: null,
      }),
    }
    state.db = { from: () => q }
    const token = 'b'.repeat(64)
    const r = await publicGet(
      new NextRequest(`https://test/api/invoices/public/${token}`),
      { params: { token } },
    )
    expect(r.status).toBe(200)
    expect(await r.text()).not.toMatch(/secret|private|email_error/)
  })
  it('rate limits public invoice downloads', async () => {
    state.allow = false
    expect(
      (
        await publicGet(new NextRequest('https://test/'), {
          params: { token: 'a'.repeat(64) },
        })
      ).status,
    ).toBe(429)
    state.allow = true
  })
})

describe('PDF output', () => {
  it('creates a branded A4 invoice and a multipage long-description invoice', async () => {
    mkdirSync('/tmp/nfdr-invoice-qa', { recursive: true })
    for (const [name, p] of [
      ['normal', payload()],
      [
        'bank',
        {
          ...payload(),
          customer_address: '1 Example Road\nLymington\nHampshire\nSO41 0AA',
          title: 'Café rent',
          reference: 'CAFE-RENT',
          items: [
            {
              description:
                'Inclusive café rent, 5 New Street — 23 Nov 2026 to 22 Dec 2026',
              quantity: 1,
              unit_pence: 75000,
            },
          ],
          payment_method: 'bank_transfer',
          payment_instructions: 'Payable monthly in advance on the 23rd.',
          notes:
            'Inclusive rent covering occupation, water, shared internet, reasonable ordinary café electricity and use of agreed equipment and furnishings.',
        },
      ],
      [
        'long',
        {
          ...payload(),
          customer_name: 'Café Example',
          items: Array.from({ length: 35 }, (_, n) => ({
            description: `Service ${n + 1}: ${'Detailed repair description with measured wrapping. '.repeat(5)}`,
            quantity: 1,
            unit_pence: 3000,
          })),
          notes: 'Long note: ' + 'Additional service details. '.repeat(600),
        },
      ],
    ] as const) {
      const bytes = await invoicePdf(invoice(p))
      writeFileSync(`/tmp/nfdr-invoice-qa/${name}.pdf`, bytes)
      const pdf = await PDFDocument.load(bytes)
      expect(pdf.getPages()[0].getWidth()).toBeCloseTo(595.28)
      if (name === 'normal' || name === 'bank')
        expect(pdf.getPageCount()).toBe(1)
      else expect(pdf.getPageCount()).toBeGreaterThan(3)
    }
  })
})
