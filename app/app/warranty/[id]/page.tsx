'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { ArrowLeft, CheckCircle, XCircle, Package, Send, Link as LinkIcon, AlertTriangle } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

interface WarrantyTicket {
  id: string
  ticket_ref: string
  source: string
  submitted_at: string
  customer_name: string
  customer_phone: string
  customer_email: string | null
  matched_job_id: string | null
  match_confidence: string
  suggested_jobs: any[]
  job_reference: string | null
  device_model: string | null
  issue_description: string
  issue_category: string | null
  status: string
  approved_at: string | null
  requires_parts: boolean
  parts_ordered_at: string | null
  parts_arrived_at: string | null
  decline_reason: string | null
  created_at: string
}

interface JobSuggestion {
  jobId: string
  jobRef: string
  confidence: 'high' | 'medium' | 'low'
  matchReason: string
  customerName: string
  deviceMake: string
  deviceModel: string
  createdAt: string
  status: string
}

export default function WarrantyTicketDetailPage({ params }: { params: { id: string } }) {
  const [ticket, setTicket] = useState<WarrantyTicket | null>(null)
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null)
  const [requiresParts, setRequiresParts] = useState(false)
  const [declineReason, setDeclineReason] = useState('')
  const [showApproveModal, setShowApproveModal] = useState(false)
  const [showDeclineModal, setShowDeclineModal] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    loadTicket()

    const subscription = supabase
      .channel(`warranty-ticket-${params.id}`)
      .on('postgres_changes', { 
        event: '*', 
        schema: 'public', 
        table: 'warranty_tickets',
        filter: `id=eq.${params.id}`
      }, () => {
        loadTicket()
      })
      .subscribe()

    return () => {
      subscription.unsubscribe()
    }
  }, [params.id])

  const loadTicket = async () => {
    const { data, error } = await supabase
      .from('warranty_tickets')
      .select('*')
      .eq('id', params.id)
      .single()

    if (!error && data) {
      setTicket(data)
      if (data.matched_job_id) {
        setSelectedJobId(data.matched_job_id)
      }
    }
    setLoading(false)
  }

  const handleLinkJob = async (jobId: string) => {
    setActionLoading(true)
    
    const { error } = await supabase
      .from('warranty_tickets')
      .update({ 
        matched_job_id: jobId,
        match_confidence: 'high'
      } as any)
      .eq('id', params.id)

    if (!error) {
      await supabase
        .from('warranty_ticket_events')
        .insert({
          ticket_id: params.id,
          type: 'SYSTEM',
          message: `Manually linked to job`,
          metadata: { jobId }
        } as any)
      
      setSelectedJobId(jobId)
      await loadTicket()
    }
    
    setActionLoading(false)
  }

  const handleApprove = async () => {
    setActionLoading(true)
    
    const { error } = await supabase
      .from('warranty_tickets')
      .update({ 
        status: 'IN_PROGRESS',
        approved_at: new Date().toISOString(),
        requires_parts: requiresParts,
        parts_ordered_at: requiresParts ? new Date().toISOString() : null
      } as any)
      .eq('id', params.id)

    if (!error && ticket) {
      await supabase
        .from('warranty_ticket_events')
        .insert({
          ticket_id: params.id,
          type: 'STATUS_CHANGE',
          message: `Warranty approved${requiresParts ? ' - Parts required' : ''}`,
          metadata: { requiresParts }
        } as any)

      // TODO: Send SMS to customer
      
      setShowApproveModal(false)
      await loadTicket()
    }
    
    setActionLoading(false)
  }

  const handleDecline = async () => {
    if (!declineReason.trim()) {
      alert('Please provide a reason for declining')
      return
    }

    setActionLoading(true)
    
    const { error } = await supabase
      .from('warranty_tickets')
      .update({ 
        status: 'CLOSED',
        decline_reason: declineReason
      } as any)
      .eq('id', params.id)

    if (!error) {
      await supabase
        .from('warranty_ticket_events')
        .insert({
          ticket_id: params.id,
          type: 'STATUS_CHANGE',
          message: `Warranty declined: ${declineReason}`,
          metadata: { declineReason }
        } as any)

      // TODO: Send decline SMS to customer
      
      setShowDeclineModal(false)
      await loadTicket()
    }
    
    setActionLoading(false)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    )
  }

  if (!ticket) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-500 dark:text-gray-400">Ticket not found</p>
          <Link href="/app/warranty" className="text-primary mt-2 inline-block">
            Back to Warranty Tickets
          </Link>
        </div>
      </div>
    )
  }

  const suggestions: JobSuggestion[] = ticket.suggested_jobs || []

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <header className="bg-white dark:bg-gray-800 shadow-sm sticky top-0 z-10">
        <div className="px-4 py-3">
          <Link href="/app/warranty" className="inline-flex items-center text-primary mb-3">
            <ArrowLeft className="h-5 w-5 mr-2" />
            Back to Warranty Tickets
          </Link>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{ticket.ticket_ref}</h1>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Submitted {new Date(ticket.submitted_at).toLocaleString('en-GB')}
              </p>
            </div>
            <span className={`px-3 py-1 rounded-full text-sm font-medium ${
              ticket.status === 'NEW' ? 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200' :
              ticket.status === 'NEEDS_ATTENTION' ? 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200' :
              ticket.status === 'IN_PROGRESS' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200' :
              ticket.status === 'RESOLVED' ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' :
              'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200'
            }`}>
              {ticket.status.replace('_', ' ')}
            </span>
          </div>
        </div>
      </header>

      <main className="p-4 space-y-4">
        {/* Customer Info */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4">
          <h2 className="font-semibold text-lg mb-3 text-gray-900 dark:text-white">Customer Information</h2>
          <div className="space-y-2">
            <div>
              <span className="text-sm text-gray-600 dark:text-gray-400">Name:</span>
              <p className="font-medium text-gray-900 dark:text-white">{ticket.customer_name}</p>
            </div>
            <div>
              <span className="text-sm text-gray-600 dark:text-gray-400">Phone:</span>
              <p className="font-medium text-gray-900 dark:text-white">{ticket.customer_phone}</p>
            </div>
            {ticket.customer_email && (
              <div>
                <span className="text-sm text-gray-600 dark:text-gray-400">Email:</span>
                <p className="font-medium text-gray-900 dark:text-white">{ticket.customer_email}</p>
              </div>
            )}
            {ticket.device_model && (
              <div>
                <span className="text-sm text-gray-600 dark:text-gray-400">Device:</span>
                <p className="font-medium text-gray-900 dark:text-white">{ticket.device_model}</p>
              </div>
            )}
          </div>
        </div>

        {/* Issue Description */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4">
          <h2 className="font-semibold text-lg mb-3 text-gray-900 dark:text-white">Issue Description</h2>
          <p className="text-gray-700 dark:text-gray-300 whitespace-pre-wrap">{ticket.issue_description}</p>
        </div>

        {/* Job Matching */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4">
          <h2 className="font-semibold text-lg mb-3 flex items-center gap-2 text-gray-900 dark:text-white">
            <LinkIcon className="h-5 w-5" />
            Job Matching
          </h2>
          
          {ticket.matched_job_id ? (
            <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-3 mb-3">
              <div className="flex items-center gap-2 text-green-800 dark:text-green-200">
                <CheckCircle className="h-5 w-5" />
                <span className="font-medium">Linked to Job</span>
              </div>
              <Link 
                href={`/app/jobs/${ticket.matched_job_id}`}
                className="text-primary hover:underline mt-1 inline-block"
              >
                View Job Details →
              </Link>
            </div>
          ) : suggestions.length > 0 ? (
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
                {suggestions.length} possible {suggestions.length === 1 ? 'match' : 'matches'} found. Select the correct job:
              </p>
              <div className="space-y-2">
                {suggestions.map((suggestion) => (
                  <button
                    key={suggestion.jobId}
                    onClick={() => handleLinkJob(suggestion.jobId)}
                    disabled={actionLoading}
                    className="w-full text-left p-3 border-2 border-gray-200 dark:border-gray-700 rounded-lg hover:border-primary transition-colors disabled:opacity-50 bg-white dark:bg-gray-800"
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <span className="font-semibold text-gray-900 dark:text-white">{suggestion.jobRef}</span>
                        <span className={`ml-2 text-xs px-2 py-1 rounded-full ${
                          suggestion.confidence === 'high' ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' :
                          suggestion.confidence === 'medium' ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200' :
                          'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200'
                        }`}>
                          {suggestion.confidence} match
                        </span>
                      </div>
                    </div>
                    <div className="text-sm text-gray-600 dark:text-gray-400">
                      <p><strong>{suggestion.customerName}</strong></p>
                      <p>{suggestion.deviceMake} {suggestion.deviceModel}</p>
                      <p className="text-xs mt-1">
                        Created: {new Date(suggestion.createdAt).toLocaleDateString('en-GB')} • 
                        Status: {suggestion.status}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-700 rounded-lg p-3">
              <p className="text-gray-600 dark:text-gray-400 text-sm">No matching jobs found</p>
            </div>
          )}
        </div>

        {/* Actions */}
        {ticket.status === 'NEW' || ticket.status === 'NEEDS_ATTENTION' ? (
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4">
            <h2 className="font-semibold text-lg mb-3 text-gray-900 dark:text-white">Actions</h2>
            <div className="flex gap-3">
              <button
                onClick={() => setShowApproveModal(true)}
                className="flex-1 bg-green-500 hover:bg-green-600 text-white px-4 py-3 rounded-lg font-medium flex items-center justify-center gap-2"
              >
                <CheckCircle className="h-5 w-5" />
                Approve Warranty
              </button>
              <button
                onClick={() => setShowDeclineModal(true)}
                className="flex-1 bg-red-500 hover:bg-red-600 text-white px-4 py-3 rounded-lg font-medium flex items-center justify-center gap-2"
              >
                <XCircle className="h-5 w-5" />
                Decline Warranty
              </button>
            </div>
          </div>
        ) : null}
      </main>

      {/* Approve Modal */}
      {showApproveModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg max-w-md w-full p-6">
            <h3 className="text-xl font-bold mb-4 text-gray-900 dark:text-white">Approve Warranty</h3>
            <p className="text-gray-600 dark:text-gray-400 mb-4">
              This will approve the warranty and send a message to the customer.
            </p>
            
            <label className="flex items-center gap-2 mb-4 p-3 border border-gray-200 dark:border-gray-700 rounded-lg cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700">
              <input
                type="checkbox"
                checked={requiresParts}
                onChange={(e) => setRequiresParts(e.target.checked)}
                className="w-5 h-5"
              />
              <div>
                <div className="font-medium flex items-center gap-2 text-gray-900 dark:text-white">
                  <Package className="h-4 w-4" />
                  Parts Required
                </div>
                <div className="text-sm text-gray-600 dark:text-gray-400">
                  We need to order parts before customer brings device in
                </div>
              </div>
            </label>

            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3 mb-4">
              <p className="text-sm text-blue-800 dark:text-blue-200">
                <strong>Customer will receive:</strong><br />
                {requiresParts 
                  ? 'SMS: "We\'ve approved your warranty. We need to order parts - we\'ll let you know when they arrive."'
                  : 'SMS: "We\'ve approved your warranty. Please bring your device to our shop at your earliest convenience."'
                }
              </p>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setShowApproveModal(false)}
                disabled={actionLoading}
                className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-900 dark:text-white"
              >
                Cancel
              </button>
              <button
                onClick={handleApprove}
                disabled={actionLoading}
                className="flex-1 bg-green-500 hover:bg-green-600 text-white px-4 py-2 rounded-lg font-medium flex items-center justify-center gap-2"
              >
                {actionLoading ? (
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                ) : (
                  <>
                    <Send className="h-4 w-4" />
                    Approve & Send SMS
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Decline Modal */}
      {showDeclineModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg max-w-md w-full p-6">
            <h3 className="text-xl font-bold mb-4 text-gray-900 dark:text-white">Decline Warranty</h3>
            <p className="text-gray-600 dark:text-gray-400 mb-4">
              Please provide a reason for declining this warranty request:
            </p>
            
            <textarea
              value={declineReason}
              onChange={(e) => setDeclineReason(e.target.value)}
              placeholder="e.g., This is accidental damage, not covered under warranty"
              className="w-full border border-gray-300 dark:border-gray-600 rounded-lg p-3 mb-4 min-h-[100px] bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            />

            <div className="bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-lg p-3 mb-4">
              <p className="text-sm text-orange-800 dark:text-orange-200">
                <strong>Customer will receive:</strong><br />
                SMS: "Unfortunately, this issue isn't covered under our warranty. {declineReason}"
              </p>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setShowDeclineModal(false)}
                disabled={actionLoading}
                className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-900 dark:text-white"
              >
                Cancel
              </button>
              <button
                onClick={handleDecline}
                disabled={actionLoading || !declineReason.trim()}
                className="flex-1 bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-lg font-medium flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {actionLoading ? (
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                ) : (
                  <>
                    <Send className="h-4 w-4" />
                    Decline & Send SMS
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
