'use client'
import { useEffect, useState, FormEvent } from 'react'
import Link from 'next/link'
import {
  FileText,
  Plus,
  ArrowLeft,
  Eye,
  Save,
  Mail,
  Download,
  Settings,
  Repeat,
  Trash2,
} from 'lucide-react'
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
import {
  InvoiceDraft,
  ScheduleDraft,
  InvoiceInitialData,
  InvoiceTransport,
  invoiceApi,
  invoiceToDraft,
  draftToInvoice,
  poundsToPence,
  recurringPreview,
} from '@/lib/invoice-editor'
import { invoiceHtml, InvoiceEmailTheme } from '@/lib/invoice-template'
const input =
  'w-full min-w-0 rounded-lg border border-slate-300 bg-white px-3 py-3 text-base text-slate-900 outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/15 disabled:bg-slate-50 disabled:text-slate-600 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 dark:disabled:bg-slate-800'
const secondary =
  'inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700'
const primary =
  'inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-700 px-4 py-3 text-sm font-bold text-white hover:bg-emerald-800 disabled:opacity-50'
const card =
  'rounded-xl border border-slate-200 bg-white p-5 sm:p-6 dark:border-slate-700 dark:bg-slate-800'
function Field({
  label,
  children,
  hint,
}: {
  label: string
  children: React.ReactNode
  hint?: string
}) {
  return (
    <label className="block min-w-0 space-y-1.5">
      <span className="block text-sm font-semibold text-slate-700 dark:text-slate-200">
        {label}
      </span>
      {children}
      {hint && (
        <span className="block text-sm text-slate-500 dark:text-slate-400">
          {hint}
        </span>
      )}
    </label>
  )
}
function Section({
  title,
  children,
  hint,
}: {
  title: string
  children: React.ReactNode
  hint?: string
}) {
  return (
    <section className={card}>
      <h2 className="text-lg font-bold">{title}</h2>
      {hint && (
        <p className="mt-1 text-sm leading-relaxed text-slate-500 dark:text-slate-400">
          {hint}
        </p>
      )}
      <div className="mt-5 space-y-4">{children}</div>
    </section>
  )
}
function prettyDate(value: string) {
  if (!value) return 'Choose a date'
  return new Date(value + 'T12:00:00Z').toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}
function ordinal(n: number) {
  const v = n % 100
  return (
    n +
    (['st', 'nd', 'rd'][(n % 10) - 1] && !(v >= 11 && v <= 13)
      ? ['st', 'nd', 'rd'][(n % 10) - 1]
      : 'th')
  )
}
function newForm() {
  const f = invoiceToDraft(emptyInvoice())
  f.items[0].unit_price = ''
  return f
}
function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob),
    a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.append(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 60000)
}
const signature = (form: InvoiceDraft, schedule: ScheduleDraft | null) =>
  JSON.stringify({ form, schedule })

