import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest'
import React from 'react'
import TestRenderer, { act } from 'react-test-renderer'
import {
  DEFAULT_BILLING,
  emptyInvoice,
  Invoice,
  InvoiceSeries,
  validateInvoice,
  validateBilling,
} from '@/lib/invoices'
vi.mock('next/link', () => ({
  default: ({ children, ...rest }: any) =>
    React.createElement('a', rest, children),
}))
import InvoiceWorkspace from '@/components/invoices/InvoiceWorkspace'
let root: TestRenderer.ReactTestRenderer | null = null
beforeEach(() => {
  vi.stubGlobal('window', {
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    confirm: vi.fn(() => true),
  })
})
afterEach(() => {
  if (root) act(() => root!.unmount())
  root = null
  vi.unstubAllGlobals()
})
const base = () => ({
  ...emptyInvoice(),
  customer_name: 'Example tenant',
  customer_email: 'tenant@example.com',
  title: 'Café rent',
  items: [{ description: 'Rent {period}', quantity: 1, unit_pence: 75000 }],
})
function text(node: any): string {
  if (typeof node === 'string') return node
  return (node.children || []).map(text).join('')
}
function button(label: string) {
  const b = root!.root.findAllByType('button').find((n) => text(n) === label)
  if (!b) throw Error('Button not found: ' + label)
  return b
}
function field(label: string) {
  return root!.root.findAll((n) => n.props.label === label)[0]
}
function change(label: string, value: string) {
  act(() => {
    const f = field(label)
    const n = f.findAll((n) =>
      ['input', 'textarea', 'select'].includes(n.type as string),
    )[0]
    n.props.onChange({ target: { value } })
  })
}
async function submit(mode = 'draft') {
  const f = root!.root
    .findAllByType('form')
    .find((f) => f.props.id === 'invoice-editor')!
  await act(async () => {
    await f.props.onSubmit({
      preventDefault() {},
      nativeEvent: { submitter: { getAttribute: () => mode } },
    })
  })
}
function setup() {
  let records: Invoice[] = [],
    fail = false
  const s: InvoiceSeries = {
    id: 'series-one',
    name: 'Rent schedule',
    template: base(),
    next_date: '2026-11-23',
    anchor_day: 23,
    ends_on: '2027-11-11',
    active: false,
    auto_email: true,
    created_at: '',
  }
  const data = {
    settings: { ...DEFAULT_BILLING },
    invoices: records,
    series: [s],
  }
  const api = vi.fn(async (path: string, body?: any) => {
    if (path === '/settings') {
      if (body) data.settings = validateBilling(body.settings)
      return { settings: data.settings }
    }
    if (path === '/series') {
      if (body) {
        s.template = validateInvoice(body.template)
        Object.assign(s, body)
        return { id: s.id }
      }
      return { series: [s] }
    }
    if (path === '/preview') return { sent: true, to: 'staff@example.com' }
    if (path === '') {
      if (body) {
        if (fail) throw Error('Save failed — your changes are still here.')
        const payload = validateInvoice(body.payload),
          i: Invoice = {
            id: 'saved-id',
            number: body.action === 'issue' ? 'NFDR-1' : null,
            status: body.action === 'issue' ? 'issued' : 'draft',
            payload: { ...payload, seller: data.settings },
            job_id: null,
            series_id: null,
            occurrence_date: null,
            paid_pence: 0,
            sent_at: null,
            email_error: null,
            created_at: '',
          }
        records = [i]
        return { id: i.id }
      }
      return { invoices: records }
    }
    if (path === '/saved-id') return { invoice: records[0] }
    throw Error('Unexpected API action ' + path)
  })
  act(() => {
    root = TestRenderer.create(
      React.createElement(InvoiceWorkspace, {
        transport: api,
        initialData: data,
      }),
    )
  })
  return {
    api,
    data,
    failSave() {
      fail = true
    },
  }
}
describe('invoice setup interaction regressions', () => {
  it('lets a user type a decimal price and saves the exact amount', async () => {
    const { api } = setup()
    act(() => button('New invoice').props.onClick())
    change('Customer name', 'Test customer')
    change('Item 1 description', 'Screen repair')
    change('Unit price (£)', '12.')
    expect(field('Unit price (£)').findByType('input').props.value).toBe('12.')
    change('Unit price (£)', '12.34')
    await submit()
    const save = api.mock.calls.find(([path, body]) => path === '' && body)
    expect(save![1].payload.items[0].unit_pence).toBe(1234)
    expect(
      root!.root
        .findAllByProps({ role: 'status' })
        .some((n) => text(n).includes('Draft saved')),
    ).toBe(true)
  })
  it('preserves customer and price input when saving fails', async () => {
    const app = setup()
    act(() => button('New invoice').props.onClick())
    change('Customer name', 'Still here')
    change('Item 1 description', 'Repair')
    change('Unit price (£)', '89.95')
    app.failSave()
    await submit()
    expect(field('Customer name').findByType('input').props.value).toBe(
      'Still here',
    )
    expect(field('Unit price (£)').findByType('input').props.value).toBe(
      '89.95',
    )
    expect(
      root!.root
        .findAllByProps({ role: 'alert' })
        .some((n) => text(n).includes('your changes are still here')),
    ).toBe(true)
  })
  it('previews a saved schedule with real dates and keeps it paused on save', async () => {
    const { api } = setup()
    act(() => button('Recurring invoices').props.onClick())
    act(() => button('Edit schedule').props.onClick())
    change('Next invoice date', '2026-12-23')
    const html = root!.root.findByType('iframe').props.srcDoc
    expect(html).toContain('23 Dec 2026 to 22 Jan 2027')
    expect(html).not.toContain('{period}')
    expect(html).not.toContain('<img')
    await submit()
    const call = api.mock.calls.find(
      ([path, body]) => path === '/series' && body,
    )
    expect(call![1].active).toBe(false)
    expect(call![1].template.issue_date).toBe('2026-12-23')
  })
  it('shows both light and dark preview options and sends a staff preview explicitly', async () => {
    const { api } = setup()
    act(() => button('Recurring invoices').props.onClick())
    act(() => button('Preview').props.onClick())
    act(() => button('Dark').props.onClick())
    expect(root!.root.findByType('iframe').props.srcDoc).toContain(
      'background-color:#111b17!important',
    )
    await act(async () => {
      await button('Email preview to me').props.onClick()
    })
    expect(
      api.mock.calls.find(
        ([path, body]) => path === '/preview' && body.format === 'email',
      ),
    ).toBeTruthy()
    expect(
      root!.root
        .findAllByProps({ role: 'status' })
        .some((n) => text(n).includes('staff@example.com')),
    ).toBe(true)
  })
  it('saves a website entered without a protocol in business setup', async () => {
    setup()
    act(() => button('Business details').props.onClick())
    change('Website', 'nfdr.uk')
    const f = root!.root.findAllByType('form')[0]
    await act(async () => {
      await f.props.onSubmit({ preventDefault() {} })
    })
    expect(field('Website').findByType('input').props.value).toBe(
      'https://nfdr.uk',
    )
  })
})
