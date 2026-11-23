'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Suspense } from 'react'
import {
  BillingSettings,
  DEFAULT_BILLING,
  EMPTY_INVOICE_BANK,
  InvoiceBankAccount,
  Invoice,
  InvoicePayload,
  InvoiceSeries,
  emptyInvoice,
  invoiceTotal,
  money,
  todayUK,
} from '@/lib/invoices'
import { invoiceHtml } from '@/lib/invoice-template'

async function api(path: string, body?: unknown, method = 'POST') {
  const r = await fetch(
    `/api/invoices${path}`,
    body
      ? {
          method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          cache: 'no-store',
        }
      : { cache: 'no-store' },
  )
  const d = await r.json()
  if (!r.ok) throw Error(d.error || 'Please try again.')
  return d
}
const input =
  'w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 p-3 text-base'
const button =
  'rounded-lg border border-gray-300 dark:border-gray-600 px-4 py-3 font-semibold hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50'
const primary =
  'rounded-lg bg-primary px-5 py-3 text-white font-bold disabled:opacity-50'
function Field({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <label className="block space-y-1">
      <span className="block text-sm font-semibold text-gray-700 dark:text-gray-200">
        {label}
      </span>
      {children}
    </label>
  )
}

function InvoiceWorkspace() {
  const query = useSearchParams()
  const [tab, setTab] = useState<'invoices' | 'recurring' | 'settings'>(
    'invoices',
  )
  const [invoices, setInvoices] = useState<Invoice[]>([]),
    [series, setSeries] = useState<InvoiceSeries[]>([]),
    [settings, setSettings] = useState<BillingSettings>(DEFAULT_BILLING)
  const [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [notice, setNotice] = useState('')
  const [editing, setEditing] = useState(false),
    [selected, setSelected] = useState<Invoice | null>(null),
    [payload, setPayload] = useState<InvoicePayload>(emptyInvoice())
  const [schedule, setSchedule] = useState<{
    id?: string
    name: string
    next_date: string
    anchor_day: number
    ends_on: string
    active: boolean
    auto_email: boolean
  } | null>(null)
  const [payment, setPayment] = useState(''),
    [search, setSearch] = useState('')
  async function load() {
    const [a, b, c] = await Promise.all([
      api(''),
      api('/series'),
      api('/settings'),
    ])
    setInvoices(a.invoices)
    setSeries(b.series)
    setSettings(c.settings)
  }
  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        await load()
        const jobId = query.get('jobId')
        if (jobId) {
          const d = await api(`?jobId=${encodeURIComponent(jobId)}`)
          if (d.invoice) {
            setSelected(d.invoice)
            setPayload(d.invoice.payload)
            setPayment((d.invoice.paid_pence / 100).toFixed(2))
            setEditing(true)
          } else
            setNotice(
              'The repair invoice becomes available when the job is ready to collect or complete. Check that a price has been set.',
            )
        }
      } catch (e) {
        if (alive) setError((e as Error).message)
      } finally {
        if (alive) setLoading(false)
      }
    })()
    return () => {
      alive = false
    }
    // Load once on arrival, including a job link. Refresh follows every mutation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query])
  async function act(fn: () => Promise<void>) {
    if (busy) return
    setBusy(true)
    setError('')
    setNotice('')
    try {
      await fn()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  function newInvoice() {
    setSelected(null)
    setPayload(emptyInvoice())
    setSchedule(null)
    setEditing(true)
    setError('')
    setNotice('')
  }
  async function open(i: Invoice) {
    await act(async () => {
      const d = await api(`/${i.id}`)
      setSelected({ ...i, ...d.invoice })
      setPayload(d.invoice.payload)
      setPayment((d.invoice.paid_pence / 100).toFixed(2))
      setSchedule(null)
      setEditing(true)
    })
  }
  function openSeries(s: InvoiceSeries) {
    setSelected(null)
    setPayload(s.template)
    setSchedule({ ...s, ends_on: s.ends_on || '' })
    setEditing(true)
    setError('')
    setNotice('')
  }
  function set(k: keyof InvoicePayload, v: unknown) {
    setPayload((p) => ({ ...p, [k]: v }))
  }
  async function save(issue = false) {
    await act(async () => {
      if (schedule) {
        await api('/series', { ...schedule, template: payload })
        setNotice(
          schedule.active
            ? 'Recurring invoice saved and active.'
            : 'Recurring invoice saved and paused.',
        )
        setEditing(false)
      } else {
        const d = await api('', {
          id: selected?.id,
          payload,
          action: issue ? 'issue' : 'save',
        })
        const saved = await api(`/${d.id}`)
        setSelected(saved.invoice)
        setPayload(saved.invoice.payload)
        setNotice(
          issue
            ? 'Invoice issued. You can download it or send it by email.'
            : 'Draft saved.',
        )
      }
      await load()
    })
  }
  async function send() {
    if (!selected) return
    if (
      selected.sent_at &&
      !window.confirm('Send another copy of this invoice to the customer?')
    )
      return
    await act(async () => {
      const d = await api(`/${selected.id}`, {
        action: 'send',
        resend: !!selected.sent_at,
      })
      setNotice(d.sent ? 'Invoice emailed with the PDF attached.' : d.message)
      await load()
      setSelected({
        ...selected,
        email_error: d.sent ? null : selected.email_error,
        sent_at: d.sent ? new Date().toISOString() : selected.sent_at,
      })
    })
  }
  const locked = !!selected && selected.status !== 'draft' && !schedule
  const preview: Invoice = {
    ...(selected || {
      id: 'preview',
      number: null,
      status: 'draft',
      job_id: null,
      series_id: null,
      occurrence_date: null,
      paid_pence: 0,
      sent_at: null,
      email_error: null,
      created_at: '',
    }),
    payload: { ...payload, seller: locked ? payload.seller : settings },
  }
  const filtered = invoices.filter((i) =>
    `${i.number || 'Draft'} ${i.payload.customer_name} ${i.payload.reference} ${i.payload.title}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  )
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-white">
      <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        <div className="max-w-7xl mx-auto px-4 py-5 flex flex-wrap items-center justify-between gap-4">
          <div>
            <Link
              href="/app/jobs"
              className="text-sm text-primary font-semibold"
            >
              Back to repairs
            </Link>
            <h1 className="text-3xl font-bold mt-1">Invoices</h1>
            <p className="text-gray-600 dark:text-gray-300 mt-1">
              Repairs, custom invoices and monthly billing.
            </p>
          </div>
          <button
            onClick={() => {
              setTab('invoices')
              newInvoice()
            }}
            className={primary}
          >
            Create invoice
          </button>
        </div>
      </header>
      <main className="max-w-7xl mx-auto p-4 md:p-6 space-y-5">
        <nav aria-label="Invoice pages" className="flex gap-2 overflow-x-auto">
          {(['invoices', 'recurring', 'settings'] as const).map((t) => (
            <button
              key={t}
              onClick={() => {
                setTab(t)
                setEditing(false)
                setSelected(null)
                setSchedule(null)
                setError('')
                setNotice('')
              }}
              className={`${button} whitespace-nowrap ${tab === t ? '!border-primary !bg-primary/10 text-primary' : ''}`}
            >
              {t === 'invoices'
                ? 'All invoices'
                : t === 'recurring'
                  ? 'Recurring invoices'
                  : 'Invoice settings'}
            </button>
          ))}
        </nav>
        {error && (
          <div
            role="alert"
            className="rounded-lg p-4 bg-red-50 text-red-800 border border-red-200"
          >
            {error}
          </div>
        )}
        {notice && (
          <div
            role="status"
            className="rounded-lg p-4 bg-green-50 text-green-900 border border-green-200"
          >
            {notice}
          </div>
        )}
        {loading ? (
          <p role="status" className="p-8">
            Loading invoices…
          </p>
        ) : (
          <>
            {tab === 'settings' && (
              <section className="bg-white dark:bg-gray-800 rounded-xl border dark:border-gray-700 p-5 space-y-6 max-w-3xl">
                <h2 className="text-xl font-bold">
                  Business and payment details
                </h2>
                <p className="text-gray-600 dark:text-gray-300">
                  These details appear on new invoices. Issued invoices keep the
                  details they were created with.
                </p>
                <div className="grid sm:grid-cols-2 gap-4">
                  {(
                    [
                      ['business_name', 'Business name'],
                      ['legal_name', 'Legal name'],
                      ['email', 'Email'],
                      ['website', 'Website'],
                      ['bank_name', 'Bank / account provider'],
                      ['account_name', 'Account name'],
                      ['sort_code', 'Sort code'],
                      ['account_number', 'Account number'],
                    ] as [keyof BillingSettings, string][]
                  ).map(([key, label]) => (
                    <Field key={key} label={label}>
                      <input
                        className={input}
                        value={settings[key]}
                        maxLength={3000}
                        onChange={(e) =>
                          setSettings({ ...settings, [key]: e.target.value })
                        }
                      />
                    </Field>
                  ))}
                </div>
                {(
                  [
                    ['address', 'Business address'],
                    [
                      'payment_instructions',
                      'Additional bank payment instructions',
                    ],
                    ['footer', 'Invoice footer'],
                  ] as [keyof BillingSettings, string][]
                ).map(([key, label]) => (
                  <Field key={key} label={label}>
                    <textarea
                      className={input}
                      rows={3}
                      value={settings[key]}
                      maxLength={3000}
                      onChange={(e) =>
                        setSettings({ ...settings, [key]: e.target.value })
                      }
                    />
                  </Field>
                ))}
                <p className="text-sm text-gray-600 dark:text-gray-300">
                  Bank transfer invoices show your bank details and payment
                  reference. No online card payment link is added. No VAT is
                  charged.
                </p>
                <button
                  className={primary}
                  disabled={busy}
                  onClick={() =>
                    act(async () => {
                      await api('/settings', { settings })
                      setNotice('Invoice settings saved.')
                    })
                  }
                >
                  {busy ? 'Saving…' : 'Save settings'}
                </button>
              </section>
            )}
            {tab === 'invoices' && !editing && (
              <section className="space-y-4">
                <div className="grid sm:grid-cols-3 gap-4">
                  {[
                    [
                      'Issued',
                      String(
                        invoices.filter((i) => i.status === 'issued').length,
                      ),
                    ],
                    [
                      'Drafts',
                      String(
                        invoices.filter((i) => i.status === 'draft').length,
                      ),
                    ],
                    ['Recurring schedules', String(series.length)],
                  ].map(([label, value]) => (
                    <div
                      key={label}
                      className="bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-xl p-5"
                    >
                      <p className="text-gray-600 dark:text-gray-300">
                        {label}
                      </p>
                      <p className="font-bold text-3xl mt-1">{value}</p>
                    </div>
                  ))}
                </div>
                <Field label="Search invoices">
                  <input
                    className={input}
                    placeholder="Invoice number, customer or reference"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </Field>
                {!filtered.length ? (
                  <div className="rounded-xl bg-white dark:bg-gray-800 border dark:border-gray-700 p-8">
                    <h2 className="text-xl font-bold">
                      {search
                        ? 'No matching invoices'
                        : 'Your invoices will appear here'}
                    </h2>
                    <p className="mt-2 text-gray-600 dark:text-gray-300">
                      Create a custom invoice, or open Invoice on a completed
                      repair. Customers can also download their invoice from
                      their tracking page.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {filtered.map((i) => (
                      <button
                        key={i.id}
                        onClick={() => open(i)}
                        disabled={busy}
                        className="w-full text-left rounded-xl bg-white dark:bg-gray-800 border dark:border-gray-700 p-5 flex flex-wrap justify-between items-center gap-3 hover:border-primary"
                      >
                        <div>
                          <p className="font-bold">
                            {i.number || 'Draft invoice'}{' '}
                            <span className="ml-2 text-sm font-normal capitalize">
                              {i.status}
                            </span>
                          </p>
                          <p className="mt-1">{i.payload.customer_name}</p>
                          <p className="text-sm text-gray-500 dark:text-gray-300 mt-1">
                            {i.payload.title} · {i.payload.issue_date}
                            {i.sent_at ? ' · Emailed' : ''}
                            {i.email_error ? ' · Email needs attention' : ''}
                          </p>
                        </div>
                        <p className="text-xl font-bold">
                          {money(invoiceTotal(i.payload))}
                        </p>
                      </button>
                    ))}
                  </div>
                )}
                {invoices.length === 200 && (
                  <p className="text-sm text-gray-500">
                    Showing the latest 200 invoices.
                  </p>
                )}
              </section>
            )}
            {tab === 'recurring' && !editing && (
              <section className="space-y-4">
                <div className="flex flex-wrap gap-3">
                  <button
                    className={primary}
                    onClick={() => {
                      newInvoice()
                      setSchedule({
                        name: '',
                        next_date: todayUK(),
                        anchor_day: Number(todayUK().slice(-2)),
                        ends_on: '',
                        active: false,
                        auto_email: false,
                      })
                    }}
                  >
                    Create recurring invoice
                  </button>
                  <button
                    className={button}
                    disabled={busy}
                    onClick={() =>
                      act(async () => {
                        const d = await api('/run', {})
                        const failed = d.results.filter((r: any) => r.error)
                        await load()
                        if (failed.length)
                          throw Error(
                            failed.map((r: any) => r.error).join('; '),
                          )
                        setNotice(
                          'Due schedules processed. No duplicate invoices were created.',
                        )
                      })
                    }
                  >
                    Process due invoices
                  </button>
                </div>
                <p className="text-gray-600 dark:text-gray-300">
                  Active schedules run daily at 09:00 UTC. Each month gets its
                  own invoice number. Use {'{period}'} in an item description to
                  insert the rental or service period. A final partial month is
                  prorated when an end date is set.
                </p>
                {!series.length ? (
                  <p className="bg-white dark:bg-gray-800 rounded-xl p-8 border dark:border-gray-700">
                    No recurring invoices yet.
                  </p>
                ) : (
                  series.map((s) => (
                    <div
                      key={s.id}
                      className="rounded-xl p-5 border dark:border-gray-700 bg-white dark:bg-gray-800 flex flex-wrap items-center justify-between gap-4"
                    >
                      <div>
                        <h2 className="text-lg font-bold">{s.name}</h2>
                        <p>
                          {s.template.customer_name} ·{' '}
                          {money(invoiceTotal(s.template))} monthly
                        </p>
                        <p className="text-sm text-gray-600 dark:text-gray-300">
                          {s.active ? 'Active' : 'Paused'} · Next: {s.next_date}{' '}
                          · {s.auto_email ? 'Automatic email' : 'Create only'}
                        </p>
                      </div>
                      <button className={button} onClick={() => openSeries(s)}>
                        Edit schedule
                      </button>
                    </div>
                  ))
                )}
              </section>
            )}
            {editing && tab !== 'settings' && (
              <section className="space-y-5">
                <div className="flex flex-wrap justify-between gap-3">
                  <div>
                    <button
                      className="text-primary underline"
                      onClick={() => {
                        setEditing(false)
                        setSelected(null)
                        setSchedule(null)
                      }}
                    >
                      Back to {tab === 'recurring' ? 'schedules' : 'invoices'}
                    </button>
                    <h2 className="text-2xl font-bold mt-2">
                      {schedule
                        ? 'Monthly invoice'
                        : selected?.number || 'New invoice'}
                    </h2>
                  </div>
                  <div className="flex flex-wrap gap-2 items-start">
                    {!locked ? (
                      <>
                        <button
                          className={button}
                          disabled={busy}
                          onClick={() => save(false)}
                        >
                          {busy
                            ? 'Saving…'
                            : schedule
                              ? 'Save schedule'
                              : 'Save draft'}
                        </button>
                        {!schedule && (
                          <button
                            className={primary}
                            disabled={busy}
                            onClick={() => save(true)}
                          >
                            Issue invoice
                          </button>
                        )}
                      </>
                    ) : (
                      <>
                        <a
                          className={button}
                          href={`/api/invoices/${selected!.id}?format=pdf`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Download PDF
                        </a>
                        {selected!.status === 'issued' && (
                          <button
                            className={primary}
                            disabled={busy}
                            onClick={send}
                          >
                            {busy
                              ? 'Sending…'
                              : selected!.sent_at
                                ? 'Email another copy'
                                : 'Email invoice'}
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </div>
                {locked && (
                  <p className="rounded-lg bg-white dark:bg-gray-800 border dark:border-gray-700 p-4">
                    Issued invoices keep their original item lines and business
                    details.{' '}
                    {selected?.job_id
                      ? 'Payments update from the repair job.'
                      : 'Record payments received below.'}
                  </p>
                )}
                {selected?.email_error && (
                  <p
                    role="alert"
                    className="rounded-lg p-4 bg-amber-50 text-amber-900"
                  >
                    Last email attempt: {selected.email_error}
                  </p>
                )}
                <div className="grid xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-6 items-start">
                  <div className="bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-xl p-5 space-y-5">
                    {schedule && (
                      <div className="space-y-4 pb-5 border-b dark:border-gray-700">
                        <Field label="Schedule name">
                          <input
                            className={input}
                            value={schedule.name}
                            onChange={(e) =>
                              setSchedule({ ...schedule, name: e.target.value })
                            }
                          />
                        </Field>
                        <div className="grid sm:grid-cols-2 gap-4">
                          <Field label="Next invoice date">
                            <input
                              className={input}
                              type="date"
                              value={schedule.next_date}
                              onChange={(e) =>
                                setSchedule({
                                  ...schedule,
                                  next_date: e.target.value,
                                })
                              }
                            />
                          </Field>
                          <Field label="Day of each month">
                            <input
                              className={input}
                              type="number"
                              min="1"
                              max="31"
                              value={schedule.anchor_day}
                              onChange={(e) =>
                                setSchedule({
                                  ...schedule,
                                  anchor_day: Number(e.target.value),
                                })
                              }
                            />
                          </Field>
                        </div>
                        <Field label="Last day of service / rental (optional)">
                          <input
                            className={input}
                            type="date"
                            value={schedule.ends_on}
                            onChange={(e) =>
                              setSchedule({
                                ...schedule,
                                ends_on: e.target.value,
                              })
                            }
                          />
                        </Field>
                        <label className="flex gap-3 items-center">
                          <input
                            type="checkbox"
                            className="w-5 h-5"
                            checked={schedule.active}
                            onChange={(e) =>
                              setSchedule({
                                ...schedule,
                                active: e.target.checked,
                              })
                            }
                          />
                          Active — generate invoices when due
                        </label>
                        <label className="flex gap-3 items-center">
                          <input
                            type="checkbox"
                            className="w-5 h-5"
                            checked={schedule.auto_email}
                            onChange={(e) =>
                              setSchedule({
                                ...schedule,
                                auto_email: e.target.checked,
                              })
                            }
                          />
                          Email each invoice automatically
                        </label>
                      </div>
                    )}
                    <fieldset
                      disabled={locked}
                      className="space-y-4 disabled:opacity-80"
                    >
                      <legend className="text-lg font-bold mb-3">
                        Invoice details
                      </legend>
                      <Field label="Bill to">
                        <input
                          className={input}
                          value={payload.customer_name}
                          onChange={(e) => set('customer_name', e.target.value)}
                          maxLength={300}
                        />
                      </Field>
                      <Field label="Customer email">
                        <input
                          className={input}
                          type="email"
                          value={payload.customer_email}
                          onChange={(e) =>
                            set('customer_email', e.target.value)
                          }
                          maxLength={254}
                        />
                      </Field>
                      <Field label="Customer address">
                        <textarea
                          className={input}
                          rows={3}
                          value={payload.customer_address}
                          onChange={(e) =>
                            set('customer_address', e.target.value)
                          }
                          maxLength={1500}
                        />
                      </Field>
                      <div className="grid sm:grid-cols-2 gap-4">
                        <Field label="Invoice title">
                          <input
                            className={input}
                            value={payload.title}
                            onChange={(e) => set('title', e.target.value)}
                            maxLength={200}
                          />
                        </Field>
                        <Field label="Reference">
                          <input
                            className={input}
                            value={payload.reference}
                            onChange={(e) => set('reference', e.target.value)}
                            maxLength={200}
                          />
                        </Field>
                      </div>
                      {!schedule && (
                        <div className="grid sm:grid-cols-2 gap-4">
                          <Field label="Invoice date">
                            <input
                              className={input}
                              type="date"
                              value={payload.issue_date}
                              onChange={(e) =>
                                set('issue_date', e.target.value)
                              }
                            />
                          </Field>
                          <Field label="Due date">
                            <input
                              className={input}
                              type="date"
                              value={payload.due_date}
                              onChange={(e) => set('due_date', e.target.value)}
                            />
                          </Field>
                        </div>
                      )}
                      <div className="space-y-4">
                        <h3 className="font-bold">Items</h3>
                        {payload.items.map((i, index) => (
                          <div
                            key={index}
                            className="rounded-lg p-3 border dark:border-gray-600 space-y-3"
                          >
                            <Field label={`Description ${index + 1}`}>
                              <textarea
                                className={input}
                                rows={2}
                                value={i.description}
                                maxLength={3000}
                                onChange={(e) =>
                                  set(
                                    'items',
                                    payload.items.map((x, n) =>
                                      n === index
                                        ? { ...x, description: e.target.value }
                                        : x,
                                    ),
                                  )
                                }
                              />
                            </Field>
                            <div className="grid grid-cols-2 gap-3">
                              <Field label="Quantity">
                                <input
                                  className={input}
                                  type="number"
                                  min="0.001"
                                  step="0.001"
                                  value={i.quantity}
                                  onChange={(e) =>
                                    set(
                                      'items',
                                      payload.items.map((x, n) =>
                                        n === index
                                          ? {
                                              ...x,
                                              quantity: Number(e.target.value),
                                            }
                                          : x,
                                      ),
                                    )
                                  }
                                />
                              </Field>
                              <Field label="Unit price (£)">
                                <input
                                  className={input}
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  value={i.unit_pence / 100}
                                  onChange={(e) =>
                                    set(
                                      'items',
                                      payload.items.map((x, n) =>
                                        n === index
                                          ? {
                                              ...x,
                                              unit_pence: Math.round(
                                                Number(e.target.value) * 100,
                                              ),
                                            }
                                          : x,
                                      ),
                                    )
                                  }
                                />
                              </Field>
                            </div>
                            <div className="flex justify-between items-center">
                              <span className="font-semibold">
                                {money(Math.round(i.quantity * i.unit_pence))}
                              </span>
                              {!locked && payload.items.length > 1 && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    set(
                                      'items',
                                      payload.items.filter(
                                        (_, n) => n !== index,
                                      ),
                                    )
                                  }
                                  className="text-red-700 underline"
                                >
                                  Remove item
                                </button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                      {!locked && (
                        <button
                          type="button"
                          className={button}
                          onClick={() =>
                            set('items', [
                              ...payload.items,
                              { description: '', quantity: 1, unit_pence: 0 },
                            ])
                          }
                        >
                          Add item
                        </button>
                      )}
                      <p className="font-bold text-xl text-right">
                        Total {money(invoiceTotal(payload))}
                      </p>
                      <Field label="Payment method">
                        <select
                          className={input}
                          value={payload.payment_method}
                          onChange={(e) =>
                            set('payment_method', e.target.value)
                          }
                        >
                          <option value="in_shop">
                            In shop / arranged separately
                          </option>
                          <option value="bank_transfer">
                            Bank transfer only
                          </option>
                        </select>
                      </Field>
                      {payload.payment_method === 'bank_transfer' && (
                        <div className="space-y-3 rounded-lg border border-gray-300 dark:border-gray-600 p-4">
                          <label className="flex items-center gap-3">
                            <input
                              type="checkbox"
                              className="w-5 h-5"
                              checked={!!payload.bank_account}
                              onChange={(e) =>
                                set(
                                  'bank_account',
                                  e.target.checked
                                    ? { ...EMPTY_INVOICE_BANK }
                                    : undefined,
                                )
                              }
                            />
                            <span>
                              Separate bank details for this invoice or schedule
                            </span>
                          </label>
                          {payload.bank_account && (
                            <>
                              <p className="text-sm text-gray-600 dark:text-gray-300">
                                These bank details are used only for this
                                invoice or recurring schedule.
                              </p>
                              <div className="grid sm:grid-cols-2 gap-3">
                                {(
                                  [
                                    ['bank_name', 'Bank / account provider'],
                                    ['account_name', 'Account name'],
                                    ['sort_code', 'Sort code'],
                                    ['account_number', 'Account number'],
                                  ] as [keyof InvoiceBankAccount, string][]
                                ).map(([key, label]) => (
                                  <Field key={key} label={label}>
                                    <input
                                      className={input}
                                      maxLength={200}
                                      value={payload.bank_account![key]}
                                      onChange={(e) =>
                                        set('bank_account', {
                                          ...payload.bank_account!,
                                          [key]: e.target.value,
                                        })
                                      }
                                    />
                                  </Field>
                                ))}
                              </div>
                            </>
                          )}
                        </div>
                      )}
                      <Field label="Additional payment instructions">
                        <textarea
                          className={input}
                          rows={3}
                          value={payload.payment_instructions}
                          maxLength={3000}
                          onChange={(e) =>
                            set('payment_instructions', e.target.value)
                          }
                        />
                      </Field>
                      <Field label="Notes">
                        <textarea
                          className={input}
                          rows={3}
                          value={payload.notes}
                          maxLength={6000}
                          onChange={(e) => set('notes', e.target.value)}
                        />
                      </Field>
                    </fieldset>
                    {selected?.status === 'issued' &&
                      !selected.job_id &&
                      !schedule && (
                        <div className="pt-4 border-t dark:border-gray-700 space-y-3">
                          <Field label="Total payments received (£)">
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              className={input}
                              value={payment}
                              onChange={(e) => setPayment(e.target.value)}
                            />
                          </Field>
                          <button
                            className={button}
                            disabled={busy}
                            onClick={() =>
                              act(async () => {
                                if (
                                  payment.trim() === '' ||
                                  !Number.isFinite(Number(payment))
                                )
                                  throw Error('Enter an amount received.')
                                const paid_pence = Math.round(
                                  Number(payment) * 100,
                                )
                                await api(`/${selected.id}`, {
                                  action: 'payment',
                                  paid_pence,
                                })
                                setSelected({ ...selected, paid_pence })
                                await load()
                                setNotice('Payment recorded.')
                              })
                            }
                          >
                            Record payment
                          </button>
                        </div>
                      )}
                    {selected?.status === 'issued' && !schedule && (
                      <button
                        className="text-red-700 underline"
                        disabled={busy}
                        onClick={() => {
                          if (
                            window.confirm(
                              'Void this invoice? The original stays on record and its download will be marked VOID.',
                            )
                          )
                            act(async () => {
                              await api(`/${selected.id}`, { action: 'void' })
                              setSelected({ ...selected, status: 'void' })
                              await load()
                              setNotice('Invoice voided.')
                            })
                        }}
                      >
                        Void invoice
                      </button>
                    )}
                    {selected?.status === 'draft' && !schedule && (
                      <button
                        className="text-red-700 underline"
                        disabled={busy}
                        onClick={() => {
                          if (window.confirm('Delete this draft?'))
                            act(async () => {
                              await api(`/${selected.id}`, {}, 'DELETE')
                              setEditing(false)
                              await load()
                              setNotice('Draft deleted.')
                            })
                        }}
                      >
                        Delete draft
                      </button>
                    )}
                  </div>
                  <div className="space-y-3 min-w-0">
                    <div className="flex justify-between">
                      <h3 className="font-bold">Invoice preview</h3>
                      <span className="text-sm text-gray-500 dark:text-gray-300">
                        PDF uses an A4 layout
                      </span>
                    </div>
                    <iframe
                      title="Invoice preview"
                      sandbox=""
                      className="w-full h-[1000px] rounded-xl border bg-white"
                      srcDoc={invoiceHtml(preview).replace(
                        /src="[^\"]+\/images\/logo.png"/,
                        'src="/nfdr-logo.png"',
                      )}
                    />
                  </div>
                </div>
              </section>
            )}
          </>
        )}
      </main>
    </div>
  )
}
export default function InvoicesPage() {
  return (
    <Suspense fallback={<p className="p-8">Loading invoices…</p>}>
      <InvoiceWorkspace />
    </Suspense>
  )
}
