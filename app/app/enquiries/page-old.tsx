'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { Search, Mail, Home, Code, CheckCircle, XCircle, MessageSquare, ChevronDown, Plus, Briefcase, Wrench } from 'lucide-react'
import Link from 'next/link'

interface Enquiry {
  id: string
  enquiry_ref: string
  enquiry_type: 'web_services' | 'home_services' | 'business' | 'repair_quote'
  customer_name: string
  customer_email: string
  customer_phone: string | null
  status: 'pending' | 'approved' | 'rejected' | 'more_info_requested' | 'converted'
  created_at: string
  // Web Services fields
  project_type?: string
  sector?: string
  number_pages?: string
  goals?: string
  project_description?: string
  existing_website?: string
  existing_url?: string
  budget?: string
  timeline?: string
  // Home Services fields
  service_type?: string
  address?: string
  address_type?: string
  preferred_date?: string
  preferred_time?: string
  description?: string
  // Business enquiry fields
  help_type?: string
  other_detail?: string
  device_count?: string
  urgency?: string
  support_type?: string
  company?: string
  additional_info?: string | null
  // Repair Quote fields
  device_category?: string
  device_make?: string
  device_model?: string
  repair_type?: string
  screen_option?: string
  quoted_price?: number | null
  quote_type?: string
  issue_description?: string
  terms_accepted?: boolean
  proceed_with_repair?: boolean
  marketing_consent?: boolean
  quote_source?: string
  // Post-quote journey fields
  hesitation_reason?: string | null
  customer_budget?: number | null
  quote_sent_method?: string | null
  repair_reserved?: boolean
  part_reserved?: boolean
  preferred_contact_method?: string | null
  customer_notes?: string | null
  quote_valid_until?: string | null
  // Staff response
  staff_notes?: string | null
  staff_response?: string | null
  responded_at?: string | null
  updated_at?: string | null
}

