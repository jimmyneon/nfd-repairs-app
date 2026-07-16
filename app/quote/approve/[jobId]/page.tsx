'use client'

import { useState, useEffect, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { Loader2, CheckCircle, XCircle, AlertCircle, Smartphone, Package } from 'lucide-react'

function QuoteApprovalContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const jobId = searchParams.get('jobId')
  const [loading, setLoading] = useState(true)
  const [approving, setApproving] = useState(false)
  const [rejecting, setRejecting] = useState(false)
  const [job, setJob] = useState<any>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (jobId) {
      fetch(`/api/jobs/${jobId}`)
        .then(res => res.json())
        .then(data => { setJob(data); setLoading(false) })
        .catch(() => { setLoading(false); setError('Failed to load quote') })
    }
  }, [jobId])

  const handleApprove = async () => {
    setApproving(true)
    try {
      const response = await fetch(`/api/jobs/${jobId}/approve-quote`, { method: 'POST' })
      if (!response.ok) throw new Error('Failed to approve quote')
      router.push(`/quote/approved?jobId=${jobId}`)
    } catch (err) {
      setError('Failed to approve quote')
      setApproving(false)
    }
  }

  const handleReject = async () => {
    setRejecting(true)
    try {
      const response = await fetch(`/api/jobs/${jobId}/reject-quote`, { method: 'POST' })
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
      <div className="min-h-screen bg-gradient-to-br from-red-50 to-red-100 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-2xl p-8 text-center">
          <AlertCircle className="h-16 w-16 text-red-600 mx-auto mb-4" />
          <h1 className="text-2xl font-bold mb-4">Quote Not Found</h1>
          <p className="text-gray-600">{error || 'This quote link is invalid or has expired.'}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="max-w-2xl w-full bg-white rounded-2xl shadow-2xl p-6 sm:p-8">
        <div className="text-center mb-8">
          <Smartphone className="h-16 w-16 text-blue-600 mx-auto mb-4" />
          <h1 className="text-2xl sm:text-3xl font-bold mb-2">Repair Quote</h1>
          <p className="text-gray-600">Reference: {job.job_ref}</p>
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

        <div className="bg-green-50 border-2 border-green-200 rounded-xl p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-bold text-green-900 text-xl">Quote Price</h2>
            <span className="text-3xl font-bold text-green-600">
              £{job.quoted_price?.toFixed(2) || job.price_total?.toFixed(2) || '0.00'}
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

        <div className="space-y-3">
          <button
            onClick={handleApprove}
            disabled={approving || rejecting}
            className="w-full bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 disabled:opacity-50 text-white font-bold py-4 px-6 rounded-xl flex items-center justify-center gap-2 text-lg"
          >
            {approving ? <Loader2 className="h-5 w-5 animate-spin" /> : <CheckCircle className="h-5 w-5" />}
            <span>{approving ? 'Approving...' : 'Approve & Book Repair'}</span>
          </button>

          <button
            onClick={handleReject}
            disabled={approving || rejecting}
            className="w-full bg-gray-200 hover:bg-gray-300 disabled:opacity-50 text-gray-900 font-semibold py-3 px-6 rounded-xl flex items-center justify-center gap-2"
          >
            {rejecting ? <Loader2 className="h-5 w-5 animate-spin" /> : <XCircle className="h-5 w-5" />}
            <span>{rejecting ? 'Rejecting...' : 'Reject Quote'}</span>
          </button>
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
