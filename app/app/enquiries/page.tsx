'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { Search, Home, Plus, Wrench, Briefcase, Code, MessageSquare, Mail, CheckCircle, Clock, ChevronDown, Send } from 'lucide-react'
import Link from 'next/link'
import SlideUpPanel from '@/components/SlideUpPanel'

interface Enquiry {
  id: string
  enquiry_ref: string
  enquiry_type: 'web_services' | 'home_services' | 'business' | 'repair_quote'
  customer_name: string
  customer_email: string
  customer_phone: string | null
  status: 'pending' | 'approved' | 'rejected' | 'more_info_requested' | 'converted'
  created_at: string
  project_type?: string
  sector?: string
  number_pages?: string
  goals?: string
  project_description?: string
  existing_website?: string
  existing_url?: string
  budget?: string
  timeline?: string
  service_type?: string
  address?: string
  address_type?: string
  preferred_date?: string
  preferred_time?: string
  description?: string
  help_type?: string
  other_detail?: string
  device_count?: string
  urgency?: string
  support_type?: string
  company?: string
  additional_info?: string | null
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
  hesitation_reason?: string | null
  customer_budget?: number | null
  quote_sent_method?: string | null
  repair_reserved?: boolean
  part_reserved?: boolean
  preferred_contact_method?: string | null
  customer_notes?: string | null
  quote_valid_until?: string | null
  staff_notes?: string | null
  staff_response?: string | null
  responded_at?: string | null
  updated_at?: string | null
}

const STATUS_CONFIG: Record<string, { label: string; bg: string; text: string }> = {
  pending: { label: 'Pending', bg: 'bg-yellow-500', text: 'text-white' },
  approved: { label: 'Approved', bg: 'bg-green-600', text: 'text-white' },
  rejected: { label: 'Rejected', bg: 'bg-red-600', text: 'text-white' },
  more_info_requested: { label: 'Info Sent', bg: 'bg-blue-600', text: 'text-white' },
  converted: { label: 'Converted', bg: 'bg-purple-600', text: 'text-white' },
}

const TYPE_CONFIG: Record<string, { label: string; icon: typeof Wrench; color: string }> = {
  repair_quote: { label: 'Repair', icon: Wrench, color: 'text-green-600' },
  business: { label: 'Business', icon: Briefcase, color: 'text-blue-600' },
  web_services: { label: 'Web', icon: Code, color: 'text-purple-600' },
  home_services: { label: 'Home', icon: Home, color: 'text-orange-600' },
}

