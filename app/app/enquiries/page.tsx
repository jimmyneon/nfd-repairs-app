'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { Search, Home, Plus, Wrench, Briefcase, Code, MessageSquare, Mail, CheckCircle, Clock, ChevronDown, Send, ArrowRight, Phone, X } from 'lucide-react'
import Link from 'next/link'
import { renderSmsTemplate, getFirstName, safeDeviceLabel } from '@/lib/sms-template'
import SlideUpPanel from '@/components/SlideUpPanel'

export const dynamic = 'force-dynamic'

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
  converted_job_id?: string | null
  preferred_contact_method?: string | null
  customer_notes?: string | null
  quote_valid_until?: string | null
  staff_notes?: string | null
  staff_response?: string | null
  responded_at?: string | null
  updated_at?: string | null
}

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; text: string }> = {
  pending: { label: 'Quote Sent', color: 'border-yellow-500', bg: 'bg-yellow-100 dark:bg-yellow-900/30', text: 'text-yellow-700 dark:text-yellow-400' },
  approved: { label: 'Approved', color: 'border-green-600', bg: 'bg-green-100 dark:bg-green-900/30', text: 'text-green-700 dark:text-green-400' },
  rejected: { label: 'Rejected', color: 'border-red-500', bg: 'bg-red-100 dark:bg-red-900/30', text: 'text-red-700 dark:text-red-400' },
  more_info_requested: { label: 'Info Sent', color: 'border-blue-600', bg: 'bg-blue-100 dark:bg-blue-900/30', text: 'text-blue-700 dark:text-blue-400' },
  converted: { label: 'Booked In', color: 'border-green-600', bg: 'bg-green-100 dark:bg-green-900/30', text: 'text-green-700 dark:text-green-400' },
}

