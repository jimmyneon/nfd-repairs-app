'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { Search, Bell, Mail, Home, Code, Clock, CheckCircle, XCircle, MessageSquare, ChevronDown, Plus, Briefcase, Wrench } from 'lucide-react'
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
          <div className="space-y-4">
            {otherEnquiries.map((enquiry) => (
              <div key={enquiry.id} className="bg-white rounded-lg shadow hover:shadow-md transition-shadow">
                <div className="p-6">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <span className="font-mono text-sm text-gray-600">{enquiry.enquiry_ref}</span>
                        {getStatusBadge(enquiry.status)}
                        {enquiry.enquiry_type === 'web_services' ? (
                          <span className="flex items-center gap-1 text-sm text-gray-600">
                            <Code className="w-4 h-4" /> Web Services
                          </span>
                        ) : enquiry.enquiry_type === 'business' ? (
                          <span className="flex items-center gap-1 text-sm text-gray-600">
                            <Briefcase className="w-4 h-4" /> Business
                          </span>
                        ) : enquiry.enquiry_type === 'repair_quote' ? (
                          <span className="flex items-center gap-1 text-sm text-gray-600">
                            <Wrench className="w-4 h-4" /> Repair Quote
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 text-sm text-gray-600">
                            <Home className="w-4 h-4" /> Home Services
                          </span>
                        )}
                      </div>
                      <h3 className="text-lg font-semibold text-gray-900">{enquiry.customer_name}</h3>
                      <p className="text-gray-600 text-sm">{enquiry.customer_email}</p>
                      {enquiry.customer_phone && (
                        <p className="text-gray-600 text-sm">{enquiry.customer_phone}</p>
                      )}
                      <div className="mt-2 text-sm text-gray-500">
                        <Clock className="inline w-4 h-4 mr-1" />
                        {new Date(enquiry.created_at).toLocaleString()}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => {
                          setSelectedEnquiry(enquiry)
                          setShowModal(true)
                        }}
                        className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                      >
                        View Details
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal */}
      {showModal && selectedEnquiry && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold text-gray-900">{selectedEnquiry.enquiry_ref}</h2>
                <button
                  onClick={() => {
                    setShowModal(false)
                    setSelectedEnquiry(null)
                  }}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <XCircle className="w-6 h-6" />
                </button>
              </div>
            </div>
            <div className="p-6">
              {/* Customer Info */}
              <div className="mb-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-3">Customer Details</h3>
                <div className="bg-gray-50 rounded-lg p-4 space-y-2">
                  <p><strong>Name:</strong> {selectedEnquiry.customer_name}</p>
                  <p><strong>Email:</strong> {selectedEnquiry.customer_email}</p>
                  {selectedEnquiry.customer_phone && <p><strong>Phone:</strong> {selectedEnquiry.customer_phone}</p>}
                </div>
              </div>

              {/* Enquiry Details */}
              <div className="mb-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-3">
                  {selectedEnquiry.enquiry_type === 'web_services' 
                    ? 'Project Details' 
                    : selectedEnquiry.enquiry_type === 'business' 
                    ? 'Enquiry Details' 
                    : selectedEnquiry.enquiry_type === 'repair_quote'
                    ? 'Repair Quote Details'
                    : 'Service Details'}
                </h3>
                <div className="bg-gray-50 rounded-lg p-4 space-y-2">
                  {selectedEnquiry.enquiry_type === 'web_services' ? (
                    <>
                      <p><strong>Project Type:</strong> {selectedEnquiry.project_type}</p>
                      <p><strong>Sector:</strong> {selectedEnquiry.sector}</p>
                      <p><strong>Number of Pages:</strong> {selectedEnquiry.number_pages}</p>
                      <p><strong>Goals:</strong> {selectedEnquiry.goals}</p>
                      <p><strong>Budget:</strong> {selectedEnquiry.budget}</p>
                      <p><strong>Timeline:</strong> {selectedEnquiry.timeline}</p>
                      <p><strong>Existing Website:</strong> {selectedEnquiry.existing_website}</p>
                      {selectedEnquiry.existing_url && <p><strong>URL:</strong> {selectedEnquiry.existing_url}</p>}
                    </>
                  ) : selectedEnquiry.enquiry_type === 'business' ? (
                    <>
                      {selectedEnquiry.company && <p><strong>Company:</strong> {selectedEnquiry.company}</p>}
                      {selectedEnquiry.help_type && <p><strong>Help Type:</strong> {selectedEnquiry.help_type}</p>}
                      {selectedEnquiry.other_detail && <p><strong>Other Detail:</strong> {selectedEnquiry.other_detail}</p>}
                      {selectedEnquiry.device_count && <p><strong>Device Count:</strong> {selectedEnquiry.device_count}</p>}
                      {selectedEnquiry.urgency && <p><strong>Urgency:</strong> {selectedEnquiry.urgency}</p>}
                      {selectedEnquiry.support_type && <p><strong>Support Type:</strong> {selectedEnquiry.support_type}</p>}
                    </>
                  ) : selectedEnquiry.enquiry_type === 'repair_quote' ? (
                    <>
                      {selectedEnquiry.device_category && <p><strong>Category:</strong> {selectedEnquiry.device_category}</p>}
                      {selectedEnquiry.device_make && <p><strong>Make:</strong> {selectedEnquiry.device_make}</p>}
                      {selectedEnquiry.device_model && <p><strong>Model:</strong> {selectedEnquiry.device_model}</p>}
                      {selectedEnquiry.repair_type && <p><strong>Repair Type:</strong> {selectedEnquiry.repair_type}</p>}
                      {selectedEnquiry.screen_option && <p><strong>Screen Option:</strong> {selectedEnquiry.screen_option}</p>}
                      {selectedEnquiry.quoted_price != null && <p><strong>Quoted Price:</strong> £{selectedEnquiry.quoted_price}</p>}
                      {selectedEnquiry.quote_type && <p><strong>Quote Type:</strong> {selectedEnquiry.quote_type}</p>}
                      {selectedEnquiry.issue_description && <p><strong>Issue Description:</strong> {selectedEnquiry.issue_description}</p>}
                      <p><strong>Terms Accepted:</strong> {selectedEnquiry.terms_accepted ? 'Yes' : 'No'}</p>
                      <p><strong>Quote Accepted:</strong> {selectedEnquiry.proceed_with_repair ? 'Yes — customer accepted via link' : 'No'}</p>
                      <p><strong>Marketing Consent:</strong> {selectedEnquiry.marketing_consent ? 'Yes' : 'No'}</p>
                      {selectedEnquiry.quote_source && <p><strong>Source:</strong> {selectedEnquiry.quote_source}</p>}
                      {selectedEnquiry.repair_reserved && <p><strong>Repair Reserved:</strong> Yes — customer reserved via quote page</p>}
                      {selectedEnquiry.part_reserved && <p><strong>Part Reserved:</strong> Yes — customer waiting until payday</p>}
                      {selectedEnquiry.quote_sent_method && <p><strong>Quote Sent Via:</strong> {selectedEnquiry.quote_sent_method}</p>}
                      {selectedEnquiry.hesitation_reason && (
                        <p><strong>Hesitation:</strong> {selectedEnquiry.hesitation_reason.replace(/_/g, ' ')}</p>
                      )}
                      {selectedEnquiry.customer_budget != null && (
                        <p><strong>Customer Budget:</strong> £{selectedEnquiry.customer_budget} (quote was £{selectedEnquiry.quoted_price})</p>
                      )}
                      {selectedEnquiry.customer_notes && <p><strong>Customer Notes:</strong> {selectedEnquiry.customer_notes}</p>}
                      {selectedEnquiry.preferred_contact_method && <p><strong>Preferred Contact:</strong> {selectedEnquiry.preferred_contact_method}</p>}
                    </>
                  ) : (
                    <>
                      <p><strong>Service Type:</strong> {selectedEnquiry.service_type}</p>
                      <p><strong>Address:</strong> {selectedEnquiry.address}</p>
                      <p><strong>Address Type:</strong> {selectedEnquiry.address_type}</p>
                      <p><strong>Preferred Date:</strong> {selectedEnquiry.preferred_date}</p>
                      <p><strong>Preferred Time:</strong> {selectedEnquiry.preferred_time}</p>
                    </>
                  )}
                  <p><strong>Description:</strong></p>
                  <p className="text-gray-700 whitespace-pre-wrap">
                    {selectedEnquiry.enquiry_type === 'web_services' 
                      ? selectedEnquiry.project_description 
                      : selectedEnquiry.description}
                  </p>
                  {selectedEnquiry.additional_info && (
                    <p><strong>Additional Info:</strong> {selectedEnquiry.additional_info}</p>
                  )}
                </div>
              </div>

              {/* Status */}
              <div className="mb-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-3">Status</h3>
                <div className="flex items-center gap-3">
                  {getStatusBadge(selectedEnquiry.status)}
                  <div className="flex gap-2">
                    {selectedEnquiry.status === 'pending' && (
                      <>
                        <button
                          onClick={() => handleStatusChange(selectedEnquiry.id, 'approved')}
                          className="px-3 py-1 bg-green-600 text-white rounded hover:bg-green-700"
                        >
                          Approve
                        </button>
                        <button
                          onClick={() => handleStatusChange(selectedEnquiry.id, 'rejected')}
                          className="px-3 py-1 bg-red-600 text-white rounded hover:bg-red-700"
                        >
                          Reject
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* Staff Response */}
              {selectedEnquiry.staff_response && (
                <div className="mb-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-3">Staff Response</h3>
                  <div className="bg-blue-50 rounded-lg p-4">
                    <p className="text-gray-700 whitespace-pre-wrap">{selectedEnquiry.staff_response}</p>
                    {selectedEnquiry.responded_at && (
                      <p className="text-sm text-gray-500 mt-2">
                        Responded: {new Date(selectedEnquiry.responded_at).toLocaleString()}
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* New Response */}
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-3">Send Response</h3>
                <textarea
                  value={responseText}
                  onChange={(e) => setResponseText(e.target.value)}
                  placeholder="Type your response to the customer..."
                  className="w-full p-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 min-h-32"
                />
                <button
                  onClick={handleRespond}
                  disabled={responding || !responseText.trim()}
                  className="mt-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
                >
                  {responding ? 'Sending...' : 'Send Response'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
