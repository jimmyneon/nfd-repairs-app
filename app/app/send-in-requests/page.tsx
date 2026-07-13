'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { Home, Plus, Mail, Phone, MapPin, Clock, CreditCard, Package, CheckCircle, XCircle, Send } from 'lucide-react'
import Link from 'next/link'

interface SendInRequest {
  id: string
  request_ref: string
  customer_name: string
  customer_phone: string
  customer_email: string
  collection_address: string
  device_type: string
  device_model: string | null
  issue_description: string
  diagnostic_fee_paid: boolean
  diagnostic_fee_amount: number
  payment_reference: string | null
  status: string
  staff_notes: string | null
  created_at: string
  updated_at: string
}

export default function SendInRequestsPage() {
  const [requests, setRequests] = useState<SendInRequest[]>([])
  const [filteredRequests, setFilteredRequests] = useState<SendInRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [selectedRequest, setSelectedRequest] = useState<SendInRequest | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [staffNotes, setStaffNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const supabase = createClient()

  useEffect(() => {
    loadRequests()

    const subscription = supabase
      .channel('send-in-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'send_in_requests' }, () => {
        loadRequests()
      })
      .subscribe()

    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    filterRequests()
  }, [requests, searchTerm, statusFilter])

  const loadRequests = async () => {
    const { data, error } = await supabase
      .from('send_in_requests')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Failed to load send-in requests:', error)
    } else {
      setRequests(data as SendInRequest[])
    }
    setLoading(false)
  }

  const filterRequests = () => {
    let filtered = requests

    if (searchTerm) {
      const search = searchTerm.toLowerCase()
      filtered = filtered.filter(r =>
        r.request_ref.toLowerCase().includes(search) ||
        r.customer_name.toLowerCase().includes(search) ||
        r.customer_phone.toLowerCase().includes(search) ||
        r.customer_email.toLowerCase().includes(search) ||
        r.device_type.toLowerCase().includes(search) ||
        (r.device_model && r.device_model.toLowerCase().includes(search))
      )
    }

    if (statusFilter !== 'all') {
      filtered = filtered.filter(r => r.status === statusFilter)
    }

    setFilteredRequests(filtered)
  }

  const handleStatusChange = async (requestId: string, newStatus: string) => {
    const { error } = await supabase
      .from('send_in_requests')
      .update({
        status: newStatus,
        updated_at: new Date().toISOString()
      })
      .eq('id', requestId)

    if (error) {
      console.error('Failed to update status:', error)
      alert('Failed to update status')
    }
  }

  const handleSaveNotes = async () => {
    if (!selectedRequest) return
    setSaving(true)
    const { error } = await supabase
      .from('send_in_requests')
      .update({
        staff_notes: staffNotes,
        updated_at: new Date().toISOString()
      })
      .eq('id', selectedRequest.id)

    if (error) {
      console.error('Failed to save notes:', error)
      alert('Failed to save notes')
    } else {
      setShowModal(false)
      setSelectedRequest(null)
    }
    setSaving(false)
  }

  const openModal = (request: SendInRequest) => {
    setSelectedRequest(request)
    setStaffNotes(request.staff_notes || '')
    setShowModal(true)
  }

  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      pending: 'bg-yellow-100 text-yellow-800',
      payment_received: 'bg-blue-100 text-blue-800',
      collection_arranged: 'bg-indigo-100 text-indigo-800',
      device_received: 'bg-cyan-100 text-cyan-800',
      diagnosing: 'bg-orange-100 text-orange-800',
      quote_sent: 'bg-purple-100 text-purple-800',
      repair_approved: 'bg-green-100 text-green-800',
      repair_declined: 'bg-red-100 text-red-800',
      repaired: 'bg-teal-100 text-teal-800',
      returned: 'bg-gray-100 text-gray-800',
      cancelled: 'bg-red-100 text-red-800',
    }
    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${styles[status] || 'bg-gray-100 text-gray-800'}`}>
        {status.replace(/_/g, ' ').toUpperCase()}
      </span>
    )
  }

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    return date.toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const pendingCount = requests.filter(r => r.status === 'pending').length
  const awaitingPayment = requests.filter(r => r.status === 'pending' && !r.diagnostic_fee_paid).length

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <div className="bg-white dark:bg-gray-800 border-b dark:border-gray-700">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Send-In Requests</h1>
              <p className="text-gray-600 dark:text-gray-300 mt-1">UK-wide courier collection repair requests</p>
              {pendingCount > 0 && (
                <div className="mt-2 inline-flex items-center gap-2 bg-yellow-100 text-yellow-800 px-4 py-2 rounded-full text-sm font-medium">
                  <Clock className="w-4 h-4" />
                  {pendingCount} pending
                </div>
              )}
              {awaitingPayment > 0 && (
                <div className="mt-2 ml-2 inline-flex items-center gap-2 bg-orange-100 text-orange-800 px-4 py-2 rounded-full text-sm font-medium">
                  <CreditCard className="w-4 h-4" />
                  {awaitingPayment} awaiting payment
                </div>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Link href="/app/jobs" className="inline-flex items-center justify-center w-10 h-10 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors" title="Home">
                <Home className="h-5 w-5 text-primary" />
              </Link>
              <Link href="/app/jobs/create" className="inline-flex items-center justify-center w-10 h-10 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors" title="Create New Job">
                <Plus className="h-5 w-5 text-primary" />
              </Link>
            </div>
          </div>

          {/* Search and Filters */}
          <div className="mt-4 flex flex-col sm:flex-row gap-3">
            <input
              type="text"
              placeholder="Search by ref, name, phone, device..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="flex-1 h-10 px-4 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="h-10 px-4 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            >
              <option value="all">All Statuses</option>
              <option value="pending">Pending</option>
              <option value="payment_received">Payment Received</option>
              <option value="collection_arranged">Collection Arranged</option>
              <option value="device_received">Device Received</option>
              <option value="diagnosing">Diagnosing</option>
              <option value="quote_sent">Quote Sent</option>
              <option value="repair_approved">Repair Approved</option>
              <option value="repair_declined">Repair Declined</option>
              <option value="repaired">Repaired</option>
              <option value="returned">Returned</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>
        </div>
      </div>

      {/* List */}
      <div className="max-w-7xl mx-auto p-4">
        {loading ? (
          <div className="text-center py-12">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        ) : filteredRequests.length === 0 ? (
          <div className="text-center py-12">
            <Package className="w-12 h-12 text-gray-400 mx-auto mb-3" />
            <p className="text-gray-500 dark:text-gray-400">No send-in requests yet</p>
            <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">Requests from the send-us-your-device page will appear here</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredRequests.map((request) => (
              <div
                key={request.id}
                className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-4 hover:shadow-md transition-shadow cursor-pointer"
                onClick={() => openModal(request)}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-2">
                      <span className="font-mono text-sm text-gray-600 dark:text-gray-400">{request.request_ref}</span>
                      {getStatusBadge(request.status)}
                      {request.diagnostic_fee_paid ? (
                        <span className="inline-flex items-center gap-1 text-xs text-green-600 font-medium">
                          <CheckCircle className="w-3 h-3" /> £29 paid
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs text-orange-600 font-medium">
                          <CreditCard className="w-3 h-3" /> £29 unpaid
                        </span>
                      )}
                    </div>
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{request.customer_name}</h3>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-600 dark:text-gray-300 mt-1">
                      <span className="flex items-center gap-1"><Phone className="w-3.5 h-3.5" /> {request.customer_phone}</span>
                      <span className="flex items-center gap-1"><Mail className="w-3.5 h-3.5" /> {request.customer_email}</span>
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-600 dark:text-gray-300 mt-1">
                      <span><strong>{request.device_type}</strong>{request.device_model ? ` — ${request.device_model}` : ''}</span>
                    </div>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 line-clamp-2">{request.issue_description}</p>
                    <div className="flex items-center gap-1 text-xs text-gray-400 dark:text-gray-500 mt-2">
                      <MapPin className="w-3 h-3" /> {request.collection_address}
                      <span className="mx-2">•</span>
                      <Clock className="w-3 h-3" /> {formatDate(request.created_at)}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Detail Modal */}
      {showModal && selectedRequest && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50" onClick={() => setShowModal(false)}>
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-xl font-bold text-gray-900 dark:text-white">{selectedRequest.request_ref}</h2>
                  <p className="text-sm text-gray-500 dark:text-gray-400">{formatDate(selectedRequest.created_at)}</p>
                </div>
                {getStatusBadge(selectedRequest.status)}
              </div>

              {/* Customer Details */}
              <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 mb-4">
                <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-3">Customer</h3>
                <div className="space-y-2 text-sm">
                  <p className="text-gray-900 dark:text-white"><strong>Name:</strong> {selectedRequest.customer_name}</p>
                  <p className="text-gray-900 dark:text-white"><strong>Phone:</strong> {selectedRequest.customer_phone}</p>
                  <p className="text-gray-900 dark:text-white"><strong>Email:</strong> {selectedRequest.customer_email}</p>
                  <p className="text-gray-900 dark:text-white"><strong>Collection Address:</strong><br />{selectedRequest.collection_address}</p>
                </div>
              </div>

              {/* Device Details */}
              <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 mb-4">
                <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-3">Device</h3>
                <div className="space-y-2 text-sm">
                  <p className="text-gray-900 dark:text-white"><strong>Type:</strong> {selectedRequest.device_type}</p>
                  <p className="text-gray-900 dark:text-white"><strong>Model:</strong> {selectedRequest.device_model || 'Not specified'}</p>
                  <p className="text-gray-900 dark:text-white"><strong>Issue:</strong> {selectedRequest.issue_description}</p>
                </div>
              </div>

              {/* Payment */}
              <div className={`rounded-lg p-4 mb-4 ${selectedRequest.diagnostic_fee_paid ? 'bg-green-50 dark:bg-green-900/20' : 'bg-orange-50 dark:bg-orange-900/20'}`}>
                <div className="flex items-center gap-2">
                  {selectedRequest.diagnostic_fee_paid ? (
                    <CheckCircle className="w-5 h-5 text-green-600" />
                  ) : (
                    <CreditCard className="w-5 h-5 text-orange-600" />
                  )}
                  <p className={`font-semibold ${selectedRequest.diagnostic_fee_paid ? 'text-green-800 dark:text-green-400' : 'text-orange-800 dark:text-orange-400'}`}>
                    £29 Diagnostic Fee — {selectedRequest.diagnostic_fee_paid ? 'Paid' : 'Awaiting Payment'}
                  </p>
                </div>
                {selectedRequest.payment_reference && (
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Ref: {selectedRequest.payment_reference}</p>
                )}
              </div>

              {/* Status Changer */}
              <div className="mb-4">
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-200 mb-2">Update Status</label>
                <select
                  value={selectedRequest.status}
                  onChange={(e) => {
                    handleStatusChange(selectedRequest.id, e.target.value)
                    setSelectedRequest({ ...selectedRequest, status: e.target.value })
                  }}
                  className="w-full h-10 px-4 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                >
                  <option value="pending">Pending</option>
                  <option value="payment_received">Payment Received</option>
                  <option value="collection_arranged">Collection Arranged</option>
                  <option value="device_received">Device Received</option>
                  <option value="diagnosing">Diagnosing</option>
                  <option value="quote_sent">Quote Sent</option>
                  <option value="repair_approved">Repair Approved</option>
                  <option value="repair_declined">Repair Declined</option>
                  <option value="repaired">Repaired</option>
                  <option value="returned">Returned</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </div>

              {/* Staff Notes */}
              <div className="mb-4">
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-200 mb-2">Staff Notes</label>
                <textarea
                  value={staffNotes}
                  onChange={(e) => setStaffNotes(e.target.value)}
                  rows={3}
                  placeholder="Add internal notes about this request..."
                  className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                />
              </div>

              {/* Actions */}
              <div className="flex gap-3">
                <button
                  onClick={handleSaveNotes}
                  disabled={saving}
                  className="flex-1 h-10 bg-primary text-white rounded-lg font-medium hover:bg-primary-dark transition-colors disabled:opacity-50"
                >
                  {saving ? 'Saving...' : 'Save Notes'}
                </button>
                <button
                  onClick={() => setShowModal(false)}
                  className="h-10 px-6 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg font-medium hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