const TYPE_CONFIG: Record<string, { label: string; icon: typeof Wrench; color: string; bg: string }> = {
  repair_quote: { label: 'Repair', icon: Wrench, color: 'text-green-600 dark:text-green-400', bg: 'bg-green-50 dark:bg-green-900/20' },
  business: { label: 'Business', icon: Briefcase, color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-50 dark:bg-blue-900/20' },
  web_services: { label: 'Web', icon: Code, color: 'text-purple-600 dark:text-purple-400', bg: 'bg-purple-50 dark:bg-purple-900/20' },
  home_services: { label: 'Home', icon: Home, color: 'text-orange-600 dark:text-orange-400', bg: 'bg-orange-50 dark:bg-orange-900/20' },
}

function EnquiriesContent() {
  const [enquiries, setEnquiries] = useState<Enquiry[]>([])
  const [filteredEnquiries, setFilteredEnquiries] = useState<Enquiry[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('action_needed')
  const [selectedEnquiry, setSelectedEnquiry] = useState<Enquiry | null>(null)
  const [showDetail, setShowDetail] = useState(false)
  const [responseText, setResponseText] = useState('')
  const [responding, setResponding] = useState(false)
  const [showFilters, setShowFilters] = useState(false)
  const [smsTemplates, setSmsTemplates] = useState<{key: string, body: string}[]>([])
  const [showTemplatePicker, setShowTemplatePicker] = useState(false)
  const [smsMessage, setSmsMessage] = useState('')
  const [sendingSms, setSendingSms] = useState(false)
  const [converting, setConverting] = useState(false)
  const [convertResult, setConvertResult] = useState<{
    job_id: string
    job_ref: string
    tracking_url: string
    status: string
    sms_sent: boolean
    sms_error?: string | null
  } | null>(null)
  const [showMessageComposer, setShowMessageComposer] = useState(false)
  const [messageMethod, setMessageMethod] = useState<'sms' | 'email' | 'both'>('both')
  const supabase = createClient() as any

  useEffect(() => {
    loadEnquiries()
    const subscription = supabase
      .channel('enquiries-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'enquiries' }, () => loadEnquiries())
      .subscribe()
    return () => { subscription.unsubscribe() }
  }, [])

  // Deep link: auto-open enquiry if ?ref= is in URL
  useEffect(() => {
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    const ref = params.get('ref')
    if (ref && enquiries.length > 0) {
      const found = enquiries.find(e => e.enquiry_ref === ref)
      if (found) {
        setSelectedEnquiry(found)
        setResponseText(found.staff_notes || '')
        setShowDetail(true)
      }
    }
  }, [enquiries])

  useEffect(() => {
    supabase
      .from('sms_templates')
      .select('key, body')
      .eq('is_active', true)
      .then(({ data }: any) => {
        if (data) setSmsTemplates(data)
      })
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
      if (statusFilter === 'action_needed') {
        filtered = filtered.filter(e => isActionNeeded(e))
      } else if (statusFilter === 'follow_up') {
        filtered = filtered.filter(e => isFollowUp(e))
      } else if (statusFilter === 'accepted') {
        filtered = filtered.filter(e => isAccepted(e))
      } else {
        filtered = filtered.filter(e => e.status === statusFilter)
      }
    }
    // Sort by priority: action needed first, then pending, then everything else
    filtered.sort((a, b) => {
      const aPriority = getPriority(a)
      const bPriority = getPriority(b)
      if (aPriority !== bPriority) return aPriority - bPriority
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    })
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

  const isFollowUp = (e: Enquiry) => e.enquiry_type === 'repair_quote' && !e.repair_reserved && !e.proceed_with_repair && (e.hesitation_reason || e.customer_budget != null || e.part_reserved)
  const isConverted = (e: Enquiry) => e.status === 'converted' || Boolean(e.converted_job_id)
  const isAccepted = (e: Enquiry) => !isConverted(e) && e.enquiry_type === 'repair_quote' && (e.repair_reserved || e.proceed_with_repair)
  const isActionNeeded = (e: Enquiry) => !isConverted(e) && (e.status === 'approved' || isAccepted(e))
  const getPriority = (e: Enquiry) => {
    if (isActionNeeded(e)) return 0
    if (e.status === 'pending' && e.enquiry_type === 'repair_quote') return 1
    if (e.status === 'pending') return 2
    return 3
  }

  const pendingCount = enquiries.filter(e => e.status === 'pending').length
  const acceptedCount = enquiries.filter(e => isAccepted(e)).length
  const followUpCount = enquiries.filter(e => e.enquiry_type === 'repair_quote' && !e.repair_reserved && !e.proceed_with_repair && (e.hesitation_reason || e.customer_budget != null || e.part_reserved)).length
  const actionNeededCount = enquiries.filter(e => isActionNeeded(e)).length

  const getTileSummary = (e: Enquiry): string => {
    if (e.enquiry_type === 'repair_quote') return `${e.device_make || ''} ${e.device_model || ''}`.trim() || 'Repair quote'
    if (e.enquiry_type === 'business') return e.help_type || e.company || 'Business enquiry'
    if (e.enquiry_type === 'web_services') return e.project_type || 'Web project'
    return e.service_type || 'Home service'
  }

  const getStatusLabel = (e: Enquiry): string => {
    if (e.converted_job_id) return 'Booked In'
    if (isAccepted(e)) return 'Accepted'
    if (isFollowUp(e)) return 'Follow-up'
    if (e.enquiry_type !== 'repair_quote' && e.status === 'pending') return 'New Enquiry'
    return STATUS_CONFIG[e.status]?.label || 'Pending'
  }

  const getTileBadge = (e: Enquiry): { text: string; color: string } | null => {
    if (e.repair_reserved || e.proceed_with_repair) return { text: 'RESERVED', color: 'bg-green-500' }
    if (e.part_reserved) return { text: 'PART HELD', color: 'bg-blue-500' }
    if (e.hesitation_reason) return { text: 'HESITATING', color: 'bg-orange-500' }
    return null
  }

  const applySmsTemplate = (body: string) => {
    if (!selectedEnquiry) return
    const rendered = renderSmsTemplate(body, {
      first_name: getFirstName(selectedEnquiry.customer_name),
      customer_name: selectedEnquiry.customer_name,
      device_make: selectedEnquiry.device_make || '',
      device_model: safeDeviceLabel(selectedEnquiry.device_make, selectedEnquiry.device_model),
      device_summary: safeDeviceLabel(selectedEnquiry.device_make, selectedEnquiry.device_model),
      job_ref: selectedEnquiry.enquiry_ref,
    })
    setSmsMessage(rendered)
    setShowTemplatePicker(false)
  }

  const handleConvertToJob = async (stockStatus: 'in_stock' | 'parts_needed') => {
    if (!selectedEnquiry) return
    setConverting(true)
    try {
      const res = await fetch('/api/enquiries/convert-to-job', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enquiry_id: selectedEnquiry.id,
          stock_status: stockStatus,
        }),
      })
      const data = await res.json()
      if (data.success) {
        setConvertResult({
          job_id: data.job_id,
          job_ref: data.job_ref,
          tracking_url: data.tracking_url,
          status: data.status,
          sms_sent: data.sms_sent === true,
          sms_error: data.sms_error || null,
        })
        loadEnquiries()
      } else {
        alert(data.error || 'Failed to convert enquiry')
      }
    } catch (e) {
      console.error('Conversion failed:', e)
      alert('Failed to convert enquiry to job')
    }
    setConverting(false)
  }

  const handleSendMessage = async () => {
    if (!selectedEnquiry || !smsMessage.trim()) return
    setSendingSms(true)
    try {
      if (messageMethod === 'sms' || messageMethod === 'both') {
        await fetch('/api/enquiries/send-sms', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            enquiryId: selectedEnquiry.id,
            message: smsMessage.trim(),
            templateKey: 'ENQUIRY_CUSTOM',
          }),
        })
      }
      if (messageMethod === 'email' || messageMethod === 'both') {
        if (selectedEnquiry.customer_email) {
          await fetch('/api/email/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              to: selectedEnquiry.customer_email,
              subject: `New Forest Device Repairs - ${selectedEnquiry.device_make || ''} ${selectedEnquiry.device_model || ''}`,
              message: smsMessage.trim(),
              type: 'CUSTOM',
            }),
          })
        }
      }
      setSmsMessage('')
      setShowMessageComposer(false)
      loadEnquiries()
    } catch (e) {
      console.error('Failed to send message:', e)
    }
    setSendingSms(false)
  }

  const openDetail = (enquiry: Enquiry) => {
    setSelectedEnquiry(enquiry)
    setResponseText(enquiry.staff_notes || '')
    setConvertResult(null)
    setShowMessageComposer(false)
    setShowDetail(true)
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
            {actionNeededCount > 0 && (
              <button
                onClick={() => setStatusFilter('action_needed')}
                className={`px-4 py-2 rounded-lg text-sm font-bold whitespace-nowrap transition-colors ${statusFilter === 'action_needed' ? 'bg-red-600 text-white' : 'bg-red-50 text-red-700'}`}
              >
                Action Needed ({actionNeededCount})
              </button>
            )}
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
                onClick={() => setStatusFilter('accepted')}
                className={`px-4 py-2 rounded-lg text-sm font-bold whitespace-nowrap transition-colors ${statusFilter === 'accepted' ? 'bg-green-600 text-white' : 'bg-green-50 text-green-700'}`}
              >
                Accepted ({acceptedCount})
              </button>
            )}
            {followUpCount > 0 && (
              <button
                onClick={() => setStatusFilter('follow_up')}
                className={`px-4 py-2 rounded-lg text-sm font-bold whitespace-nowrap transition-colors ${statusFilter === 'follow_up' ? 'bg-orange-500 text-white' : 'bg-orange-50 text-orange-700'}`}
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
          <>
            {/* Approved Section - highlighted at top */}
            {filteredEnquiries.filter(e => isActionNeeded(e)).length > 0 && (
              <section className="mb-6">
                <div className="flex items-center gap-2 mb-3 p-3 rounded-xl bg-green-100 dark:bg-green-900/30 border-2 border-green-500">
                  <CheckCircle className="h-6 w-6 text-green-600 dark:text-green-400" />
                  <div className="flex-1">
                    <h2 className="font-black text-lg text-green-700 dark:text-green-400">
                      Approved - Action Needed ({filteredEnquiries.filter(e => isActionNeeded(e)).length})
                    </h2>
                    <p className="text-xs text-green-600 dark:text-green-500">Customer wants this booked in — check stock & convert to job</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {filteredEnquiries.filter(e => isActionNeeded(e)).map((enquiry) => {
                    const typeCfg = TYPE_CONFIG[enquiry.enquiry_type] || TYPE_CONFIG.repair_quote
                    const statusLabel = getStatusLabel(enquiry)
                    const summary = getTileSummary(enquiry)
                    const badge = getTileBadge(enquiry)
                    const TypeIcon = typeCfg.icon

                    return (
                      <button
                        key={enquiry.id}
                        onClick={() => openDetail(enquiry)}
                        className="relative block rounded-xl shadow-md overflow-hidden active:scale-95 transition-all cursor-pointer select-none aspect-square bg-green-50 dark:bg-green-900/20 border-2 border-green-500"
                      >
                        <div className="p-3 h-full flex flex-col">
                          <div className="flex items-center justify-between mb-1">
                            <div className={`flex items-center gap-1.5 ${typeCfg.color}`}>
                              <TypeIcon className="h-4 w-4" />
                              <p className="font-bold text-xs uppercase tracking-wide">{typeCfg.label}</p>
                            </div>
                            {badge && (
                              <span className={`text-[10px] font-black px-1.5 py-0.5 rounded-full text-white ${badge.color}`}>
                                {badge.text}
                              </span>
                            )}
                          </div>
                          <div className="flex-1 flex flex-col justify-center text-center">
                            <p className="text-sm font-bold leading-tight mb-1 truncate text-gray-900 dark:text-white">{enquiry.customer_name}</p>
                            <p className="text-xs font-medium truncate text-gray-500 dark:text-gray-400">{summary}</p>
                            {enquiry.quoted_price != null && (
                              <p className="text-lg font-black mt-1 text-green-700 dark:text-green-400">£{enquiry.quoted_price}</p>
                            )}
                          </div>
                          <div className="flex items-center justify-between text-xs border-t border-green-200 dark:border-green-800 pt-1.5">
                            <span className="font-bold text-green-700 dark:text-green-400">{statusLabel}</span>
                            <span className="text-gray-400 dark:text-gray-500">{fmtDate(enquiry.created_at)}</span>
                          </div>
                        </div>
                      </button>
                    )
                  })}
                </div>
              </section>
            )}

            {/* Standard Inquiries Section */}
            {filteredEnquiries.filter(e => !isActionNeeded(e)).length > 0 && (
              <section>
                {filteredEnquiries.filter(e => isActionNeeded(e)).length > 0 && (
                  <div className="flex items-center gap-2 mb-3 p-3 rounded-xl bg-gray-100 dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700">
                    <Mail className="h-5 w-5 text-gray-500" />
                    <h2 className="font-bold text-sm text-gray-600 dark:text-gray-400">
                      Inquiries ({filteredEnquiries.filter(e => !isActionNeeded(e)).length})
                    </h2>
                  </div>
                )}
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {filteredEnquiries.filter(e => !isActionNeeded(e)).map((enquiry) => {
                    const typeCfg = TYPE_CONFIG[enquiry.enquiry_type] || TYPE_CONFIG.repair_quote
                    const statusLabel = getStatusLabel(enquiry)
                    const summary = getTileSummary(enquiry)
                    const badge = getTileBadge(enquiry)
                    const TypeIcon = typeCfg.icon

                    return (
                      <button
                        key={enquiry.id}
                        onClick={() => openDetail(enquiry)}
                        className="relative block rounded-xl shadow-sm overflow-hidden active:scale-95 transition-all cursor-pointer select-none aspect-square bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 border-l-4 border-l-gray-300"
                      >
                        <div className="p-3 h-full flex flex-col">
                          <div className="flex items-center justify-between mb-1">
                            <div className={`flex items-center gap-1.5 ${typeCfg.color}`}>
                              <TypeIcon className="h-4 w-4" />
                              <p className="font-bold text-xs uppercase tracking-wide">{typeCfg.label}</p>
                            </div>
                            {badge && (
                              <span className={`text-[10px] font-black px-1.5 py-0.5 rounded-full text-white ${badge.color}`}>
                                {badge.text}
                              </span>
                            )}
                          </div>
                          <div className="flex-1 flex flex-col justify-center text-center">
                            <p className="text-sm font-bold leading-tight mb-1 truncate text-gray-900 dark:text-white">{enquiry.customer_name}</p>
                            <p className="text-xs font-medium truncate text-gray-500 dark:text-gray-400">{summary}</p>
                            {enquiry.quoted_price != null && (
                              <p className="text-lg font-black mt-1 text-gray-900 dark:text-white">£{enquiry.quoted_price}</p>
                            )}
                          </div>
                          <div className="flex items-center justify-between text-xs border-t border-gray-100 dark:border-gray-700 pt-1.5">
                            <span className="font-bold text-gray-600 dark:text-gray-400">{statusLabel}</span>
                            <span className="text-gray-400 dark:text-gray-500">{fmtDate(enquiry.created_at)}</span>
                          </div>
                        </div>
                      </button>
                    )
                  })}
                </div>
              </section>
            )}
          </>
        )}
      </main>

      {/* Detail Slide-Up Panel */}
      <SlideUpPanel
        isOpen={showDetail}
        onClose={() => { setShowDetail(false); setConvertResult(null); setShowMessageComposer(false) }}
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

            {/* Status badge + price */}
            <div className="flex items-center gap-2 flex-wrap">
              {(() => {
                const cfg = STATUS_CONFIG[selectedEnquiry.status] || STATUS_CONFIG.pending
                const label = getStatusLabel(selectedEnquiry)
                return <span className={`px-3 py-1.5 rounded-lg text-sm font-bold ${cfg.bg} ${cfg.text}`}>{label}</span>
              })()}
              {selectedEnquiry.enquiry_type === 'repair_quote' && selectedEnquiry.quoted_price != null && (
                <span className="px-3 py-1.5 rounded-lg text-sm font-bold bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400">£{selectedEnquiry.quoted_price}</span>
              )}
              {selectedEnquiry.repair_reserved && (
                <span className="px-3 py-1.5 rounded-lg text-sm font-bold bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400">Reserved</span>
              )}
            </div>

            {/* Conversion success screen */}
            {convertResult ? (
              <div className="text-center py-6 space-y-4">
                <div className="w-16 h-16 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mx-auto">
                  <CheckCircle className="h-8 w-8 text-green-600 dark:text-green-400" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-gray-900 dark:text-white">Job Created!</h3>
                  <p className="text-sm text-gray-500 mt-1">Job ref: <span className="font-mono font-bold">{convertResult.job_ref}</span></p>
                  <p className="text-sm text-gray-500 mt-1">
                    {convertResult.status === 'AWAITING_DEPOSIT' ? 'Parts required · awaiting £20 deposit' : 'In stock · ready to book in'}
                  </p>
                  {convertResult.sms_sent ? (
                    <p className="text-sm text-green-600 dark:text-green-400 mt-2">Customer message sent successfully.</p>
                  ) : (
                    <p className="text-sm text-red-600 dark:text-red-400 mt-2">
                      Job saved, but the customer message was not sent{convertResult.sms_error ? `: ${convertResult.sms_error}` : '.'}
                    </p>
                  )}
                </div>
                <div className="flex gap-3">
                  <Link
                    href={`/app/jobs/${convertResult.job_id}`}
                    className="flex-1 flex items-center justify-center gap-2 py-3 bg-green-600 text-white font-bold rounded-xl hover:bg-green-700 transition-colors active:scale-95"
                  >
                    <ArrowRight className="h-4 w-4" /> View Job
                  </Link>
                  <button
                    onClick={() => { setShowDetail(false); setConvertResult(null) }}
                    className="flex-1 py-3 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 font-bold rounded-xl hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors active:scale-95"
                  >
                    Close
                  </button>
                </div>
              </div>
            ) : showMessageComposer ? (
              /* Message composer */
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-bold text-gray-900 dark:text-white">Send Message</h3>
                  <button
                    onClick={() => setShowMessageComposer(false)}
                    className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>

                {/* Method selector */}
                <div className="grid grid-cols-3 gap-2">
                  {(['sms', 'email', 'both'] as const).map((method) => (
                    <button
                      key={method}
                      onClick={() => setMessageMethod(method)}
                      className={`py-2.5 rounded-lg text-sm font-bold transition-colors ${
                        messageMethod === method
                          ? 'bg-primary text-white'
                          : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300'
                      }`}
                    >
                      {method === 'sms' ? 'Text' : method === 'email' ? 'Email' : 'Both'}
                    </button>
                  ))}
                </div>

                {/* Template picker */}
                <div className="flex items-center justify-between">
                  <p className="text-sm font-bold text-gray-900 dark:text-white">Message</p>
                  <button
                    onClick={() => setShowTemplatePicker(!showTemplatePicker)}
                    className="text-xs font-bold text-primary hover:text-primary-dark"
                  >
                    {showTemplatePicker ? 'Hide' : 'Use Template'}
                  </button>
                </div>

                {showTemplatePicker && (
                  <div className="max-h-40 overflow-y-auto space-y-1">
                    {smsTemplates.map((tpl) => (
                      <button
                        key={tpl.key}
                        onClick={() => applySmsTemplate(tpl.body)}
                        className="w-full text-left p-2.5 bg-gray-50 dark:bg-gray-700/50 rounded-lg text-sm hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                      >
                        <span className="font-bold text-xs text-primary">{tpl.key}</span>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate">{tpl.body}</p>
                      </button>
                    ))}
                  </div>
                )}

                <textarea
                  value={smsMessage}
                  onChange={(e) => setSmsMessage(e.target.value)}
                  placeholder="Type your message..."
                  className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                  rows={5}
                />

                <button
                  onClick={handleSendMessage}
                  disabled={sendingSms || !smsMessage.trim()}
                  className="w-full flex items-center justify-center gap-2 py-3 bg-primary text-white font-bold rounded-xl hover:bg-primary-dark transition-colors active:scale-95 disabled:opacity-50"
                >
                  <Send className="h-4 w-4" />
                  {sendingSms ? 'Sending...' : `Send ${messageMethod === 'both' ? 'Text + Email' : messageMethod === 'sms' ? 'Text' : 'Email'}`}
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Repair details — compact */}
                {selectedEnquiry.enquiry_type === 'repair_quote' && (
                  <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-4 space-y-1.5">
                    <div className="text-sm text-gray-600 dark:text-gray-300 space-y-1">
                      <p className="text-base font-bold text-gray-900 dark:text-white">{selectedEnquiry.device_make} {selectedEnquiry.device_model}</p>
                      <p><span className="font-semibold">Repair:</span> {selectedEnquiry.repair_type}</p>
                      {selectedEnquiry.screen_option && <p><span className="font-semibold">Option:</span> {selectedEnquiry.screen_option}</p>}
                      {selectedEnquiry.quoted_price != null && <p><span className="font-semibold">Price:</span> £{selectedEnquiry.quoted_price}</p>}
                      {selectedEnquiry.quote_type && <p><span className="font-semibold">Type:</span> {selectedEnquiry.quote_type}</p>}
                    </div>
                  </div>
                )}

                {/* Customer info */}
                <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-4 space-y-1">
                  <div className="text-sm text-gray-600 dark:text-gray-300 space-y-1">
                    <p><span className="font-semibold">Name:</span> {selectedEnquiry.customer_name}</p>
                    <p><span className="font-semibold">Phone:</span> {selectedEnquiry.customer_phone || '—'}</p>
                    {selectedEnquiry.customer_email && <p><span className="font-semibold">Email:</span> {selectedEnquiry.customer_email}</p>}
                  </div>
                </div>

                {/* Customer notes */}
                {selectedEnquiry.customer_notes && (
                  <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-3">
                    <p className="text-xs font-bold text-blue-900 dark:text-blue-300 mb-1">Customer Notes</p>
                    <p className="text-sm text-blue-800 dark:text-blue-400 italic">"{selectedEnquiry.customer_notes}"</p>
                  </div>
                )}

                {/* Issue description */}
                {selectedEnquiry.issue_description && (
                  <div>
                    <p className="text-xs font-bold text-gray-500 mb-1">Issue Description</p>
                    <p className="text-sm text-gray-600 dark:text-gray-300 bg-gray-50 dark:bg-gray-700/50 rounded-xl p-3 whitespace-pre-wrap">{selectedEnquiry.issue_description}</p>
                  </div>
                )}

                {/* === MAIN ACTIONS === */}
                {selectedEnquiry.enquiry_type === 'repair_quote' && isAccepted(selectedEnquiry) && (
                  <div className="space-y-3 pt-2">
                    <p className="text-center text-sm font-bold text-gray-700 dark:text-gray-300">Check stock — what do we need?</p>
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        onClick={() => handleConvertToJob('in_stock')}
                        disabled={converting}
                        className="flex flex-col items-center justify-center gap-2 py-6 bg-green-600 text-white font-bold rounded-xl hover:bg-green-700 transition-colors active:scale-95 disabled:opacity-50"
                      >
                        <CheckCircle className="h-7 w-7" />
                        <span className="text-sm">In Stock</span>
                        <span className="text-xs opacity-80">Book in & message →</span>
                      </button>
                      <button
                        onClick={() => handleConvertToJob('parts_needed')}
                        disabled={converting}
                        className="flex flex-col items-center justify-center gap-2 py-6 bg-yellow-500 text-white font-bold rounded-xl hover:bg-yellow-600 transition-colors active:scale-95 disabled:opacity-50"
                      >
                        <Clock className="h-7 w-7" />
                        <span className="text-sm">Need Parts</span>
                        <span className="text-xs opacity-80">Send deposit request →</span>
                      </button>
                    </div>
                  </div>
                )}

                {/* Message button */}
                <button
                  onClick={() => setShowMessageComposer(true)}
                  className="w-full flex items-center justify-center gap-2 py-3 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 font-bold rounded-xl hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors active:scale-95"
                >
                  <MessageSquare className="h-4 w-4" /> Message Customer
                </button>

                {/* Non-repair enquiry actions */}
                {selectedEnquiry.status === 'pending' && selectedEnquiry.enquiry_type !== 'repair_quote' && (
                  <div className="grid grid-cols-2 gap-3">
                    {selectedEnquiry.customer_phone && (
                      <a
                        href={`tel:${selectedEnquiry.customer_phone}`}
                        className="flex items-center justify-center gap-2 py-3 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 transition-colors active:scale-95"
                      >
                        <Phone className="h-4 w-4" /> Call
                      </a>
                    )}
                    <button
                      onClick={() => handleStatusChange(selectedEnquiry.id, 'approved')}
                      className="flex items-center justify-center gap-2 py-3 bg-green-600 text-white font-bold rounded-xl hover:bg-green-700 transition-colors active:scale-95"
                    >
                      <CheckCircle className="h-4 w-4" /> Mark Handled
                    </button>
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
                    {selectedEnquiry.hesitation_reason && <p><span className="font-semibold">Hesitation:</span> {selectedEnquiry.hesitation_reason.replace(/_/g, ' ')}</p>}
                    {selectedEnquiry.customer_budget != null && <p><span className="font-semibold">Budget:</span> £{selectedEnquiry.customer_budget}</p>}
                  </div>
                </details>

                {/* Staff notes */}
                <div>
                  <textarea
                    value={responseText}
                    onChange={(e) => setResponseText(e.target.value)}
                    placeholder="Add staff notes..."
                    className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                    rows={2}
                  />
                  <button
                    onClick={handleRespond}
                    disabled={responding || !responseText.trim()}
                    className="mt-2 w-full flex items-center justify-center gap-2 py-2.5 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 font-bold rounded-xl hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors active:scale-95 disabled:opacity-50 text-sm"
                  >
                    <Send className="h-4 w-4" />
                    {responding ? 'Saving...' : 'Save Notes'}
                  </button>
                </div>
              </div>
            )}

          </div>
        )}
      </SlideUpPanel>
    </div>
  )
}

export default EnquiriesContent
