'use client'

import { useState, useEffect, Suspense } from 'react'
import { useParams, useSearchParams, useRouter } from 'next/navigation'
import { Loader2, CheckCircle, XCircle, AlertCircle, Smartphone, Package, Plus, CalendarDays } from 'lucide-react'
import { normalizePublicQuoteRef } from '@/lib/public-quote-options'

interface AddOnRepair {
  repair: string
  displayName: string
  originalPrice: number
  discountPrice: number
  hasDiscount: boolean
  saving: number
}

function QuoteApprovalContent() {
  const searchParams = useSearchParams()
  const routeParams = useParams<{ jobId: string }>()
  const router = useRouter()
  const routeJobId = Array.isArray(routeParams?.jobId) ? routeParams.jobId[0] : routeParams?.jobId
  const rawJobId = searchParams.get('jobId') || routeJobId
  const jobId = normalizePublicQuoteRef(rawJobId)
  const quoteToken = searchParams.get('t')
  const requestedAddOn = searchParams.get('add')
  const [loading, setLoading] = useState(true)
  const [approving, setApproving] = useState(false)
  const [rejecting, setRejecting] = useState(false)
  const [job, setJob] = useState<any>(null)
  const [error, setError] = useState('')
  const [addOns, setAddOns] = useState<AddOnRepair[]>([])
  const [selectedAddOns, setSelectedAddOns] = useState<Set<string>>(new Set())
  const [selectedAccessories, setSelectedAccessories] = useState<Set<string>>(new Set())
  const [savedMessage, setSavedMessage] = useState('')

  useEffect(() => {
    if (jobId) {
      const url = `/api/public/quote/${jobId}${quoteToken ? `?t=${encodeURIComponent(quoteToken)}` : ''}`
      fetch(url)
        .then(res => res.json())
        .then(data => {
          if (data.error) { setError(data.error); setLoading(false) }
          else { setJob(data); setLoading(false) }
        })
        .catch(() => { setLoading(false); setError('Failed to load quote') })
    }
  }, [jobId, quoteToken])

  // Fetch add-on repairs from catalogue once job is loaded
  useEffect(() => {
    if (!job || !job.device_category || !job.device_make || !job.device_model) return

    const existingRepairs = new Set<string>([job.issue?.toLowerCase()].filter(Boolean) as string[])
    if (job.additional_repairs) {
      job.additional_repairs.forEach((r: any) => existingRepairs.add((r.repair || '').toLowerCase()))
    }

    fetch('https://newforestdevicerepairs.co.uk/data/quote-catalogue.json')
      .then(res => res.json())
      .then(catalogue => {
        const quotes = catalogue.quotes || []
        const matching = quotes.filter((q: any) =>
          q.category === job.device_category &&
          q.brand === job.device_make &&
          q.model === job.device_model &&
          q.priceType === 'fixed' &&
          q.customerPriceGbp !== null &&
          q.enabled !== false
        )

        const byRepair: Record<string, any[]> = {}
        matching.forEach((q: any) => {
          if (!byRepair[q.repair]) byRepair[q.repair] = []
          byRepair[q.repair].push(q)
        })

        const SCREEN_KEYWORDS = ['screen', 'display', 'lcd', 'oled', 'digitiser', 'digitizer', 'touch-glass', 'touch glass', 'touchscreen', 'inner screen', 'outer screen']
        const isScreen = (r: string) => SCREEN_KEYWORDS.some(kw => r.toLowerCase().includes(kw))

        const result: AddOnRepair[] = []
        Object.keys(byRepair).forEach(repair => {
          if (existingRepairs.has(repair.toLowerCase())) return
          const opts = byRepair[repair]
          const minPrice = Math.min(...opts.map((o: any) => o.customerPriceGbp))
          const screen = isScreen(repair)
          const discountPrice = screen ? minPrice : Math.round(minPrice * 0.75)
          const displayName = repair.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
          result.push({ repair, displayName, originalPrice: minPrice, discountPrice, hasDiscount: !screen, saving: minPrice - discountPrice })
        })

        result.sort((a, b) => {
          if (a.hasDiscount !== b.hasDiscount) return a.hasDiscount ? -1 : 1
          return a.discountPrice - b.discountPrice
        })

        setAddOns(result)
        if (requestedAddOn && result.some(item => item.repair === requestedAddOn)) {
          setSelectedAddOns(prev => new Set([...prev, requestedAddOn]))
        }
      })
      .catch(() => {})
  }, [job, requestedAddOn])

  const toggleAddOn = (repair: string) => {
    setSelectedAddOns(prev => {
      const next = new Set(prev)
      if (next.has(repair)) next.delete(repair)
      else next.add(repair)
      return next
    })
  }

  const selectedAddOnList = addOns.filter(a => selectedAddOns.has(a.repair))
  const addOnTotal = selectedAddOnList.reduce((s, a) => s + a.discountPrice, 0)

  const existingRepairs = Array.isArray(job?.additional_repairs) ? job.additional_repairs : []
  const existingAccessories = Array.isArray(job?.accessories) ? job.accessories : []
  const existingRepairTotal = existingRepairs.reduce((sum: number, item: any) => sum + Number(item?.price || 0), 0)
  const existingAccessoryTotal = existingAccessories.reduce((sum: number, item: any) => sum + Number(item?.price || 0), 0)
  const rawPriceTotal = Number(job?.price_total || 0)
  const basePrice = job?.quoted_price != null
    ? Number(job.quoted_price)
    : Math.max(0, rawPriceTotal - existingRepairTotal - existingAccessoryTotal)

  const screenRepair = /screen|display|lcd|oled|digitis|digitiz|touch/i.test(String(job?.issue || ''))
  const isIPhone = String(job?.device_make || '').toLowerCase() === 'apple' && String(job?.device_category || '').toLowerCase() === 'phone'
  const accessoryChoices = [
    ...(screenRepair ? [{ name: 'Free battery health check', price: 0 }] : []),
    ...(screenRepair && isIPhone ? [{ name: 'Tempered glass screen protector', price: 15 }] : []),
  ]
  const existingAccessoryNames = new Set(existingAccessories.map((item: any) => String(item?.name || '')))
  const selectedAccessoryList = accessoryChoices.filter(item => selectedAccessories.has(item.name))
  const selectedAccessoryTotal = selectedAccessoryList.reduce((sum, item) => sum + item.price, 0)
  const currentTotal = basePrice + existingRepairTotal + existingAccessoryTotal
  const totalPrice = currentTotal + addOnTotal + selectedAccessoryTotal

  const acceptedStatuses = new Set(['approved', 'converted', 'QUOTE_APPROVED', 'AWAITING_DEVICE', 'AWAITING_DEPOSIT', 'PARTS_ORDERED', 'PARTS_ARRIVED', 'RECEIVED'])
  const alreadyAccepted = acceptedStatuses.has(String(job?.status || ''))

  const preferredDropoffLabel = (() => {
    if (!job) return null
    if (job.dropoff_date) {
      const date = new Date(`${job.dropoff_date}T12:00:00Z`)
      if (!Number.isNaN(date.getTime())) {
        return date.toLocaleDateString('en-GB', {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
          timeZone: 'Europe/London',
        })
      }
    }

    if ((job.dropoff_preference === 'today' || job.dropoff_preference === 'tomorrow') && job.created_at) {
      const date = new Date(job.created_at)
      if (!Number.isNaN(date.getTime())) {
        if (job.dropoff_preference === 'tomorrow') date.setUTCDate(date.getUTCDate() + 1)
        return date.toLocaleDateString('en-GB', {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
          timeZone: 'Europe/London',
        })
      }
    }

    return null
  })()

  const saveSelectedOptions = async () => {
    if (!jobId || !quoteToken) throw new Error('Secure quote token missing')
    if (selectedAddOnList.length === 0 && selectedAccessoryList.length === 0) return null

    const response = await fetch(`/api/public/quote/${jobId}/options?t=${encodeURIComponent(quoteToken)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        additional_repairs: selectedAddOnList.map(item => ({ repair: item.repair })),
        accessories: selectedAccessoryList.map(item => ({ name: item.name })),
      }),
    })
    if (!response.ok) throw new Error('Failed to save options')
    const data = await response.json()
    setJob((current: any) => current ? {
      ...current,
      additional_repairs: data.additional_repairs || current.additional_repairs,
      accessories: data.accessories || current.accessories,
    } : current)
    setSelectedAddOns(new Set())
    setSelectedAccessories(new Set())
    return data
  }

  const handleApprove = async () => {
    setApproving(true)
    setSavedMessage('')
    try {
      await saveSelectedOptions()

      if (alreadyAccepted) {
        setSavedMessage('Your repair options have been saved.')
        setApproving(false)
        return
      }

      const response = await fetch(`/api/public/quote/${jobId}/approve${quoteToken ? `?t=${encodeURIComponent(quoteToken)}` : ''}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      if (!response.ok) throw new Error('Failed to approve quote')
      router.push(`/quote/approved?jobId=${jobId}`)
    } catch (err) {
      setError(alreadyAccepted ? 'Failed to save repair options' : 'Failed to approve quote')
      setApproving(false)
    }
  }

  const handleReject = async () => {
    setRejecting(true)
    try {
      const response = await fetch(`/api/public/quote/${jobId}/reject${quoteToken ? `?t=${encodeURIComponent(quoteToken)}` : ''}`, { method: 'POST' })
      if (!response.ok) throw new Error('Failed to reject quote')
      router.push(`/quote/rejected?jobId=${jobId}`)
    } catch (err) {
      setError('Failed to reject quote')
      setRejecting(false)
    }
  }

  if (loading) return <div className="flex items-center justify-center min-h-screen"><Loader2 className="h-12 w-12 animate-spin" /></div>

  if (error || !job) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-red-50 to-red-100 flex items-center justify-center p-4 pt-24">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-2xl p-8 text-center">
          <AlertCircle className="h-16 w-16 text-red-600 mx-auto mb-4" />
          <h1 className="text-2xl font-bold mb-4">Quote Not Found</h1>
          <p className="text-gray-600">{error || 'This quote link is invalid or has expired.'}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4 pt-24">
      <div className="max-w-2xl w-full bg-white rounded-2xl shadow-2xl p-6 sm:p-8">
        <div className="text-center mb-8">
          <Smartphone className="h-16 w-16 text-blue-600 mx-auto mb-4" />
          <h1 className="text-2xl sm:text-3xl font-bold mb-2">{alreadyAccepted ? 'Your Repair Request' : 'Repair Quote'}</h1>
          <p className="text-gray-600">Reference: {job.job_ref}</p>
          {alreadyAccepted && <p className="text-sm text-green-700 font-semibold mt-2">Your repair request is already saved. You can add options below.</p>}
        </div>

        <div className="bg-gray-50 rounded-xl p-6 mb-6">
          <h2 className="font-bold mb-4">Device Details</h2>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-600">Device:</span>
              <span className="font-semibold">{job.device_make} {job.device_model}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Issue:</span>
              <span className="font-semibold">{job.issue}</span>
            </div>
          </div>
        </div>

        {preferredDropoffLabel && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6">
            <div className="flex items-start gap-3">
              <CalendarDays className="h-5 w-5 text-amber-700 mt-0.5 flex-shrink-0" />
              <div>
                <p className="font-semibold text-amber-900">Preferred drop-off: {preferredDropoffLabel}</p>
                <p className="text-sm text-amber-800 mt-1">Preference only — not a fixed appointment.</p>
              </div>
            </div>
          </div>
        )}

        {job.additional_repairs && job.additional_repairs.length > 0 && (
          <div className="bg-blue-50 rounded-xl p-4 mb-6">
            <h3 className="font-semibold text-sm text-blue-900 mb-2">Already added:</h3>
            {job.additional_repairs.map((r: any, i: number) => (
              <div key={i} className="flex justify-between text-sm py-1">
                <span className="text-blue-800">{r.display_name || r.repair}</span>
                <span className="font-semibold text-blue-900">£{r.price}</span>
              </div>
            ))}
          </div>
        )}

        <div className="bg-green-50 border-2 border-green-200 rounded-xl p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-bold text-green-900 text-xl">Quote Price</h2>
            <span className="text-3xl font-bold text-green-600">
              £{currentTotal.toFixed(2)}
            </span>
          </div>
          
          {job.requires_parts_order && (
            <div className="flex items-start gap-2 text-sm text-green-900 mt-4 pt-4 border-t border-green-200">
              <Package className="h-4 w-4 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">Parts Required</p>
                <p className="text-xs mt-1">A £20.00 deposit will be required when you bring in your device.</p>
              </div>
            </div>
          )}
        </div>

        {existingAccessories.length > 0 && (
          <div className="bg-emerald-50 rounded-xl p-4 mb-6">
            <h3 className="font-semibold text-sm text-emerald-900 mb-2">Extras already added:</h3>
            {existingAccessories.map((item: any, index: number) => (
              <div key={index} className="flex justify-between text-sm py-1">
                <span className="text-emerald-800">{item.name}</span>
                <span className="font-semibold text-emerald-900">{Number(item.price || 0) > 0 ? `£${Number(item.price).toFixed(2)}` : 'Free'}</span>
              </div>
            ))}
          </div>
        )}

        {accessoryChoices.some(item => !existingAccessoryNames.has(item.name)) && (
          <div className="mb-6">
            <h3 className="font-bold text-lg mb-2">Useful extras</h3>
            <p className="text-sm text-gray-500 mb-4">These are optional and can be added to your existing repair request.</p>
            <div className="space-y-2">
              {accessoryChoices.filter(item => !existingAccessoryNames.has(item.name)).map(item => (
                <label
                  key={item.name}
                  className={`flex items-center gap-3 p-4 rounded-xl border-2 cursor-pointer transition-all ${
                    selectedAccessories.has(item.name) ? 'border-green-500 bg-green-50' : 'border-gray-200 bg-white hover:border-green-300'
                  }`}
                >
                  <input
                    type="checkbox"
                    className="w-5 h-5 accent-green-600"
                    checked={selectedAccessories.has(item.name)}
                    onChange={() => setSelectedAccessories(prev => {
                      const next = new Set(prev)
                      if (next.has(item.name)) next.delete(item.name)
                      else next.add(item.name)
                      return next
                    })}
                  />
                  <div className="flex-1">
                    <div className="font-semibold text-sm">{item.name}</div>
                    <div className="text-green-600 font-bold">{item.price > 0 ? `£${item.price}` : 'Free'}</div>
                  </div>
                </label>
              ))}
            </div>
          </div>
        )}

        {/* Upsell section — add-on repairs */}
        {addOns.length > 0 && (
          <div className="mb-6">
            <h3 className="font-bold text-lg mb-2 flex items-center gap-2">
              <Plus className="h-5 w-5 text-green-600" />
              Add Another Repair & Save
            </h3>
            <p className="text-sm text-gray-500 mb-4">Book multiple repairs together and save 25% on additional repairs.</p>
            <div className="space-y-2">
              {addOns.map(addon => (
                <label
                  key={addon.repair}
                  className={`flex items-center gap-3 p-4 rounded-xl border-2 cursor-pointer transition-all ${
                    selectedAddOns.has(addon.repair)
                      ? 'border-green-500 bg-green-50'
                      : 'border-gray-200 bg-white hover:border-green-300'
                  }`}
                >
                  <input
                    type="checkbox"
                    className="w-5 h-5 accent-green-600"
                    checked={selectedAddOns.has(addon.repair)}
                    onChange={() => toggleAddOn(addon.repair)}
                  />
                  <div className="flex-1">
                    <div className="font-semibold text-sm">{addon.displayName}</div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-green-600 font-bold">£{addon.discountPrice}</span>
                      {addon.hasDiscount && (
                        <>
                          <span className="text-gray-400 line-through text-sm">£{addon.originalPrice}</span>
                          <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-semibold">
                            Save £{addon.saving}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </label>
              ))}
            </div>
            {(selectedAddOns.size + selectedAccessories.size) > 0 && (
              <div className="mt-4 p-4 bg-green-50 rounded-xl flex justify-between items-center">
                <span className="text-sm text-gray-600">
                  Added options: {selectedAddOns.size + selectedAccessories.size} item{(selectedAddOns.size + selectedAccessories.size) > 1 ? 's' : ''}
                </span>
                <div className="text-right">
                  <div className="text-lg font-bold text-green-600">+£{(addOnTotal + selectedAccessoryTotal).toFixed(2)}</div>
                  <div className="text-xs text-gray-500">New total: £{totalPrice.toFixed(2)}</div>
                </div>
              </div>
            )}
          </div>
        )}

        <div className="space-y-3">
          <button
            onClick={handleApprove}
            disabled={approving || rejecting || (alreadyAccepted && selectedAddOns.size === 0 && selectedAccessories.size === 0)}
            className="w-full bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 disabled:opacity-50 text-white font-bold py-4 px-6 rounded-xl flex items-center justify-center gap-2 text-lg"
          >
            {approving ? <Loader2 className="h-5 w-5 animate-spin" /> : <CheckCircle className="h-5 w-5" />}
            <span>{approving
              ? (alreadyAccepted ? 'Saving...' : 'Approving...')
              : alreadyAccepted
                ? ((selectedAddOns.size + selectedAccessories.size) > 0 ? `Save Added Options — £${totalPrice.toFixed(2)}` : 'Repair Request Saved')
                : `Approve & Book Repair${(selectedAddOns.size + selectedAccessories.size) > 0 ? ` — £${totalPrice.toFixed(2)}` : ''}`}</span>
          </button>

          {!alreadyAccepted && (
            <button
              onClick={handleReject}
              disabled={approving || rejecting}
              className="w-full bg-gray-200 hover:bg-gray-300 disabled:opacity-50 text-gray-900 font-semibold py-3 px-6 rounded-xl flex items-center justify-center gap-2"
            >
              {rejecting ? <Loader2 className="h-5 w-5 animate-spin" /> : <XCircle className="h-5 w-5" />}
              <span>{rejecting ? 'Rejecting...' : 'Reject Quote'}</span>
            </button>
          )}
          {savedMessage && <p className="text-center text-sm font-semibold text-green-700">{savedMessage}</p>}
        </div>
      </div>
    </div>
  )
}

export default function QuoteApprovalPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center min-h-screen"><Loader2 className="animate-spin" /></div>}>
      <QuoteApprovalContent />
    </Suspense>
  )
}
