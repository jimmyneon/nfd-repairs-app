'use client'

import { useEffect, useState } from 'react'
import { PoundSterling, RotateCcw, AlertTriangle, Package, Truck, ExternalLink } from 'lucide-react'

type BookingInfo = {
  reference: string
  model: string
  shipping: string
  return_service: string
  name: string
  phone: string | null
  email: string
  address: string | null
  town: string | null
  postcode: string | null
  total_pence: number
  paid_pence: number
  refundable_pence: number
  cancelled: boolean
  dispatched_at: string | null
  testing_completed_at: string | null
  carrier: string | null
  carrier_tracking: string | null
  carrier_url: string | null
  label_sent: boolean
  inbound_service_name: string | null
  return_service_name: string | null
  early_start: boolean
  cancellation_ends: string
  tracking_url: string | null
  shipments: Shipment[]
}

type Shipment = {
  direction: 'inbound' | 'return'
  courier: string
  service_name: string
  status: string
  tracking_number: string | null
  tracking_url: string | null
  label_ref: string | null
  label_url: string | null
  collection_date: string | null
  compensation_pence: number
  upgrade_pence: number
  cost_pence: number | null
  error: string | null
}

const SHIPPING_LABELS: Record<string, string> = {
  label: 'We emailed a tracked label',
  label_special: 'We emailed a Special Delivery label',
  self: 'Customer posts it themselves',
}
const RETURN_LABELS: Record<string, string> = {
  t48: 'Royal Mail Tracked 48',
  t24: 'Royal Mail Tracked 24',
  sd750: 'Special Delivery (£750 cover)',
  sd1000: 'Special Delivery (£1,000 cover)',
}
const MODEL_LABELS: Record<string, string> = {
  original: 'PS5', slim: 'PS5 Slim', pro: 'PS5 Pro', unsure: 'PS5 (model unsure)',
}