export default function InvoiceWorkspace({
  jobId,
  transport = invoiceApi,
  initialData,
}: {
  jobId?: string
  transport?: InvoiceTransport
  initialData?: InvoiceInitialData
}) {
  const [tab, setTab] = useState<'invoices' | 'recurring' | 'settings'>(
    'invoices',
  )
  const [invoices, setInvoices] = useState<Invoice[]>(
      initialData?.invoices || [],
    ),
    [series, setSeries] = useState<InvoiceSeries[]>(initialData?.series || []),
    [settings, setSettings] = useState<BillingSettings>(
      initialData?.settings || DEFAULT_BILLING,
    )
  const [loading, setLoading] = useState(!initialData),
    [ready, setReady] = useState(!!initialData),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [notice, setNotice] = useState('')
  const [editing, setEditing] = useState(false),
    [selected, setSelected] = useState<Invoice | null>(null),
    [form, setForm] = useState<InvoiceDraft>(newForm),
    [schedule, setSchedule] = useState<ScheduleDraft | null>(null),
    [baseline, setBaseline] = useState('')
  const [pane, setPane] = useState<'edit' | 'preview'>('edit'),
    [theme, setTheme] = useState<InvoiceEmailTheme>('light'),
    [search, setSearch] = useState(''),
    [payment, setPayment] = useState('')
  const [settingsBaseline, setSettingsBaseline] = useState(
    JSON.stringify(initialData?.settings || DEFAULT_BILLING),
  )
  const dirty =
    (editing && signature(form, schedule) !== baseline) ||
    (tab === 'settings' && JSON.stringify(settings) !== settingsBaseline)
  const locked = !!selected && selected.status !== 'draft' && !schedule
  async function lists() {
    const [a, b] = await Promise.all([transport(''), transport('/series')])
    setInvoices(a.invoices || [])
    setSeries(b.series || [])
  }
  function start(
    p: InvoicePayload,
    i: Invoice | null,
    s: ScheduleDraft | null,
  ) {
    const f = invoiceToDraft(p)
    setForm(f)
    setSelected(i)
    setSchedule(s)
    setPayment(((i?.paid_pence || 0) / 100).toFixed(2))
    setBaseline(signature(f, s))
    setEditing(true)
    setPane('edit')
    setError('')
    setNotice('')
  }
  async function load() {
    setLoading(true)
    setError('')
    try {
      const [a, b, c] = await Promise.all([
        transport(''),
        transport('/series'),
        transport('/settings'),
      ])
      setInvoices(a.invoices || [])
      setSeries(b.series || [])
      setSettings(c.settings)
      setSettingsBaseline(JSON.stringify(c.settings))
      setReady(true)
      if (jobId) {
        const d = await transport('?jobId=' + encodeURIComponent(jobId))
        if (d.invoice) start(d.invoice.payload, d.invoice, null)
        else
          setNotice(
            'Set a repair price and mark the job ready to collect before creating its invoice.',
          )
      }
    } catch (e) {
      setError((e as Error).message)
      setReady(false)
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => {
    if (!initialData) load()
    // This workspace loads on arrival. Saves refresh the lists without resetting open forms.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId, transport, initialData])
  useEffect(() => {
    if (!dirty) return
    const stop = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', stop)
    return () => window.removeEventListener('beforeunload', stop)
  }, [dirty])
  async function run(fn: () => Promise<void>) {
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
  function leave() {
    return !dirty || window.confirm('Leave without saving these changes?')
  }
  function navigate(next: typeof tab) {
    if (busy || !leave()) return
    setTab(next)
    setEditing(false)
    setSelected(null)
    setSchedule(null)
    setError('')
    setNotice('')
  }
  function create(recurring = false) {
    if (busy || !leave()) return
    const p = emptyInvoice(),
      f = newForm(),
      s: ScheduleDraft | null = recurring
        ? {
            name: '',
            next_date: todayUK(),
            anchor_day: Number(todayUK().slice(-2)),
            ends_on: '',
            active: false,
            auto_email: false,
          }
        : null
    setTab(recurring ? 'recurring' : 'invoices')
    start(p, null, s)
    setForm(f)
    setBaseline(signature(f, s))
  }
  async function open(i: Invoice) {
    await run(async () => {
      const d = await transport('/' + i.id)
      start(d.invoice.payload, { ...i, ...d.invoice }, null)
    })
  }
  function openSeries(s: InvoiceSeries, preview = false) {
    start(s.template, null, {
      id: s.id,
      name: s.name,
      next_date: s.next_date,
      anchor_day: s.anchor_day,
      ends_on: s.ends_on || '',
      active: s.active,
      auto_email: s.auto_email,
    })
    if (preview) setPane('preview')
  }
  const set = (key: keyof InvoiceDraft, value: unknown) =>
    setForm((p) => ({ ...p, [key]: value }))
  function currentPayload() {
    const p = draftToInvoice(
      schedule
        ? {
            ...form,
            issue_date: schedule.next_date,
            due_date: schedule.next_date,
          }
        : form,
    )
    return p
  }
  function getPreview(): Invoice {
    let p = locked ? selected!.payload : currentPayload()
    if (schedule) p = recurringPreview(p, schedule)
    return {
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
      payload: { ...p, seller: locked ? p.seller : settings },
    }
  }
  let preview: Invoice | null = null,
    previewError = ''
  try {
    preview = getPreview()
  } catch (e) {
    previewError = (e as Error).message
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const issue =
      (event.nativeEvent as SubmitEvent).submitter?.getAttribute('value') ===
      'issue'
    await run(async () => {
      const payload = currentPayload()
      if (schedule) {
        await transport('/series', { ...schedule, template: payload })
        setBaseline(signature(form, schedule))
        setEditing(false)
        setNotice(
          schedule.active
            ? 'Monthly invoice saved. Automatic billing is active.'
            : 'Monthly invoice saved and paused.',
        )
      } else {
        const saved = await transport('', {
            id: selected?.id,
            payload,
            action: issue ? 'issue' : 'save',
          }),
          d = await transport('/' + saved.id)
        start(d.invoice.payload, d.invoice, null)
        setNotice(
          issue
            ? 'Invoice issued. You can now download it or email the customer.'
            : 'Draft saved.',
        )
      }
      await lists()
    })
  }
  async function previewAction(format: 'pdf' | 'email') {
    await run(async () => {
      const d = await transport('/preview', {
        ...(locked
          ? { invoiceId: selected!.id }
          : {
              payload: currentPayload(),
              schedule: schedule
                ? {
                    next_date: schedule.next_date,
                    anchor_day: schedule.anchor_day,
                    ends_on: schedule.ends_on,
                  }
                : undefined,
            }),
        format,
      })
      if (format === 'pdf') download(d.blob, 'NFDR-invoice-preview.pdf')
      else
        setNotice(
          'Preview sent to ' + d.to + '. The customer has not been emailed.',
        )
    })
  }
  async function send() {
    if (!selected) return
    if (
      selected.sent_at &&
      !window.confirm('Email another copy of this invoice to the customer?')
    )
      return
    await run(async () => {
      const d = await transport('/' + selected.id, {
        action: 'send',
        resend: !!selected.sent_at,
      })
      if (d.sent) {
        const fresh = await transport('/' + selected.id)
        setSelected(fresh.invoice)
        setNotice('Invoice emailed to ' + selected.payload.customer_email + '.')
      } else setNotice(d.message)
      await lists()
    })
  }
  const filtered = invoices.filter((i) =>
    [
      i.number || 'draft',
      i.payload.customer_name,
      i.payload.reference,
      i.payload.title,
    ]
      .join(' ')
      .toLowerCase()
      .includes(search.toLowerCase()),
  )
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <header className="border-b border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
        <div className="mx-auto max-w-7xl px-4 py-5 sm:px-6">
          <Link
            href="/app/jobs"
            className="inline-flex items-center gap-2 text-sm font-semibold text-emerald-700 dark:text-emerald-300"
          >
            <ArrowLeft size={16} />
            Repairs
          </Link>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold tracking-tight">Invoices</h1>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                Create, preview and send your invoices.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                className={secondary}
                disabled={busy || !ready}
                onClick={() => create(true)}
              >
                <Repeat size={17} />
                New monthly invoice
              </button>
              <button
                className={primary}
                disabled={busy || !ready}
                onClick={() => create()}
              >
                <Plus size={17} />
                New invoice
              </button>
            </div>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl space-y-5 px-4 py-5 sm:px-6">
        <nav
          aria-label="Invoice pages"
          className="flex gap-1 overflow-x-auto border-b border-slate-200 dark:border-slate-700"
        >
          {(
            [
              ['invoices', 'Invoices', FileText],
              ['recurring', 'Recurring invoices', Repeat],
              ['settings', 'Business details', Settings],
            ] as const
          ).map(([key, label, Icon]) => (
            <button
              key={key}
              disabled={busy}
              onClick={() => navigate(key)}
              aria-current={tab === key ? 'page' : undefined}
              className={`inline-flex shrink-0 items-center gap-2 border-b-2 px-3 pb-3 text-sm font-semibold ${tab === key ? 'border-emerald-700 text-emerald-700 dark:border-emerald-300 dark:text-emerald-300' : 'border-transparent text-slate-500 dark:text-slate-400'}`}
            >
              <Icon size={16} />
              {label}
            </button>
          ))}
        </nav>
        {(error || notice) && (
          <div
            className={`sticky top-2 z-30 rounded-lg border p-4 text-sm shadow-sm ${error ? 'border-red-200 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200' : 'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200'}`}
            role={error ? 'alert' : 'status'}
          >
            {error || notice}
            {error && !ready && (
              <button className="ml-3 font-bold underline" onClick={load}>
                Try again
              </button>
            )}
            {error.includes('Sign in') && (
              <Link
                href="/login?next=/app/invoices"
                className="ml-3 font-bold underline"
              >
                Sign in
              </Link>
            )}
          </div>
        )}
        {loading ? (
          <p role="status" className="py-10 text-center text-slate-500">
            Loading invoices…
          </p>
        ) : (
          <>
            {tab === 'settings' && ready && (
              <form
                onSubmit={(e) => {
                  e.preventDefault()
                  run(async () => {
                    const d = await transport('/settings', { settings })
                    setSettings(d.settings || settings)
                    setSettingsBaseline(JSON.stringify(d.settings || settings))
                    setNotice('Business details saved.')
                  })
                }}
                className="max-w-3xl space-y-5"
              >
                <Section
                  title="Your business"
                  hint="Shown on new invoices. Existing issued invoices keep their original details."
                >
                  <div className="grid gap-4 sm:grid-cols-2">
                    {(
                      [
                        ['business_name', 'Business name'],
                        ['legal_name', 'Legal / trading name'],
                      ] as [keyof BillingSettings, string][]
                    ).map(([key, label]) => (
                      <Field key={key} label={label}>
                        <input
                          className={input}
                          required
                          value={settings[key]}
                          onChange={(e) =>
                            setSettings({ ...settings, [key]: e.target.value })
                          }
                        />
                      </Field>
                    ))}
                  </div>
                  <Field label="Business address">
                    <textarea
                      className={input}
                      rows={3}
                      required
                      value={settings.address}
                      onChange={(e) =>
                        setSettings({ ...settings, address: e.target.value })
                      }
                    />
                  </Field>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Business email">
                      <input
                        type="email"
                        className={input}
                        required
                        value={settings.email}
                        onChange={(e) =>
                          setSettings({ ...settings, email: e.target.value })
                        }
                      />
                    </Field>
                    <Field label="Website" hint="For example, nfdr.uk">
                      <input
                        className={input}
                        inputMode="url"
                        value={settings.website}
                        onChange={(e) =>
                          setSettings({ ...settings, website: e.target.value })
                        }
                      />
                    </Field>
                  </div>
                  <Field label="Invoice footer">
                    <textarea
                      className={input}
                      rows={2}
                      value={settings.footer}
                      onChange={(e) =>
                        setSettings({ ...settings, footer: e.target.value })
                      }
                    />
                  </Field>
                </Section>
                <details className={card}>
                  <summary className="cursor-pointer font-bold">
                    Default bank account (optional)
                  </summary>
                  <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">
                    For bank invoices that use your business defaults. Emma’s
                    rent uses its own account, entered on her recurring invoice.
                  </p>
                  <div className="mt-5 grid gap-4 sm:grid-cols-2">
                    {(
                      [
                        ['bank_name', 'Bank / provider'],
                        ['account_name', 'Account name'],
                        ['sort_code', 'Sort code'],
                        ['account_number', 'Account number'],
                      ] as [keyof InvoiceBankAccount, string][]
                    ).map(([key, label]) => (
                      <Field key={key} label={label}>
                        <input
                          className={input}
                          value={settings[key]}
                          inputMode={
                            key === 'sort_code' || key === 'account_number'
                              ? 'numeric'
                              : 'text'
                          }
                          onChange={(e) =>
                            setSettings({ ...settings, [key]: e.target.value })
                          }
                        />
                      </Field>
                    ))}
                  </div>
                  <div className="mt-4">
                    <Field label="Default payment instructions">
                      <textarea
                        className={input}
                        rows={2}
                        value={settings.payment_instructions}
                        onChange={(e) =>
                          setSettings({
                            ...settings,
                            payment_instructions: e.target.value,
                          })
                        }
                      />
                    </Field>
                  </div>
                </details>
                <div className="sticky bottom-0 -mx-4 border-t border-slate-200 bg-white/95 p-4 sm:mx-0 sm:rounded-xl dark:border-slate-700 dark:bg-slate-900/95">
                  <button className={primary} disabled={busy} type="submit">
                    <Save size={17} />
                    {busy ? 'Saving…' : 'Save business details'}
                  </button>
                </div>
              </form>
            )}
            {tab === 'invoices' && !editing && (
              <section className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h2 className="text-lg font-bold">
                    All invoices{' '}
                    <span className="ml-2 text-sm font-normal text-slate-500">
                      {invoices.length}
                    </span>
                  </h2>
                  <div className="w-full sm:w-80">
                    <Field label="Search invoices">
                      <input
                        className={input}
                        placeholder="Customer, number or reference"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                      />
                    </Field>
                  </div>
                </div>
                {!filtered.length ? (
                  <div className={card + ' py-12 text-center'}>
                    <FileText
                      className="mx-auto mb-4 text-slate-400"
                      size={32}
                    />
                    <h3 className="text-lg font-bold">
                      {search
                        ? 'No matching invoices'
                        : 'Create your first invoice'}
                    </h3>
                    <p className="mx-auto mt-2 max-w-md text-sm text-slate-500 dark:text-slate-400">
                      Custom invoices appear here. For a repair, use Invoice on
                      its job page; customers can download their copy from
                      tracking.
                    </p>
                    {!search && (
                      <button
                        className={primary + ' mt-5'}
                        disabled={!ready}
                        onClick={() => create()}
                      >
                        New invoice
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800">
                    {filtered.map((i) => (
                      <button
                        key={i.id}
                        disabled={busy}
                        onClick={() => open(i)}
                        className="flex w-full flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-5 text-left last:border-0 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-700"
                      >
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <strong>{i.number || 'Draft invoice'}</strong>
                            <span
                              className={`rounded-full px-2 py-0.5 text-xs font-semibold ${i.status === 'draft' ? 'bg-amber-100 text-amber-900' : 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-200'}`}
                            >
                              {i.status === 'draft'
                                ? 'Draft'
                                : i.status === 'void'
                                  ? 'Voided'
                                  : 'Issued'}
                            </span>
                            {i.sent_at && (
                              <span className="text-xs text-emerald-700 dark:text-emerald-300">
                                Emailed
                              </span>
                            )}
                          </div>
                          <p className="mt-1">{i.payload.customer_name}</p>
                          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                            {i.payload.title} ·{' '}
                            {prettyDate(i.payload.issue_date)}
                          </p>
                          {i.email_error && (
                            <p className="mt-1 text-sm text-red-700 dark:text-red-300">
                              Email needs attention
                            </p>
                          )}
                        </div>
                        <strong className="text-lg tabular-nums">
                          {money(invoiceTotal(i.payload))}
                        </strong>
                      </button>
                    ))}
                  </div>
                )}
                {invoices.length === 200 && (
                  <p className="text-sm text-slate-500">
                    Showing the latest 200 invoices.
                  </p>
                )}
              </section>
            )}
            {tab === 'recurring' && !editing && (
              <section className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-bold">Monthly billing</h2>
                    <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                      Set up once, then create each month’s invoice
                      automatically.
                    </p>
                  </div>
                  <button
                    className={secondary}
                    disabled={busy || !ready}
                    onClick={() =>
                      run(async () => {
                        const d = await transport('/run', {})
                        await lists()
                        const failed = d.results.filter((r: any) => r.error)
                        if (failed.length)
                          throw Error(
                            failed.map((r: any) => r.error).join('; '),
                          )
                        setNotice(
                          'Due invoices created. Schedules set to automatic email have been sent.',
                        )
                      })
                    }
                  >
                    Create due invoices
                  </button>
                </div>
                {!series.length ? (
                  <div className={card + ' py-10 text-center'}>
                    <Repeat className="mx-auto mb-4 text-slate-400" size={32} />
                    <h3 className="font-bold">No monthly invoices yet</h3>
                    <p className="mt-2 text-sm text-slate-500">
                      Useful for rent, retainers and regular services.
                    </p>
                    <button
                      className={primary + ' mt-5'}
                      onClick={() => create(true)}
                    >
                      New monthly invoice
                    </button>
                  </div>
                ) : (
                  series.map((s) => (
                    <article
                      key={s.id}
                      className={
                        card +
                        ' flex flex-wrap items-center justify-between gap-5'
                      }
                    >
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-lg font-bold">{s.name}</h3>
                          <span
                            className={`rounded-full px-2 py-0.5 text-xs font-bold ${s.active ? 'bg-emerald-100 text-emerald-900' : 'bg-amber-100 text-amber-900'}`}
                          >
                            {s.active ? 'Active' : 'Paused'}
                          </span>
                        </div>
                        <p className="mt-1">
                          {s.template.customer_name} ·{' '}
                          <strong>{money(invoiceTotal(s.template))}</strong>{' '}
                          monthly
                        </p>
                        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                          Next invoice: {prettyDate(s.next_date)} ·{' '}
                          {s.auto_email
                            ? 'Email customer automatically'
                            : 'Create invoice only'}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button
                          className={secondary}
                          onClick={() => openSeries(s, true)}
                        >
                          <Eye size={16} />
                          Preview
                        </button>
                        <button
                          className={primary}
                          onClick={() => openSeries(s)}
                        >
                          Edit schedule
                        </button>
                      </div>
                    </article>
                  ))
                )}
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  Paused schedules do not create or send invoices. Active
                  schedules are checked each morning.
                </p>
              </section>
            )}
            {editing && tab !== 'settings' && (
              <section className="space-y-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <button
                      className="inline-flex items-center gap-2 text-sm font-semibold text-emerald-700 dark:text-emerald-300"
                      onClick={() => {
                        if (leave()) {
                          setEditing(false)
                          setError('')
                          setNotice('')
                        }
                      }}
                    >
                      <ArrowLeft size={16} />
                      Back to {schedule ? 'recurring invoices' : 'invoices'}
                    </button>
                    <h2 className="mt-2 text-2xl font-bold">
                      {schedule
                        ? schedule.name || 'New monthly invoice'
                        : selected?.number || 'Invoice draft'}
                    </h2>
                  </div>
                  {dirty && (
                    <span className="text-sm text-amber-700 dark:text-amber-300">
                      Unsaved changes
                    </span>
                  )}
                </div>
                {locked && (
                  <div
                    className={
                      card +
                      ' flex flex-wrap items-center justify-between gap-4'
                    }
                  >
                    <div>
                      <p className="font-semibold">
                        {selected!.status === 'void'
                          ? 'Voided invoice'
                          : 'Issued invoice'}
                      </p>
                      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                        {selected!.job_id
                          ? 'Payments are taken from the repair job.'
                          : 'Record payments received below.'}{' '}
                        Issued details are fixed.
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <a
                        className={secondary}
                        href={'/api/invoices/' + selected!.id + '?format=pdf'}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <Download size={16} />
                        Download PDF
                      </a>
                      {selected!.status === 'issued' && (
                        <button
                          className={primary}
                          disabled={busy}
                          onClick={send}
                        >
                          <Mail size={16} />
                          Email customer
                        </button>
                      )}
                    </div>
                  </div>
                )}
                {selected?.email_error && (
                  <p
                    role="alert"
                    className="rounded-lg bg-amber-50 p-4 text-sm text-amber-900"
                  >
                    Last email attempt: {selected.email_error}
                  </p>
                )}
                <div className="flex gap-2 xl:hidden">
                  {(['edit', 'preview'] as const).map((p) => (
                    <button
                      key={p}
                      className={pane === p ? primary : secondary}
                      onClick={() => setPane(p)}
                    >
                      {p === 'edit' ? 'Invoice details' : 'Email preview'}
                    </button>
                  ))}
                </div>
                <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                  <form
                    id="invoice-editor"
                    onSubmit={save}
                    className={
                      (pane === 'preview' ? 'hidden xl:block ' : '') +
                      'min-w-0 space-y-5'
                    }
                  >
                    {schedule && (
                      <Section
                        title="Schedule"
                        hint="Choose when this invoice repeats and whether it should be emailed."
                      >
                        <Field label="Schedule name">
                          <input
                            className={input}
                            value={schedule.name}
                            required
                            maxLength={300}
                            placeholder="For example, café rent"
                            onChange={(e) =>
                              setSchedule({ ...schedule, name: e.target.value })
                            }
                          />
                        </Field>
                        <div className="grid gap-4 sm:grid-cols-2">
                          <Field
                            label="Next invoice date"
                            hint={
                              'Repeats monthly on the ' +
                              ordinal(schedule.anchor_day) +
                              '.'
                            }
                          >
                            <input
                              type="date"
                              className={input}
                              required
                              value={schedule.next_date}
                              onChange={(e) =>
                                setSchedule({
                                  ...schedule,
                                  next_date: e.target.value,
                                  anchor_day: e.target.value
                                    ? Number(e.target.value.slice(-2))
                                    : schedule.anchor_day,
                                })
                              }
                            />
                          </Field>
                          <Field
                            label="Final day of service (optional)"
                            hint="A partial final month is prorated."
                          >
                            <input
                              type="date"
                              className={input}
                              value={schedule.ends_on}
                              min={
                                schedule.active ? schedule.next_date : undefined
                              }
                              onChange={(e) =>
                                setSchedule({
                                  ...schedule,
                                  ends_on: e.target.value,
                                })
                              }
                            />
                          </Field>
                        </div>
                        <Field label="Delivery">
                          <select
                            className={input}
                            value={schedule.auto_email ? 'email' : 'create'}
                            onChange={(e) =>
                              setSchedule({
                                ...schedule,
                                auto_email: e.target.value === 'email',
                              })
                            }
                          >
                            <option value="create">Create invoice only</option>
                            <option value="email">
                              Create and email the customer
                            </option>
                          </select>
                        </Field>
                        <label className="flex items-start gap-3 rounded-lg border border-slate-200 p-4 dark:border-slate-600">
                          <input
                            type="checkbox"
                            className="mt-0.5 h-5 w-5 shrink-0"
                            checked={schedule.active}
                            onChange={(e) =>
                              setSchedule({
                                ...schedule,
                                active: e.target.checked,
                              })
                            }
                          />
                          <span>
                            <strong className="block text-sm">
                              Automatic billing active
                            </strong>
                            <span className="mt-1 block text-sm text-slate-500 dark:text-slate-400">
                              {schedule.active
                                ? 'New invoices will be created when due.'
                                : 'Paused — no invoices will be created or sent.'}
                            </span>
                          </span>
                        </label>
                      </Section>
                    )}
                    <fieldset disabled={locked} className="min-w-0 space-y-5">
                      <legend className="sr-only">Invoice details</legend>
                      <Section title="Customer">
                        <Field label="Customer name">
                          <input
                            className={input}
                            required
                            maxLength={300}
                            value={form.customer_name}
                            onChange={(e) =>
                              set('customer_name', e.target.value)
                            }
                          />
                        </Field>
                        <div className="grid gap-4 sm:grid-cols-2">
                          <Field label="Email (optional)">
                            <input
                              type="email"
                              className={input}
                              maxLength={254}
                              value={form.customer_email}
                              onChange={(e) =>
                                set('customer_email', e.target.value)
                              }
                            />
                          </Field>
                          <Field label="Reference (optional)">
                            <input
                              className={input}
                              maxLength={200}
                              value={form.reference}
                              placeholder="Repair or payment reference"
                              onChange={(e) => set('reference', e.target.value)}
                            />
                          </Field>
                        </div>
                        <Field label="Address (optional)">
                          <textarea
                            className={input}
                            rows={3}
                            maxLength={1500}
                            value={form.customer_address}
                            onChange={(e) =>
                              set('customer_address', e.target.value)
                            }
                          />
                        </Field>
                      </Section>
                      <Section title="Invoice and items">
                        <Field label="Invoice title">
                          <input
                            className={input}
                            required
                            maxLength={200}
                            value={form.title}
                            onChange={(e) => set('title', e.target.value)}
                          />
                        </Field>
                        {!schedule && (
                          <div className="grid gap-4 sm:grid-cols-2">
                            <Field label="Invoice date">
                              <input
                                type="date"
                                className={input}
                                required
                                value={form.issue_date}
                                onChange={(e) =>
                                  set('issue_date', e.target.value)
                                }
                              />
                            </Field>
                            <Field label="Due date">
                              <input
                                type="date"
                                className={input}
                                required
                                min={form.issue_date}
                                value={form.due_date}
                                onChange={(e) =>
                                  set('due_date', e.target.value)
                                }
                              />
                            </Field>
                          </div>
                        )}
                        <div className="space-y-4">
                          {form.items.map((item, index) => (
                            <div
                              key={index}
                              className="space-y-3 rounded-lg border border-slate-200 p-4 dark:border-slate-600"
                            >
                              <Field
                                label={'Item ' + (index + 1) + ' description'}
                                hint={
                                  schedule
                                    ? 'Use {period} to insert the dates automatically.'
                                    : undefined
                                }
                              >
                                <textarea
                                  className={input}
                                  rows={2}
                                  required
                                  maxLength={3000}
                                  value={item.description}
                                  onChange={(e) =>
                                    set(
                                      'items',
                                      form.items.map((i, n) =>
                                        n === index
                                          ? {
                                              ...i,
                                              description: e.target.value,
                                            }
                                          : i,
                                      ),
                                    )
                                  }
                                />
                              </Field>
                              <div className="grid grid-cols-2 gap-3">
                                <Field label="Quantity">
                                  <input
                                    className={input}
                                    inputMode="decimal"
                                    required
                                    value={item.quantity}
                                    onChange={(e) =>
                                      set(
                                        'items',
                                        form.items.map((i, n) =>
                                          n === index
                                            ? { ...i, quantity: e.target.value }
                                            : i,
                                        ),
                                      )
                                    }
                                  />
                                </Field>
                                <Field label="Unit price (£)">
                                  <input
                                    className={input}
                                    inputMode="decimal"
                                    required
                                    placeholder="0.00"
                                    value={item.unit_price}
                                    onChange={(e) =>
                                      set(
                                        'items',
                                        form.items.map((i, n) =>
                                          n === index
                                            ? {
                                                ...i,
                                                unit_price: e.target.value,
                                              }
                                            : i,
                                        ),
                                      )
                                    }
                                  />
                                </Field>
                              </div>
                              <div className="flex justify-between gap-3">
                                <span className="text-sm text-slate-500 dark:text-slate-400">
                                  {(() => {
                                    try {
                                      return money(
                                        Math.round(
                                          Number(item.quantity) *
                                            poundsToPence(item.unit_price),
                                        ),
                                      )
                                    } catch {
                                      return 'Enter quantity and price'
                                    }
                                  })()}
                                </span>
                                {!locked && form.items.length > 1 && (
                                  <button
                                    type="button"
                                    className="text-sm font-semibold text-red-700 dark:text-red-300"
                                    onClick={() =>
                                      set(
                                        'items',
                                        form.items.filter(
                                          (_, n) => n !== index,
                                        ),
                                      )
                                    }
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
                            className={secondary}
                            type="button"
                            onClick={() =>
                              set('items', [
                                ...form.items,
                                {
                                  description: '',
                                  quantity: '1',
                                  unit_price: '',
                                },
                              ])
                            }
                          >
                            <Plus size={16} />
                            Add item
                          </button>
                        )}
                        <div className="flex items-center justify-between border-t border-slate-200 pt-4 dark:border-slate-600">
                          <span className="font-semibold">
                            {schedule ? 'Monthly total' : 'Total'}
                          </span>
                          <strong className="text-2xl tabular-nums">
                            {(() => {
                              try {
                                return money(invoiceTotal(currentPayload()))
                              } catch {
                                return '—'
                              }
                            })()}
                          </strong>
                        </div>
                      </Section>
                      <Section
                        title="Payment"
                        hint="Choose the instructions shown to the customer."
                      >
                        <Field label="Payment method">
                          <select
                            className={input}
                            value={form.payment_method}
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
                        {form.payment_method === 'bank_transfer' && (
                          <>
                            <Field label="Bank account">
                              <select
                                className={input}
                                value={
                                  form.bank_account ? 'separate' : 'default'
                                }
                                onChange={(e) =>
                                  set(
                                    'bank_account',
                                    e.target.value === 'separate'
                                      ? { ...EMPTY_INVOICE_BANK }
                                      : undefined,
                                  )
                                }
                              >
                                <option value="default">
                                  Business default account
                                </option>
                                <option value="separate">
                                  Separate account for this invoice / schedule
                                </option>
                              </select>
                            </Field>
                            {form.bank_account ? (
                              <>
                                <p className="text-sm text-slate-500 dark:text-slate-400">
                                  Used only for this invoice or recurring
                                  schedule.
                                </p>
                                <div className="grid gap-4 sm:grid-cols-2">
                                  {(
                                    [
                                      ['bank_name', 'Bank / provider'],
                                      ['account_name', 'Account name'],
                                      ['sort_code', 'Sort code'],
                                      ['account_number', 'Account number'],
                                    ] as [keyof InvoiceBankAccount, string][]
                                  ).map(([key, label]) => (
                                    <Field key={key} label={label}>
                                      <input
                                        className={input}
                                        maxLength={200}
                                        value={form.bank_account![key]}
                                        inputMode={
                                          key === 'sort_code' ||
                                          key === 'account_number'
                                            ? 'numeric'
                                            : 'text'
                                        }
                                        onChange={(e) =>
                                          set('bank_account', {
                                            ...form.bank_account!,
                                            [key]: e.target.value,
                                          })
                                        }
                                      />
                                    </Field>
                                  ))}
                                </div>
                              </>
                            ) : (
                              <p className="text-sm text-slate-500 dark:text-slate-400">
                                Uses the default account in Business details.
                                Choose a separate account for rent or another
                                purpose.
                              </p>
                            )}
                          </>
                        )}
                        <Field label="Payment instructions (optional)">
                          <textarea
                            className={input}
                            rows={3}
                            maxLength={3000}
                            placeholder="For example, payable monthly in advance on the 23rd."
                            value={form.payment_instructions}
                            onChange={(e) =>
                              set('payment_instructions', e.target.value)
                            }
                          />
                        </Field>
                        <Field label="Notes (optional)">
                          <textarea
                            className={input}
                            rows={3}
                            maxLength={6000}
                            value={form.notes}
                            onChange={(e) => set('notes', e.target.value)}
                          />
                        </Field>
                      </Section>
                    </fieldset>
                    {!locked && (
                      <div className="sticky bottom-0 z-20 -mx-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-white/95 p-4 backdrop-blur-sm sm:mx-0 sm:rounded-xl dark:border-slate-700 dark:bg-slate-900/95">
                        <span className="text-sm text-slate-500">
                          {dirty ? 'Unsaved changes' : 'Saved'}
                        </span>
                        <div className="flex flex-wrap gap-2">
                          <button
                            className={schedule ? primary : secondary}
                            type="submit"
                            value="draft"
                            disabled={busy}
                          >
                            <Save size={16} />
                            {busy
                              ? 'Saving…'
                              : schedule
                                ? 'Save schedule'
                                : 'Save draft'}
                          </button>
                          {!schedule && (
                            <button
                              className={primary}
                              type="submit"
                              value="issue"
                              disabled={busy}
                            >
                              Issue invoice
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                    {selected?.status === 'issued' &&
                      !selected.job_id &&
                      !schedule && (
                        <Section title="Payment received">
                          <Field label="Total received (£)">
                            <input
                              className={input}
                              inputMode="decimal"
                              value={payment}
                              onChange={(e) => setPayment(e.target.value)}
                            />
                          </Field>
                          <button
                            type="button"
                            className={secondary}
                            disabled={busy}
                            onClick={() =>
                              run(async () => {
                                const paid_pence = poundsToPence(payment)
                                await transport('/' + selected.id, {
                                  action: 'payment',
                                  paid_pence,
                                })
                                const d = await transport('/' + selected.id)
                                setSelected(d.invoice)
                                await lists()
                                setNotice('Payment recorded.')
                              })
                            }
                          >
                            Record payment
                          </button>
                        </Section>
                      )}
                    {selected && !schedule && selected.status !== 'void' && (
                      <details className="px-1">
                        <summary className="cursor-pointer text-sm text-slate-500">
                          Other actions
                        </summary>
                        <button
                          type="button"
                          className="mt-3 text-sm font-semibold text-red-700"
                          disabled={busy}
                          onClick={() => {
                            if (
                              window.confirm(
                                selected.status === 'draft'
                                  ? 'Delete this draft?'
                                  : 'Void this invoice? The original stays on record.',
                              )
                            )
                              run(async () => {
                                if (selected.status === 'draft') {
                                  await transport(
                                    '/' + selected.id,
                                    {},
                                    'DELETE',
                                  )
                                  setEditing(false)
                                } else {
                                  await transport('/' + selected.id, {
                                    action: 'void',
                                  })
                                  setSelected({ ...selected, status: 'void' })
                                }
                                await lists()
                                setNotice(
                                  selected.status === 'draft'
                                    ? 'Draft deleted.'
                                    : 'Invoice voided.',
                                )
                              })
                          }}
                        >
                          {selected.status === 'draft'
                            ? 'Delete draft'
                            : 'Void invoice'}
                        </button>
                      </details>
                    )}
                  </form>
                  <aside
                    className={
                      (pane === 'edit' ? 'hidden xl:block ' : '') +
                      'min-w-0 space-y-3 xl:sticky xl:top-4'
                    }
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <h2 className="font-bold">Email preview</h2>
                      <div
                        className="inline-flex rounded-lg border border-slate-300 p-1 dark:border-slate-600"
                        aria-label="Preview colour scheme"
                      >
                        {(['light', 'dark'] as const).map((t) => (
                          <button
                            key={t}
                            className={
                              'rounded-md px-3 py-1.5 text-sm ' +
                              (theme === t
                                ? 'bg-slate-800 font-bold text-white dark:bg-slate-200 dark:text-slate-900'
                                : 'text-slate-500 dark:text-slate-300')
                            }
                            aria-pressed={theme === t}
                            onClick={() => setTheme(t)}
                          >
                            {t === 'light' ? 'Light' : 'Dark'}
                          </button>
                        ))}
                      </div>
                    </div>
                    {preview ? (
                      <iframe
                        title="Invoice email preview"
                        sandbox=""
                        className="h-[800px] w-full rounded-xl border border-slate-200 bg-white dark:border-slate-700"
                        srcDoc={invoiceHtml(preview, undefined, { theme })}
                      />
                    ) : (
                      <div className={card + ' py-12 text-center'}>
                        <Eye
                          className="mx-auto mb-4 text-slate-400"
                          size={28}
                        />
                        <p className="font-semibold">
                          Complete the invoice details to preview
                        </p>
                        <p className="mt-2 text-sm text-slate-500">
                          {previewError}
                        </p>
                      </div>
                    )}
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        className={secondary}
                        disabled={busy || !preview}
                        onClick={() => previewAction('pdf')}
                      >
                        <Download size={16} />
                        Preview PDF
                      </button>
                      <button
                        type="button"
                        className={secondary}
                        disabled={busy || !preview}
                        onClick={() => previewAction('email')}
                      >
                        <Mail size={16} />
                        Email preview to me
                      </button>
                    </div>
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                      Preview emails go to your signed-in staff email address.
                    </p>
                  </aside>
                </div>
              </section>
            )}
          </>
        )}
      </main>
    </div>
  )
}