export default function EnquiriesPage() {
  const [enquiries, setEnquiries] = useState<Enquiry[]>([])
  const [filteredEnquiries, setFilteredEnquiries] = useState<Enquiry[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [selectedEnquiry, setSelectedEnquiry] = useState<Enquiry | null>(null)
  const [showDetail, setShowDetail] = useState(false)
  const [responseText, setResponseText] = useState('')
  const [responding, setResponding] = useState(false)
  const [showFilters, setShowFilters] = useState(false)
  const supabase = createClient()

  useEffect(() => {
    loadEnquiries()
    const subscription = supabase
      .channel('enquiries-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'enquiries' }, () => loadEnquiries())
      .subscribe()
    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    let filtered = enquiries
    if (searchTerm) {
      const search = searchTerm.toLowerCase()
      filtered = filtered.filter(e =>
        e.enquiry_ref.toLowerCase().includes(search) ||
        e.customer_name.toLowerCase().includes(search) ||
        e.customer_email.toLowerCase().includes(search) ||
        (e.customer_phone && e.customer_phone.includes(search)) ||
        (e.device_make && e.device_make.toLowerCase().includes(search)) ||
        (e.device_model && e.device_model.toLowerCase().includes(search)) ||
        (e.company && e.company.toLowerCase().includes(search))
      )
    }
    if (statusFilter !== 'all') {
      filtered = filtered.filter(e => e.status === statusFilter)
    }
    setFilteredEnquiries(filtered)
  }, [enquiries, searchTerm, statusFilter])

  const loadEnquiries = async () => {
    const { data, error } = await supabase
      .from('enquiries')
      .select('*')
      .order('created_at', { ascending: false })
    if (!error && data) setEnquiries(data as Enquiry[])
    setLoading(false)
  }

  const handleStatusChange = async (enquiryId: string, newStatus: string) => {
    await supabase.from('enquiries').update({ status: newStatus, updated_at: new Date().toISOString() }).eq('id', enquiryId)
    loadEnquiries()
  }

  const handleRespond = async () => {
    if (!selectedEnquiry || !responseText.trim()) return
    setResponding(true)
    const { error } = await supabase
      .from('enquiries')
      .update({ staff_response: responseText, status: 'more_info_requested', responded_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', selectedEnquiry.id)
    if (!error) {
      setShowDetail(false)
      setResponseText('')
      setSelectedEnquiry(null)
    }
    setResponding(false)
  }

  const openDetail = (enquiry: Enquiry) => {
    setSelectedEnquiry(enquiry)
    setResponseText(enquiry.staff_notes || '')
    setShowDetail(true)
  }

  const pendingCount = enquiries.filter(e => e.status === 'pending').length
  const acceptedCount = enquiries.filter(e => e.enquiry_type === 'repair_quote' && (e.repair_reserved || e.proceed_with_repair)).length
  const followUpCount = enquiries.filter(e => e.enquiry_type === 'repair_quote' && !e.repair_reserved && !e.proceed_with_repair && (e.hesitation_reason || e.customer_budget != null || e.part_reserved)).length

  const getTileSummary = (e: Enquiry): string => {
    if (e.enquiry_type === 'repair_quote') return `${e.device_make || ''} ${e.device_model || ''}`.trim() || 'Repair quote'
    if (e.enquiry_type === 'business') return e.help_type || e.company || 'Business enquiry'
    if (e.enquiry_type === 'web_services') return e.project_type || 'Web project'
    return e.service_type || 'Home service'
  }

  const getTileBadge = (e: Enquiry): { text: string; color: string } | null => {
    if (e.repair_reserved || e.proceed_with_repair) return { text: 'RESERVED', color: 'bg-green-500' }
    if (e.part_reserved) return { text: 'PART HELD', color: 'bg-blue-500' }
    if (e.hesitation_reason) return { text: 'HESITATING', color: 'bg-orange-500' }
    return null
  }

  const fmtDate = (d: string) => {
    const date = new Date(d)
    const now = new Date()
    const diffHrs = (now.getTime() - date.getTime()) / (1000 * 60 * 60)
    if (diffHrs < 1) return 'Just now'
    if (diffHrs < 24) return `${Math.floor(diffHrs)}h ago`
    if (diffHrs < 48) return 'Yesterday'
    return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <header className="bg-white dark:bg-gray-800 shadow-sm sticky top-0 z-10">
        <div className="px-4 py-3">
          <div className="flex items-center justify-between mb-3">
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">Enquiries</h1>
            <div className="flex items-center gap-2">
              <Link href="/app/jobs" className="w-10 h-10 flex items-center justify-center rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
                <Home className="h-5 w-5 text-primary" />
              </Link>
              <Link href="/app/jobs/create" className="w-10 h-10 flex items-center justify-center rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
                <Plus className="h-5 w-5 text-primary" />
              </Link>
            </div>
          </div>

          {/* Search */}
          <div className="relative mb-3">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search by name, ref, phone..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full h-14 pl-10 pr-4 border border-gray-300 dark:border-gray-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            />
          </div>

          {/* Filter chips */}
          <div className="flex gap-2 overflow-x-auto pb-1">
            <button
              onClick={() => setStatusFilter('all')}
              className={`px-4 py-2 rounded-lg text-sm font-bold whitespace-nowrap transition-colors ${statusFilter === 'all' ? 'bg-primary text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'}`}
            >
              All ({enquiries.length})
            </button>
            {pendingCount > 0 && (
              <button
                onClick={() => setStatusFilter('pending')}
                className={`px-4 py-2 rounded-lg text-sm font-bold whitespace-nowrap transition-colors ${statusFilter === 'pending' ? 'bg-yellow-500 text-white' : 'bg-yellow-50 text-yellow-700'}`}
              >
                Pending ({pendingCount})
              </button>
            )}
            {acceptedCount > 0 && (
              <button
                onClick={() => setStatusFilter('converted')}
                className={`px-4 py-2 rounded-lg text-sm font-bold whitespace-nowrap transition-colors ${statusFilter === 'converted' ? 'bg-green-600 text-white' : 'bg-green-50 text-green-700'}`}
              >
                Accepted ({acceptedCount})
              </button>
            )}
            {followUpCount > 0 && (
              <button
                onClick={() => setStatusFilter('more_info_requested')}
                className={`px-4 py-2 rounded-lg text-sm font-bold whitespace-nowrap transition-colors ${statusFilter === 'more_info_requested' ? 'bg-orange-500 text-white' : 'bg-orange-50 text-orange-700'}`}
              >
                Follow-up ({followUpCount})
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Enquiry Tiles */}
      <main className="p-4">
        {loading ? (
          <div className="text-center py-12">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        ) : filteredEnquiries.length === 0 ? (
          <div className="text-center py-12">
            <Mail className="mx-auto h-12 w-12 text-gray-300" />
            <p className="mt-2 text-gray-500">No enquiries found</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {filteredEnquiries.map((enquiry) => {
              const typeCfg = TYPE_CONFIG[enquiry.enquiry_type] || TYPE_CONFIG.repair_quote
              const statusCfg = STATUS_CONFIG[enquiry.status] || STATUS_CONFIG.pending
              const summary = getTileSummary(enquiry)
              const badge = getTileBadge(enquiry)
              const TypeIcon = typeCfg.icon

              return (
                <button
                  key={enquiry.id}
                  onClick={() => openDetail(enquiry)}
                  className={`relative block rounded-xl shadow-lg overflow-hidden active:scale-95 transition-all cursor-pointer select-none aspect-square border-l-4 ${statusCfg.bg}`}
                >
                  <div className="p-3 h-full flex flex-col text-white">
                    {/* Top row: type + badge */}
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-1.5">
                        <TypeIcon className="h-4 w-4" />
                        <p className="font-black text-xs uppercase tracking-wide">{typeCfg.label}</p>
                      </div>
                      {badge && (
                        <span className={`text-[10px] font-black px-1.5 py-0.5 rounded-full ${badge.color}`}>
                          {badge.text}
                        </span>
                      )}
                    </div>

                    {/* Main content: customer name + summary */}
                    <div className="flex-1 flex flex-col justify-center text-center">
                      <p className="text-sm font-black leading-tight mb-1 truncate">{enquiry.customer_name}</p>
                      <p className="text-xs font-semibold truncate opacity-90">{summary}</p>
                      {enquiry.quoted_price != null && (
                        <p className="text-lg font-black mt-1">£{enquiry.quoted_price}</p>
                      )}
                    </div>

                    {/* Bottom row: status + date */}
                    <div className="flex items-center justify-between text-xs border-t border-white/20 pt-1.5">
                      <span className="font-bold uppercase">{statusCfg.label}</span>
                      <span className="opacity-80">{fmtDate(enquiry.created_at)}</span>
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </main>

      {/* Detail Slide-Up Panel */}
      <SlideUpPanel
        isOpen={showDetail}
        onClose={() => setShowDetail(false)}
        title={selectedEnquiry?.customer_name || 'Enquiry'}
        icon={<Mail className="h-5 w-5 text-primary" />}
      >
        {selectedEnquiry && (
          <div className="space-y-4">
            {/* Ref + date */}
            <div className="flex items-center justify-between">
              <span className="font-mono text-sm text-gray-500">{selectedEnquiry.enquiry_ref}</span>
              <span className="text-sm text-gray-500">{new Date(selectedEnquiry.created_at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
            </div>

            {/* Status badge */}
            <div className="flex items-center gap-2">
              {(() => {
                const cfg = STATUS_CONFIG[selectedEnquiry.status] || STATUS_CONFIG.pending
                return <span className={`px-3 py-1.5 rounded-lg text-sm font-bold ${cfg.bg} ${cfg.text}`}>{cfg.label}</span>
              })()}
              {selectedEnquiry.enquiry_type === 'repair_quote' && selectedEnquiry.quoted_price != null && (
                <span className="px-3 py-1.5 rounded-lg text-sm font-bold bg-green-100 text-green-700">£{selectedEnquiry.quoted_price}</span>
              )}
            </div>

            {/* Contact buttons */}
            <div className="grid grid-cols-2 gap-3">
              {selectedEnquiry.customer_phone && (
                <a href={`sms:${selectedEnquiry.customer_phone}`} className="flex items-center justify-center gap-2 py-3 bg-gray-100 dark:bg-gray-700 rounded-xl text-sm font-bold hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors">
                  <MessageSquare className="h-4 w-4" /> Text
                </a>
              )}
              {selectedEnquiry.customer_email && (
                <a href={`mailto:${selectedEnquiry.customer_email}`} className="flex items-center justify-center gap-2 py-3 bg-gray-100 dark:bg-gray-700 rounded-xl text-sm font-bold hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors">
                  <Mail className="h-4 w-4" /> Email
                </a>
              )}
            </div>

            {/* Repair quote details */}
            {selectedEnquiry.enquiry_type === 'repair_quote' && (
              <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-4 space-y-2">
                <p className="text-sm font-bold text-gray-900 dark:text-white">Repair Details</p>
                <div className="text-sm text-gray-600 dark:text-gray-300 space-y-1">
                  <p><span className="font-semibold">Device:</span> {selectedEnquiry.device_make} {selectedEnquiry.device_model}</p>
                  <p><span className="font-semibold">Repair:</span> {selectedEnquiry.repair_type}</p>
                  {selectedEnquiry.quoted_price != null && <p><span className="font-semibold">Quoted:</span> £{selectedEnquiry.quoted_price}</p>}
                  {selectedEnquiry.quote_type && <p><span className="font-semibold">Type:</span> {selectedEnquiry.quote_type}</p>}
                  {selectedEnquiry.screen_option && <p><span className="font-semibold">Part:</span> {selectedEnquiry.screen_option}</p>}
                </div>
              </div>
            )}

            {/* Post-quote journey */}
            {selectedEnquiry.enquiry_type === 'repair_quote' && (selectedEnquiry.repair_reserved || selectedEnquiry.part_reserved || selectedEnquiry.hesitation_reason || selectedEnquiry.customer_notes) && (
              <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-4 space-y-1">
                <p className="text-sm font-bold text-blue-900 dark:text-blue-300">Customer Actions</p>
                <div className="text-sm text-blue-800 dark:text-blue-400 space-y-1">
                  {selectedEnquiry.repair_reserved && <p>✓ Repair reserved</p>}
                  {selectedEnquiry.part_reserved && <p>✓ Part reserved (waiting until payday)</p>}
                  {selectedEnquiry.hesitation_reason && <p>⚠ Hesitation: {selectedEnquiry.hesitation_reason.replace(/_/g, ' ')}</p>}
                  {selectedEnquiry.customer_budget != null && <p>Budget: £{selectedEnquiry.customer_budget}</p>}
                  {selectedEnquiry.customer_notes && <p className="italic">"{selectedEnquiry.customer_notes}"</p>}
                </div>
              </div>
            )}

            {/* Issue description */}
            {selectedEnquiry.issue_description && (
              <div>
                <p className="text-sm font-bold text-gray-900 dark:text-white mb-1">Issue Description</p>
                <p className="text-sm text-gray-600 dark:text-gray-300 bg-gray-50 dark:bg-gray-700/50 rounded-xl p-3 whitespace-pre-wrap">{selectedEnquiry.issue_description}</p>
              </div>
            )}

            {/* Business enquiry details */}
            {selectedEnquiry.enquiry_type === 'business' && (
              <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-4 space-y-1">
                <p className="text-sm font-bold text-gray-900 dark:text-white">Business Details</p>
                <div className="text-sm text-gray-600 dark:text-gray-300 space-y-1">
                  {selectedEnquiry.company && <p><span className="font-semibold">Company:</span> {selectedEnquiry.company}</p>}
                  {selectedEnquiry.help_type && <p><span className="font-semibold">Help:</span> {selectedEnquiry.help_type}</p>}
                  {selectedEnquiry.device_count && <p><span className="font-semibold">Devices:</span> {selectedEnquiry.device_count}</p>}
                  {selectedEnquiry.urgency && <p><span className="font-semibold">Urgency:</span> {selectedEnquiry.urgency}</p>}
                </div>
              </div>
            )}

            {/* Web services details */}
            {selectedEnquiry.enquiry_type === 'web_services' && (
              <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-4 space-y-1">
                <p className="text-sm font-bold text-gray-900 dark:text-white">Project Details</p>
                <div className="text-sm text-gray-600 dark:text-gray-300 space-y-1">
                  {selectedEnquiry.project_type && <p><span className="font-semibold">Type:</span> {selectedEnquiry.project_type}</p>}
                  {selectedEnquiry.budget && <p><span className="font-semibold">Budget:</span> {selectedEnquiry.budget}</p>}
                  {selectedEnquiry.timeline && <p><span className="font-semibold">Timeline:</span> {selectedEnquiry.timeline}</p>}
                  {selectedEnquiry.project_description && <p><span className="font-semibold">Description:</span> {selectedEnquiry.project_description}</p>}
                </div>
              </div>
            )}

            {/* Collapsible more details */}
            <details className="group">
              <summary className="cursor-pointer text-sm font-bold text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 flex items-center gap-2 py-2">
                <ChevronDown className="h-4 w-4 group-open:rotate-180 transition-transform" />
                More Details
              </summary>
              <div className="mt-2 bg-gray-50 dark:bg-gray-700/50 rounded-xl p-4 space-y-1 text-sm text-gray-600 dark:text-gray-300">
                {selectedEnquiry.terms_accepted !== undefined && <p><span className="font-semibold">Terms:</span> {selectedEnquiry.terms_accepted ? 'Yes' : 'No'}</p>}
                {selectedEnquiry.marketing_consent !== undefined && <p><span className="font-semibold">Marketing:</span> {selectedEnquiry.marketing_consent ? 'Yes' : 'No'}</p>}
                {selectedEnquiry.quote_source && <p><span className="font-semibold">Source:</span> {selectedEnquiry.quote_source}</p>}
                {selectedEnquiry.preferred_contact_method && <p><span className="font-semibold">Preferred contact:</span> {selectedEnquiry.preferred_contact_method}</p>}
                {selectedEnquiry.additional_info && <p><span className="font-semibold">Additional info:</span> {selectedEnquiry.additional_info}</p>}
                {selectedEnquiry.staff_notes && <p><span className="font-semibold">Staff notes:</span> {selectedEnquiry.staff_notes}</p>}
              </div>
            </details>

            {/* Status actions */}
            {selectedEnquiry.status === 'pending' && (
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => handleStatusChange(selectedEnquiry.id, 'approved')}
                  className="flex items-center justify-center gap-2 py-3 bg-green-600 text-white font-bold rounded-xl hover:bg-green-700 transition-colors active:scale-95"
                >
                  <CheckCircle className="h-4 w-4" /> Approve
                </button>
                <button
                  onClick={() => handleStatusChange(selectedEnquiry.id, 'rejected')}
                  className="flex items-center justify-center gap-2 py-3 bg-red-600 text-white font-bold rounded-xl hover:bg-red-700 transition-colors active:scale-95"
                >
                  ✕ Reject
                </button>
              </div>
            )}

            {/* Staff response */}
            {selectedEnquiry.staff_response && (
              <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-4">
                <p className="text-sm font-bold text-blue-900 dark:text-blue-300 mb-1">Staff Response</p>
                <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">{selectedEnquiry.staff_response}</p>
                {selectedEnquiry.responded_at && <p className="text-xs text-gray-400 mt-2">{new Date(selectedEnquiry.responded_at).toLocaleString()}</p>}
              </div>
            )}

            {/* Add staff notes */}
            <div>
              <textarea
                value={responseText}
                onChange={(e) => setResponseText(e.target.value)}
                placeholder="Add staff notes..."
                className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                rows={3}
              />
              <button
                onClick={handleRespond}
                disabled={responding || !responseText.trim()}
                className="mt-2 w-full flex items-center justify-center gap-2 py-3 bg-primary text-white font-bold rounded-xl hover:bg-primary-dark transition-colors active:scale-95 disabled:opacity-50"
              >
                <Send className="h-4 w-4" />
                {responding ? 'Saving...' : 'Save Notes'}
              </button>
            </div>
          </div>
        )}
      </SlideUpPanel>
    </div>
  )
}