export default function EnquiriesPage() {
  const [enquiries, setEnquiries] = useState<Enquiry[]>([])
  const [filteredEnquiries, setFilteredEnquiries] = useState<Enquiry[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [typeFilter, setTypeFilter] = useState<string>('all')
  const [selectedEnquiry, setSelectedEnquiry] = useState<Enquiry | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [responseText, setResponseText] = useState('')
  const [responding, setResponding] = useState(false)
  const supabase = createClient()

  useEffect(() => {
    loadEnquiries()

    const subscription = supabase
      .channel('enquiries-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'enquiries' }, () => {
        loadEnquiries()
      })
      .subscribe()

    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    filterEnquiries()
  }, [enquiries, searchTerm, statusFilter, typeFilter])

  const loadEnquiries = async () => {
    const { data, error } = await supabase
      .from('enquiries')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Failed to load enquiries:', error)
    } else {
      setEnquiries(data as Enquiry[])
    }
    setLoading(false)
  }

  const filterEnquiries = () => {
    let filtered = enquiries

    if (searchTerm) {
      const search = searchTerm.toLowerCase()
      filtered = filtered.filter(e =>
        e.enquiry_ref.toLowerCase().includes(search) ||
        e.customer_name.toLowerCase().includes(search) ||
        e.customer_email.toLowerCase().includes(search) ||
        (e.customer_phone && e.customer_phone.includes(search)) ||
        (e.project_type && e.project_type.toLowerCase().includes(search)) ||
        (e.service_type && e.service_type.toLowerCase().includes(search)) ||
        (e.help_type && e.help_type.toLowerCase().includes(search)) ||
        (e.company && e.company.toLowerCase().includes(search))
      )
    }

    if (statusFilter !== 'all') {
      filtered = filtered.filter(e => e.status === statusFilter)
    }

    if (typeFilter !== 'all') {
      filtered = filtered.filter(e => e.enquiry_type === typeFilter)
    }

    setFilteredEnquiries(filtered)
  }

  const handleStatusChange = async (enquiryId: string, newStatus: string) => {
    const { error } = await supabase
      .from('enquiries')
      .update({ 
        status: newStatus,
        updated_at: new Date().toISOString()
      })
      .eq('id', enquiryId)

    if (error) {
      console.error('Failed to update status:', error)
      alert('Failed to update status')
    }
  }

  const handleRespond = async () => {
    if (!selectedEnquiry || !responseText.trim()) return

    setResponding(true)
    const { error } = await supabase
      .from('enquiries')
      .update({
        staff_response: responseText,
        status: 'more_info_requested',
        responded_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', selectedEnquiry.id)

    if (error) {
      console.error('Failed to respond:', error)
      alert('Failed to send response')
    } else {
      setShowModal(false)
      setResponseText('')
      setSelectedEnquiry(null)
    }
    setResponding(false)
  }

  const getStatusBadge = (status: string) => {
    const styles = {
      pending: 'bg-yellow-100 text-yellow-800',
      approved: 'bg-green-100 text-green-800',
      rejected: 'bg-red-100 text-red-800',
      more_info_requested: 'bg-blue-100 text-blue-800',
      converted: 'bg-purple-100 text-purple-800',
    }
    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${styles[status as keyof typeof styles] || 'bg-gray-100 text-gray-800'}`}>
        {status.replace(/_/g, ' ').toUpperCase()}
      </span>
    )
  }

  const pendingCount = enquiries.filter(e => e.status === 'pending').length
  const acceptedQuotes = enquiries.filter(e =>
    e.enquiry_type === 'repair_quote' &&
    (e.repair_reserved === true || e.proceed_with_repair === true)
  )
  const followUpQuotes = enquiries.filter(e =>
    e.enquiry_type === 'repair_quote' &&
    !e.repair_reserved &&
    !e.proceed_with_repair &&
    (e.hesitation_reason || e.customer_budget != null || e.part_reserved === true)
  )
  const actionNeededIds = new Set([
    ...acceptedQuotes.map(e => e.id),
    ...followUpQuotes.map(e => e.id),
  ])
  const otherEnquiries = filteredEnquiries.filter(e => !actionNeededIds.has(e.id))

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Enquiries</h1>
              <p className="text-gray-600 mt-1">Manage quote requests from business, web services and home services</p>
              {acceptedQuotes.length > 0 && (
                <div className="mt-2 inline-flex items-center gap-2 bg-green-100 text-green-800 px-4 py-2 rounded-full text-sm font-medium">
                  <CheckCircle className="w-4 h-4" />
                  {acceptedQuotes.length} reserved
                </div>
              )}
              {followUpQuotes.length > 0 && (
                <div className="mt-2 ml-2 inline-flex items-center gap-2 bg-orange-100 text-orange-800 px-4 py-2 rounded-full text-sm font-medium">
                  <MessageSquare className="w-4 h-4" />
                  {followUpQuotes.length} follow-up
                </div>
              )}
            </div>
            <div className="flex items-center gap-4">
              {pendingCount > 0 && (
                <div className="bg-yellow-100 text-yellow-800 px-4 py-2 rounded-full text-sm font-medium">
                  {pendingCount} pending
                </div>
              )}
              <div className="flex items-center gap-2">
                <Link href="/app/jobs" className="inline-flex items-center justify-center w-10 h-10 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors" title="Home">
                  <Home className="h-5 w-5 text-primary" />
                </Link>
                <Link href="/app/jobs/create" className="inline-flex items-center justify-center w-10 h-10 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors" title="Create New Job">
                  <Plus className="h-5 w-5 text-primary" />
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Accepted Quotes Section — at the top */}
      {acceptedQuotes.length > 0 && (
        <div className="max-w-7xl mx-auto px-4 pt-4">
          <div className="bg-green-50 border-2 border-green-300 rounded-lg shadow-sm">
            <div className="px-6 py-4 border-b border-green-200">
              <div className="flex items-center gap-2">
                <CheckCircle className="w-5 h-5 text-green-600" />
                <h2 className="text-lg font-bold text-green-900">Accepted Quotes — Action Needed</h2>
                <span className="ml-auto bg-green-600 text-white text-xs font-bold px-2 py-1 rounded-full">
                  {acceptedQuotes.length}
                </span>
              </div>
              <p className="text-sm text-green-700 mt-1">These customers have accepted their quote. Call or text them to arrange the repair.</p>
            </div>
            <div className="divide-y divide-green-200">
              {acceptedQuotes.map((enquiry) => (
                <div key={enquiry.id} className="p-4 hover:bg-green-100 transition-colors">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-1">
                        <span className="font-mono text-sm text-gray-600">{enquiry.enquiry_ref}</span>
                        <span className="flex items-center gap-1 text-sm text-green-700 font-medium">
                          <Wrench className="w-4 h-4" /> Repair Quote
                        </span>
                      </div>
                      <h3 className="text-lg font-semibold text-gray-900">{enquiry.customer_name}</h3>
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-600 mt-1">
                        {enquiry.customer_phone && <span>📞 {enquiry.customer_phone}</span>}
                        {enquiry.customer_email && <span>✉️ {enquiry.customer_email}</span>}
                      </div>
                      <div className="text-sm text-gray-500 mt-1">
                        {enquiry.device_make} {enquiry.device_model} — {enquiry.repair_type}
                        {enquiry.quoted_price != null && <span className="font-semibold text-green-700"> · £{enquiry.quoted_price}</span>}
                        {enquiry.screen_option && <span> · {enquiry.screen_option}</span>}
                      </div>
                      <div className="text-xs text-gray-400 mt-1">
                        Accepted {new Date(enquiry.updated_at || enquiry.created_at).toLocaleString()}
                      </div>
                    </div>
                    <div className="flex flex-col gap-2">
                      <button
                        onClick={() => { setSelectedEnquiry(enquiry); setShowModal(true) }}
                        className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm"
                      >
                        View Details
                      </button>
                      {enquiry.customer_phone && (
                        <a
                          href={`sms:${enquiry.customer_phone}`}
                          className="px-4 py-2 bg-white text-green-700 border border-green-300 rounded-lg hover:bg-green-50 transition-colors text-sm text-center"
                        >
                          Text Customer
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Follow-Up Section — hesitant customers, budget flags, part reservations */}
      {followUpQuotes.length > 0 && (
        <div className="max-w-7xl mx-auto px-4 pt-4">
          <div className="bg-orange-50 border-2 border-orange-300 rounded-lg shadow-sm">
            <div className="px-6 py-4 border-b border-orange-200">
              <div className="flex items-center gap-2">
                <MessageSquare className="w-5 h-5 text-orange-600" />
                <h2 className="text-lg font-bold text-orange-900">Follow-Up Leads</h2>
                <span className="ml-auto bg-orange-500 text-white text-xs font-bold px-2 py-1 rounded-full">
                  {followUpQuotes.length}
                </span>
              </div>
              <p className="text-sm text-orange-700 mt-1">These customers hesitated or asked about alternatives. Reach out to help them find a solution.</p>
            </div>
            <div className="divide-y divide-orange-200">
              {followUpQuotes.map((enquiry) => (
                <div key={enquiry.id} className="p-4 hover:bg-orange-100 transition-colors">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-1">
                        <span className="font-mono text-sm text-gray-600">{enquiry.enquiry_ref}</span>
                        <span className="flex items-center gap-1 text-sm text-orange-700 font-medium">
                          <Wrench className="w-4 h-4" /> Repair Quote
                        </span>
                        {enquiry.part_reserved && (
                          <span className="bg-blue-100 text-blue-700 text-xs font-medium px-2 py-0.5 rounded-full">Part Reserved</span>
                        )}
                      </div>
                      <h3 className="text-lg font-semibold text-gray-900">{enquiry.customer_name}</h3>
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-600 mt-1">
                        {enquiry.customer_phone && <span>📞 {enquiry.customer_phone}</span>}
                        {enquiry.customer_email && <span>✉️ {enquiry.customer_email}</span>}
                      </div>
                      <div className="text-sm text-gray-500 mt-1">
                        {enquiry.device_make} {enquiry.device_model} — {enquiry.repair_type}
                        {enquiry.quoted_price != null && <span> · £{enquiry.quoted_price}</span>}
                      </div>
                      {enquiry.hesitation_reason && (
                        <div className="text-sm text-orange-700 mt-1 font-medium">
                          ⚠ Hesitation: {enquiry.hesitation_reason.replace(/_/g, ' ')}
                          {enquiry.customer_budget != null && ` · Budget: £${enquiry.customer_budget}`}
                        </div>
                      )}
                      {enquiry.customer_notes && (
                        <div className="text-sm text-gray-600 mt-1 italic">"{enquiry.customer_notes}"</div>
                      )}
                    </div>
                    <div className="flex flex-col gap-2">
                      <button
                        onClick={() => { setSelectedEnquiry(enquiry); setShowModal(true) }}
                        className="px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors text-sm"
                      >
                        View Details
                      </button>
                      {enquiry.customer_phone && (
                        <a
                          href={`sms:${enquiry.customer_phone}`}
                          className="px-4 py-2 bg-white text-orange-700 border border-orange-300 rounded-lg hover:bg-orange-50 transition-colors text-sm text-center"
                        >
                          Text Customer
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="max-w-7xl mx-auto px-4 py-4">
        <div className="bg-white rounded-lg shadow p-4 flex flex-wrap gap-4">
          <div className="flex-1 min-w-64">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
              <input
                type="text"
                placeholder="Search by name, email, reference..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
              />
            </div>
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
          >
            <option value="all">All Statuses</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
            <option value="more_info_requested">More Info Requested</option>
            <option value="converted">Converted</option>
          </select>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
          >
            <option value="all">All Types</option>
            <option value="repair_quote">Repair Quotes</option>
            <option value="business">Business</option>
            <option value="web_services">Web Services</option>
            <option value="home_services">Home Services</option>
          </select>
        </div>
      </div>

      {/* Enquiries List */}
      <div className="max-w-7xl mx-auto px-4 py-4">
        {loading ? (
          <div className="text-center py-12">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-green-600"></div>
            <p className="mt-2 text-gray-600">Loading enquiries...</p>
          </div>
        ) : otherEnquiries.length === 0 ? (
          <div className="bg-white rounded-lg shadow p-12 text-center">
            <Mail className="mx-auto h-12 w-12 text-gray-400" />
            <h3 className="mt-2 text-lg font-medium text-gray-900">No enquiries found</h3>
            <p className="mt-1 text-gray-500">No enquiries match your current filters.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {otherEnquiries.map((enquiry) => {
              const isRepair = enquiry.enquiry_type === 'repair_quote'
              const summary = isRepair
                ? `${enquiry.device_make || ''} ${enquiry.device_model || ''} — ${enquiry.repair_type || 'Repair'}`.trim()
                : enquiry.enquiry_type === 'business'
                ? enquiry.help_type || 'Business enquiry'
                : enquiry.enquiry_type === 'web_services'
                ? enquiry.project_type || 'Web project'
                : enquiry.service_type || 'Home service'

              return (
                <div key={enquiry.id} className="bg-white rounded-lg shadow-sm hover:shadow-md transition-shadow">
                  <button
                    onClick={() => { setSelectedEnquiry(enquiry); setShowModal(true) }}
                    className="w-full p-4 flex items-center justify-between text-left hover:bg-gray-50 rounded-lg transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      {isRepair ? (
                        <Wrench className="w-5 h-5 text-green-600 flex-shrink-0" />
                      ) : enquiry.enquiry_type === 'business' ? (
                        <Briefcase className="w-5 h-5 text-blue-600 flex-shrink-0" />
                      ) : enquiry.enquiry_type === 'web_services' ? (
                        <Code className="w-5 h-5 text-purple-600 flex-shrink-0" />
                      ) : (
                        <Home className="w-5 h-5 text-orange-600 flex-shrink-0" />
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-gray-900 truncate">{enquiry.customer_name}</span>
                          {isRepair && enquiry.quoted_price != null && (
                            <span className="text-green-700 font-semibold text-sm flex-shrink-0">£{enquiry.quoted_price}</span>
                          )}
                        </div>
                        <p className="text-sm text-gray-500 truncate">{summary}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0 ml-3">
                      {getStatusBadge(enquiry.status)}
                      <span className="text-xs text-gray-400 hidden sm:inline">
                        {new Date(enquiry.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                      </span>
                      <ChevronDown className="w-4 h-4 text-gray-400" />
                    </div>
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Modal */}
      {showModal && selectedEnquiry && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="p-5 border-b">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <h2 className="text-lg font-bold text-gray-900">{selectedEnquiry.customer_name}</h2>
                  {getStatusBadge(selectedEnquiry.status)}
                </div>
                <button
                  onClick={() => { setShowModal(false); setSelectedEnquiry(null) }}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <XCircle className="w-6 h-6" />
                </button>
              </div>
              <p className="text-sm text-gray-500 mt-1">
                <span className="font-mono">{selectedEnquiry.enquiry_ref}</span>
                {' · '}
                {new Date(selectedEnquiry.created_at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
              </p>
            </div>

            <div className="p-5 space-y-4">
              {/* Quick Contact */}
              <div className="flex flex-wrap gap-3">
                {selectedEnquiry.customer_phone && (
                  <a href={`sms:${selectedEnquiry.customer_phone}`} className="inline-flex items-center gap-2 px-3 py-2 bg-gray-100 rounded-lg text-sm hover:bg-gray-200 transition-colors">
                    <MessageSquare className="w-4 h-4 text-gray-600" /> {selectedEnquiry.customer_phone}
                  </a>
                )}
                {selectedEnquiry.customer_email && (
                  <a href={`mailto:${selectedEnquiry.customer_email}`} className="inline-flex items-center gap-2 px-3 py-2 bg-gray-100 rounded-lg text-sm hover:bg-gray-200 transition-colors">
                    <Mail className="w-4 h-4 text-gray-600" /> {selectedEnquiry.customer_email}
                  </a>
                )}
              </div>

              {/* Repair Quote Summary */}
              {selectedEnquiry.enquiry_type === 'repair_quote' && (
                <div className="bg-gray-50 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-gray-500">Device</span>
                    <span className="text-sm text-gray-900">{selectedEnquiry.device_make} {selectedEnquiry.device_model}</span>
                  </div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-gray-500">Repair</span>
                    <span className="text-sm text-gray-900">{selectedEnquiry.repair_type}</span>
                  </div>
                  {selectedEnquiry.quoted_price != null && (
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-gray-500">Quoted Price</span>
                      <span className="text-sm font-semibold text-green-700">£{selectedEnquiry.quoted_price}</span>
                    </div>
                  )}
                  {selectedEnquiry.quote_type && (
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-gray-500">Quote Type</span>
                      <span className="text-sm text-gray-900 capitalize">{selectedEnquiry.quote_type}</span>
                    </div>
                  )}
                  {selectedEnquiry.screen_option && (
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-gray-500">Part Option</span>
                      <span className="text-sm text-gray-900">{selectedEnquiry.screen_option}</span>
                    </div>
                  )}
                </div>
              )}

              {/* Issue Description (if any) */}
              {selectedEnquiry.issue_description && (
                <div>
                  <p className="text-sm font-medium text-gray-500 mb-1">Issue Description</p>
                  <p className="text-sm text-gray-900 bg-gray-50 rounded-lg p-3 whitespace-pre-wrap">{selectedEnquiry.issue_description}</p>
                </div>
              )}

              {/* Post-Quote Journey (if any) */}
              {selectedEnquiry.enquiry_type === 'repair_quote' && (selectedEnquiry.repair_reserved || selectedEnquiry.part_reserved || selectedEnquiry.hesitation_reason || selectedEnquiry.customer_notes) && (
                <div className="bg-blue-50 rounded-lg p-4 space-y-2">
                  <p className="text-sm font-semibold text-blue-900">Customer Actions</p>
                  {selectedEnquiry.repair_reserved && <p className="text-sm text-blue-800">✓ Repair reserved via quote page</p>}
                  {selectedEnquiry.part_reserved && <p className="text-sm text-blue-800">✓ Part reserved (waiting until payday)</p>}
                  {selectedEnquiry.hesitation_reason && <p className="text-sm text-blue-800">⚠ Hesitation: {selectedEnquiry.hesitation_reason.replace(/_/g, ' ')}</p>}
                  {selectedEnquiry.customer_budget != null && <p className="text-sm text-blue-800">Budget: £{selectedEnquiry.customer_budget}</p>}
                  {selectedEnquiry.customer_notes && <p className="text-sm text-blue-800 italic">"{selectedEnquiry.customer_notes}"</p>}
                  {selectedEnquiry.quote_sent_method && <p className="text-sm text-blue-800">Quote sent via: {selectedEnquiry.quote_sent_method}</p>}
                </div>
              )}

              {/* Business Enquiry Summary */}
              {selectedEnquiry.enquiry_type === 'business' && (
                <div className="bg-gray-50 rounded-lg p-4 space-y-2">
                  {selectedEnquiry.company && <p className="text-sm"><strong>Company:</strong> {selectedEnquiry.company}</p>}
                  {selectedEnquiry.help_type && <p className="text-sm"><strong>Help Type:</strong> {selectedEnquiry.help_type}</p>}
                  {selectedEnquiry.device_count && <p className="text-sm"><strong>Device Count:</strong> {selectedEnquiry.device_count}</p>}
                  {selectedEnquiry.urgency && <p className="text-sm"><strong>Urgency:</strong> {selectedEnquiry.urgency}</p>}
                  {selectedEnquiry.support_type && <p className="text-sm"><strong>Support Type:</strong> {selectedEnquiry.support_type}</p>}
                </div>
              )}

              {/* Web Services Summary */}
              {selectedEnquiry.enquiry_type === 'web_services' && (
                <div className="bg-gray-50 rounded-lg p-4 space-y-2">
                  <p className="text-sm"><strong>Project Type:</strong> {selectedEnquiry.project_type}</p>
                  <p className="text-sm"><strong>Sector:</strong> {selectedEnquiry.sector}</p>
                  <p className="text-sm"><strong>Budget:</strong> {selectedEnquiry.budget}</p>
                  <p className="text-sm"><strong>Timeline:</strong> {selectedEnquiry.timeline}</p>
                  {selectedEnquiry.project_description && <p className="text-sm"><strong>Description:</strong> {selectedEnquiry.project_description}</p>}
                </div>
              )}

              {/* Collapsible More Details */}
              <details className="group">
                <summary className="cursor-pointer text-sm font-medium text-gray-500 hover:text-gray-700 flex items-center gap-2">
                  <ChevronDown className="w-4 h-4 group-open:rotate-180 transition-transform" />
                  More Details
                </summary>
                <div className="mt-3 bg-gray-50 rounded-lg p-4 space-y-2">
                  <p className="text-sm"><strong>Terms Accepted:</strong> {selectedEnquiry.terms_accepted ? 'Yes' : 'No'}</p>
                  <p className="text-sm"><strong>Marketing Consent:</strong> {selectedEnquiry.marketing_consent ? 'Yes' : 'No'}</p>
                  {selectedEnquiry.quote_source && <p className="text-sm"><strong>Source:</strong> {selectedEnquiry.quote_source}</p>}
                  {selectedEnquiry.preferred_contact_method && <p className="text-sm"><strong>Preferred Contact:</strong> {selectedEnquiry.preferred_contact_method}</p>}
                  {selectedEnquiry.additional_info && <p className="text-sm"><strong>Additional Info:</strong> {selectedEnquiry.additional_info}</p>}
                  {selectedEnquiry.staff_notes && <p className="text-sm"><strong>Staff Notes:</strong> {selectedEnquiry.staff_notes}</p>}
                </div>
              </details>

              {/* Status Actions */}
              <div className="flex items-center gap-3 pt-2 border-t">
                {getStatusBadge(selectedEnquiry.status)}
                {selectedEnquiry.status === 'pending' && (
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleStatusChange(selectedEnquiry.id, 'approved')}
                      className="px-3 py-1.5 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700"
                    >
                      Approve
                    </button>
                    <button
                      onClick={() => handleStatusChange(selectedEnquiry.id, 'rejected')}
                      className="px-3 py-1.5 bg-red-600 text-white text-sm rounded-lg hover:bg-red-700"
                    >
                      Reject
                    </button>
                  </div>
                )}
              </div>

              {/* Staff Response (if exists) */}
              {selectedEnquiry.staff_response && (
                <div className="bg-blue-50 rounded-lg p-4">
                  <p className="text-sm font-semibold text-blue-900 mb-1">Staff Response</p>
                  <p className="text-sm text-gray-700 whitespace-pre-wrap">{selectedEnquiry.staff_response}</p>
                  {selectedEnquiry.responded_at && (
                    <p className="text-xs text-gray-500 mt-2">{new Date(selectedEnquiry.responded_at).toLocaleString()}</p>
                  )}
                </div>
              )}

              {/* Add Staff Notes */}
              <div>
                <textarea
                  value={responseText}
                  onChange={(e) => setResponseText(e.target.value)}
                  placeholder="Add staff notes or response..."
                  className="w-full p-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 text-sm"
                  rows={3}
                />
                <button
                  onClick={handleRespond}
                  disabled={responding || !responseText.trim()}
                  className="mt-2 px-4 py-2 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
                >
                  {responding ? 'Saving...' : 'Save Notes'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