// Shown on job pages for HDMI-site (ps5hdmirepair.co.uk) postal bookings.
// Displays the postal info staff need (return address, postage choices,
// dispatch tracking) plus the refund controls — refunds go through the
// hdmi-refund edge function and the customer is emailed by the webhook.
export default function HdmiPostalPanel({ jobId }: { jobId: string }) {
  const [info, setInfo] = useState<BookingInfo | null>(null)
  const [missing, setMissing] = useState(false)
  const [amount, setAmount] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [dispatching, setDispatching] = useState(false)
  const [manual, setManual] = useState<{ carrier: string; tracking: string; url: string } | null>(null)

  const gbp = (pence: number) => `£${(pence / 100).toFixed(2)}`

  const load = async () => {
    try {
      const res = await fetch(`/api/jobs/${jobId}/hdmi-refund`)
      if (res.status === 404) { setMissing(true); return }
      const data = await res.json()
      if (res.ok) {
        setInfo(data)
        setAmount(gbp(data.refundable_pence).replace('£', ''))
      }
    } catch { /* panel stays hidden on error */ }
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load() }, [jobId])

  if (missing || !info) return null

  const issue = async () => {
    setBusy(true); setMessage(null)
    try {
      const parsed = Math.round(parseFloat(amount || '0') * 100)
      const res = await fetch(`/api/jobs/${jobId}/hdmi-refund`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsed > 0 ? { amount_pence: parsed } : {}),
      })
      const data = await res.json()
      if (res.ok) {
        setMessage({ ok: true, text: `Refunded ${gbp(data.refunded_pence)} — customer is being emailed.` })
        await load()
      } else {
        setMessage({ ok: false, text: data.error || 'Refund failed' })
      }
    } catch {
      setMessage({ ok: false, text: 'Refund failed — check Stripe' })
    }
    setBusy(false); setConfirming(false)
  }

  const dispatch = async () => {
    setDispatching(true); setMessage(null)
    try {
      const res = await fetch(`/api/jobs/${jobId}/hdmi-dispatch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(manual && manual.carrier && manual.tracking && manual.url ? manual : {}),
      })
      const data = await res.json()
      if (res.ok) {
        setMessage({ ok: true, text: `Return booked — ${data.carrier || 'courier'} ${data.tracking || ''}. Customer is being emailed.` })
        setManual(null)
        await load()
      } else {
        setMessage({ ok: false, text: data.error || 'Dispatch failed' })
      }
    } catch {
      setMessage({ ok: false, text: 'Dispatch failed — check the connection' })
    }
    setDispatching(false)
  }

  const balanceDue = Math.max(0, info.total_pence - info.paid_pence)
  const canDispatch = !info.cancelled && !info.dispatched_at && !!info.testing_completed_at && balanceDue === 0
  const waitingUntil = !info.early_start && new Date(info.cancellation_ends) > new Date() ? new Date(info.cancellation_ends) : null

  const row = (label: string, value: string | null | undefined) =>
    value ? (
      <div className="flex justify-between gap-3 text-sm">
        <span className="text-gray-500 dark:text-gray-400 flex-shrink-0">{label}</span>
        <span className="font-semibold text-gray-900 dark:text-gray-100 text-right">{value}</span>
      </div>
    ) : null

  return (
    <div className="w-full bg-blue-50 dark:bg-blue-950/30 rounded-2xl p-4 border-2 border-blue-200 dark:border-blue-800 space-y-3">
      <div className="flex items-center justify-center gap-2">
        <Package className="h-4 w-4 text-blue-600 dark:text-blue-400" />
        <h3 className="text-sm font-black text-blue-800 dark:text-blue-300 uppercase tracking-wide">
          Postal HDMI repair · {info.reference}
        </h3>
      </div>
      {info.cancelled && (
        <p className="text-center text-xs font-bold text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/30 rounded-lg py-1.5">
          CANCELLED — fully refunded
        </p>
      )}

      <div className="space-y-1">
        {row('Console', MODEL_LABELS[info.model] || 'PS5')}
        {row('Inbound', `${info.inbound_service_name || SHIPPING_LABELS[info.shipping] || info.shipping}${info.inbound_service_name !== 'Customer posts it themselves' && info.shipping !== 'self' ? (info.label_sent ? ' — booked' : ' — not booked yet') : ''}`)}
        {row('Return', info.return_service_name || RETURN_LABELS[info.return_service] || info.return_service)}
        {row('Paid', `${gbp(info.paid_pence)} of ${gbp(info.total_pence)}`)}
        {row('Start', info.early_start ? 'Customer asked for repair on arrival' : waitingUntil ? `Wait until ${waitingUntil.toLocaleDateString('en-GB')} (cancellation period)` : 'Cancellation period over — OK to repair')}
        {row('Testing done', info.testing_completed_at ? new Date(info.testing_completed_at).toLocaleDateString('en-GB') : null)}
        {info.dispatched_at && info.carrier && row('Dispatched', `${info.carrier} · ${info.carrier_tracking}`)}
      </div>

      {info.carrier_url && (
        <a href={info.carrier_url} target="_blank" rel="noreferrer" className="flex items-center justify-center gap-1.5 text-xs font-bold text-blue-700 dark:text-blue-300 hover:underline">
          <Truck className="h-3.5 w-3.5" /> Carrier tracking
        </a>
      )}

      {/* Return address — where the console goes back to */}
      <div className="bg-white dark:bg-gray-900 rounded-xl p-3 space-y-1">
        <p className="text-[10px] font-black uppercase tracking-wide text-gray-400">Return address</p>
        <p className="text-sm font-bold text-gray-900 dark:text-gray-100">{info.name}</p>
        {info.address && <p className="text-sm text-gray-700 dark:text-gray-300">{info.address}</p>}
        <p className="text-sm text-gray-700 dark:text-gray-300">{[info.town, info.postcode].filter(Boolean).join(', ')}</p>
        <div className="pt-1 space-y-0.5">
          {info.phone && <p className="text-xs text-gray-500 dark:text-gray-400">{info.phone}</p>}
          <p className="text-xs text-gray-500 dark:text-gray-400">{info.email}</p>
        </div>
      </div>

      {/* Courier shipments — inbound + return journeys */}
      {(info.shipments || []).length > 0 && (
        <div className="space-y-1.5">
          {info.shipments.map((s) => (
            <div key={s.direction} className="bg-white dark:bg-gray-900 rounded-xl p-3 space-y-1">
              <p className="text-[10px] font-black uppercase tracking-wide text-gray-400">
                {s.direction === 'inbound' ? 'To workshop' : 'Return to customer'}
              </p>
              <div className="flex justify-between gap-2 text-sm">
                <span className="font-semibold text-gray-900 dark:text-gray-100">{s.service_name || s.courier}</span>
                <span className={`text-xs font-bold ${s.error ? 'text-red-600' : s.status === 'delivered' ? 'text-green-600' : 'text-blue-600 dark:text-blue-400'}`}>
                  {s.error ? 'ERROR' : s.status.replace(/_/g, ' ')}
                </span>
              </div>
              {s.tracking_number && (
                <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{s.tracking_number}</p>
              )}
              {s.collection_date && (
                <p className="text-xs text-gray-500 dark:text-gray-400">Collection: {s.collection_date}</p>
              )}
              <div className="flex gap-3">
                {s.tracking_url && (
                  <a href={s.tracking_url} target="_blank" rel="noreferrer" className="text-xs font-bold text-blue-700 dark:text-blue-300 hover:underline">Track</a>
                )}
                {s.label_url && (
                  <a href={s.label_url} target="_blank" rel="noreferrer" className="text-xs font-bold text-blue-700 dark:text-blue-300 hover:underline">Label</a>
                )}
              </div>
              {s.error && <p className="text-xs text-red-600">{s.error}</p>}
            </div>
          ))}
        </div>
      )}

      {info.tracking_url && (
        <a href={info.tracking_url} target="_blank" rel="noreferrer" className="flex items-center justify-center gap-1.5 text-xs font-bold text-blue-700 dark:text-blue-300 hover:underline">
          <ExternalLink className="h-3.5 w-3.5" /> Customer tracking page
        </a>
      )}

      {/* What's next */}
      {!info.cancelled && !info.dispatched_at && (
        <div className={`rounded-xl p-3 text-sm font-semibold ${balanceDue > 0 && info.testing_completed_at ? 'bg-amber-100 text-amber-900 dark:bg-amber-900/30 dark:text-amber-200' : 'bg-white text-gray-800 dark:bg-gray-900 dark:text-gray-200'}`}>
          {!info.testing_completed_at
            ? 'When the repair is tested, set the job to Ready — the customer is emailed to pay any balance.'
            : balanceDue > 0
              ? `Waiting for the customer to pay ${gbp(balanceDue)} — they have the link. Do not post until it clears.`
              : 'Paid in full and tested — book the return below.'}
        </div>
      )}

      {canDispatch && (
        <div className="space-y-2">
          <button
            onClick={dispatch}
            disabled={dispatching}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-xl text-sm flex items-center justify-center space-x-2 disabled:opacity-50"
          >
            <Truck className="h-4 w-4" />
            <span>{dispatching ? 'Booking return…' : `Book return — ${info.return_service_name || 'chosen courier'}`}</span>
          </button>
          {manual ? (
            <div className="space-y-2 bg-white dark:bg-gray-900 rounded-xl p-3">
              {(['carrier', 'tracking', 'url'] as const).map((k) => (
                <input key={k} value={manual[k]} onChange={(e) => setManual({ ...manual, [k]: e.target.value })} placeholder={k === 'carrier' ? 'Carrier (e.g. Royal Mail)' : k === 'tracking' ? 'Tracking number' : 'https:// tracking link'} className="w-full px-3 py-2 rounded-lg border-2 border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-900 text-sm" />
              ))}
              <div className="flex space-x-2">
                <button onClick={dispatch} disabled={dispatching || !manual.carrier || !manual.tracking || !manual.url.startsWith('https://')} className="flex-1 bg-gray-900 text-white font-bold py-2 rounded-lg text-sm disabled:opacity-50">Record manual dispatch</button>
                <button onClick={() => setManual(null)} className="px-3 py-2 rounded-lg text-sm font-bold bg-gray-200 dark:bg-gray-700">Cancel</button>
              </div>
            </div>
          ) : (
            <button onClick={() => setManual({ carrier: '', tracking: '', url: '' })} className="w-full text-xs font-bold text-blue-700 dark:text-blue-300 hover:underline">
              Posted it another way? Enter tracking manually
            </button>
          )}
        </div>
      )}

      {/* Refund controls */}
      <div className="pt-2 border-t-2 border-blue-200 dark:border-blue-800 space-y-3">
        <div className="flex justify-between text-sm">
          <span className="text-gray-500 dark:text-gray-400">Refundable</span>
          <span className="font-bold text-gray-900 dark:text-gray-100">{gbp(info.refundable_pence)}</span>
        </div>

        {info.refundable_pence > 0 ? (
          <>
            <div className="flex items-center space-x-2">
              <div className="relative flex-1">
                <PoundSterling className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  max={(info.refundable_pence / 100).toFixed(2)}
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-full pl-9 pr-3 py-2.5 rounded-xl border-2 border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 font-bold text-sm"
                  placeholder="Amount"
                />
              </div>
              <button
                onClick={() => setAmount((info.refundable_pence / 100).toFixed(2))}
                className="text-xs font-bold text-primary hover:underline whitespace-nowrap"
                type="button"
              >
                Full refund
              </button>
            </div>

            {confirming ? (
              <div className="space-y-2">
                <div className="flex items-start space-x-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-3">
                  <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 flex-shrink-0" />
                  <p className="text-xs text-amber-800 dark:text-amber-200">
                    Refund <b>£{amount}</b> to the customer&apos;s card? This cannot be undone.
                  </p>
                </div>
                <div className="flex space-x-2">
                  <button
                    onClick={issue}
                    disabled={busy}
                    className="flex-1 bg-red-600 hover:bg-red-700 text-white font-bold py-2.5 rounded-xl text-sm disabled:opacity-50"
                  >
                    {busy ? 'Refunding…' : 'Confirm refund'}
                  </button>
                  <button
                    onClick={() => setConfirming(false)}
                    className="px-4 py-2.5 rounded-xl text-sm font-bold text-gray-600 dark:text-gray-300 bg-gray-200 dark:bg-gray-700"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setConfirming(true)}
                disabled={busy}
                className="w-full bg-gray-900 hover:bg-black dark:bg-gray-700 dark:hover:bg-gray-600 text-white font-bold py-2.5 rounded-xl text-sm flex items-center justify-center space-x-2 disabled:opacity-50"
              >
                <RotateCcw className="h-4 w-4" />
                <span>Issue refund</span>
              </button>
            )}
          </>
        ) : (
          <p className="text-xs text-center text-gray-500 dark:text-gray-400">
            {info.cancelled ? 'Fully refunded — booking cancelled' : 'Nothing to refund yet'}
          </p>
        )}
      </div>

      {message && (
        <p className={`text-xs text-center font-semibold ${message.ok ? 'text-green-600' : 'text-red-600'}`}>
          {message.text}
        </p>
      )}
    </div>
  )
}
