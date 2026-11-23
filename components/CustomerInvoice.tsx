'use client'
import { useEffect, useState } from 'react'
import { Invoice, invoiceTotal, money } from '@/lib/invoices'
export default function CustomerInvoice({ token }: { token: string }) {
  const [invoice, setInvoice] = useState<Invoice | null>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false)
  const endpoint = `/api/tracking/${encodeURIComponent(token)}/invoice`
  useEffect(() => {
    let live = true
    fetch(endpoint, { cache: 'no-store' })
      .then(async (r) => {
        if (!r.ok)
          throw Error(
            'Your invoice could not be loaded. Please refresh or contact us for a copy.',
          )
        return r.json()
      })
      .then((d) => {
        if (live) setInvoice(d.invoice)
      })
      .catch((e) => {
        if (live) setError(e.message)
      })
    return () => {
      live = false
    }
  }, [endpoint])
  async function download() {
    setBusy(true)
    try {
      const r = await fetch(`${endpoint}?format=pdf`, { cache: 'no-store' })
      if (!r.ok || !r.headers.get('Content-Type')?.includes('application/pdf'))
        throw Error(
          'Download failed. Please try again or contact us for a copy.',
        )
      const url = URL.createObjectURL(await r.blob()),
        a = document.createElement('a')
      a.href = url
      a.download = `${invoice?.number || 'NFDR-invoice'}.pdf`
      a.click()
      setTimeout(() => URL.revokeObjectURL(url), 60000)
      setError('')
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  if (!invoice && !error) return null
  return (
    <section
      className="rounded-2xl bg-white dark:bg-gray-800 border border-primary/30 p-5 space-y-3"
      aria-label="Your invoice"
    >
      <h2 className="text-xl font-bold text-primary">Your invoice</h2>
      {error && (
        <p role="alert" className="text-red-700 dark:text-red-300">
          {error}
        </p>
      )}
      {invoice && (
        <>
          <p>
            {invoice.number} · {money(invoiceTotal(invoice.payload))} ·{' '}
            {invoice.status === 'void'
              ? 'Voided'
              : invoiceTotal(invoice.payload) <= invoice.paid_pence
                ? 'Paid in full'
                : `${money(invoiceTotal(invoice.payload) - invoice.paid_pence)} due`}
          </p>
          <button
            onClick={download}
            disabled={busy}
            className="rounded-xl bg-primary text-white font-bold px-5 py-3 disabled:opacity-50"
          >
            {busy ? 'Preparing PDF…' : 'Download PDF invoice'}
          </button>
          <p className="text-sm text-gray-600 dark:text-gray-300">
            Your invoice remains available here after collection.
          </p>
        </>
      )}
    </section>
  )
}
