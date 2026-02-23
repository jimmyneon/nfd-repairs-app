'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { Search, AlertTriangle, ArrowLeft, Clock, CheckCircle, Settings, ChevronDown, Bell, MessageSquare, Plus, Shield } from 'lucide-react'
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
  job_reference: string | null
  device_model: string | null
  issue_description: string
  issue_category: string | null
  status: 'NEW' | 'NEEDS_ATTENTION' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED'
  created_at: string
}

const STATUS_LABELS = {
  NEW: 'New',
  NEEDS_ATTENTION: 'Needs Attention',
  IN_PROGRESS: 'In Progress',
  RESOLVED: 'Resolved',
  CLOSED: 'Closed'
}

const STATUS_COLORS = {
  NEW: 'bg-red-100 text-red-800 border-red-200',
  NEEDS_ATTENTION: 'bg-orange-100 text-orange-800 border-orange-200',
  IN_PROGRESS: 'bg-blue-100 text-blue-800 border-blue-200',
  RESOLVED: 'bg-green-100 text-green-800 border-green-200',
  CLOSED: 'bg-gray-100 text-gray-800 border-gray-200'
}

const CONFIDENCE_LABELS = {
  high: 'High Match',
  medium: 'Medium Match',
  low: 'Low Match',
  none: 'No Match'
}

const CONFIDENCE_COLORS = {
  high: 'bg-green-100 text-green-800',
  medium: 'bg-yellow-100 text-yellow-800',
  low: 'bg-orange-100 text-orange-800',
  none: 'bg-gray-100 text-gray-800'
}

export default function WarrantyTicketsPage() {
  const [tickets, setTickets] = useState<WarrantyTicket[]>([])
  const [filteredTickets, setFilteredTickets] = useState<WarrantyTicket[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('ALL')
  const [showFilterModal, setShowFilterModal] = useState(false)
  const [unreadCount, setUnreadCount] = useState(0)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    if (showFilterModal) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = 'unset'
    }
    return () => {
      document.body.style.overflow = 'unset'
    }
  }, [showFilterModal])

  useEffect(() => {
    loadTickets()
    loadUnreadNotifications()

    const subscription = supabase
      .channel('warranty-tickets-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'warranty_tickets' }, () => {
        loadTickets()
      })
      .subscribe()

    const notificationsSubscription = supabase
      .channel('notifications-changes')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications' }, () => {
        loadUnreadNotifications()
      })
      .subscribe()

    return () => {
      subscription.unsubscribe()
      notificationsSubscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    let filtered = tickets

    if (statusFilter !== 'ALL') {
      filtered = filtered.filter(ticket => ticket.status === statusFilter)
    }

    if (searchTerm) {
      const search = searchTerm.toLowerCase()
      filtered = filtered.filter(ticket =>
        ticket.ticket_ref.toLowerCase().includes(search) ||
        ticket.customer_name.toLowerCase().includes(search) ||
        ticket.customer_phone.toLowerCase().includes(search) ||
        ticket.issue_description.toLowerCase().includes(search) ||
        (ticket.job_reference && ticket.job_reference.toLowerCase().includes(search)) ||
        (ticket.device_model && ticket.device_model.toLowerCase().includes(search))
      )
    }

    setFilteredTickets(filtered)
  }, [tickets, statusFilter, searchTerm])

  const loadTickets = async () => {
    const { data, error } = await supabase
      .from('warranty_tickets')
      .select('*')
      .order('created_at', { ascending: false })

    if (!error && data) {
      setTickets(data)
    }
    setLoading(false)
  }

  const loadUnreadNotifications = async () => {
    const { count } = await supabase
      .from('notifications')
      .select('*', { count: 'exact', head: true })
      .eq('is_read', false)

    setUnreadCount(count || 0)
  }

  const newTicketsCount = tickets.filter(t => t.status === 'NEW').length
  const needsAttentionCount = tickets.filter(t => t.status === 'NEEDS_ATTENTION').length

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    )
  }

  const statusOptions = ['ALL', 'NEW', 'NEEDS_ATTENTION', 'IN_PROGRESS', 'RESOLVED', 'CLOSED']

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <header className="bg-white dark:bg-gray-800 shadow-sm sticky top-0 z-10">
        <div className="px-4 py-3">
          <div className="flex items-center justify-between mb-3">
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">Warranty Tickets</h1>
            <div className="flex items-center space-x-3">
              <Link href="/app/jobs/create" className="text-gray-600 hover:text-primary" title="Create New Job">
                <Plus className="h-6 w-6" />
              </Link>
              <Link href="/app/jobs" className="text-gray-600 hover:text-primary" title="Repair Jobs">
                <Shield className="h-6 w-6" />
              </Link>
              <Link href="/app/templates" className="text-gray-600 hover:text-primary">
                <MessageSquare className="h-6 w-6" />
              </Link>
              <Link href="/app/notifications" className="relative text-gray-600 hover:text-primary">
                <Bell className="h-6 w-6" />
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center">
                    {unreadCount}
                  </span>
                )}
              </Link>
              <Link href="/app/settings" className="text-gray-600 hover:text-primary">
                <Settings className="h-6 w-6" />
              </Link>
            </div>
          </div>

          {/* Search */}
          <div className="relative mb-3">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search tickets..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full h-14 pl-10 pr-4 border border-gray-300 dark:border-gray-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            />
          </div>

          {/* Filter Button */}
          <button
            onClick={() => setShowFilterModal(true)}
            className="w-full h-14 bg-primary text-white px-4 rounded-xl font-bold hover:bg-primary-dark transition-colors flex items-center justify-between mb-3 shadow-md"
          >
            <span>Filter: {statusFilter === 'ALL' ? 'All Tickets' : statusFilter.replace('_', ' ')}</span>
            <ChevronDown className="h-5 w-5" />
          </button>
        </div>
      </header>

      {/* Filter Modal */}
      {showFilterModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl max-w-md w-full p-6 shadow-2xl max-h-[80vh] overflow-y-auto">
            <h2 className="text-2xl font-black text-gray-900 dark:text-white mb-4">Filter Tickets</h2>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">Select a status to filter:</p>
            
            <div className="space-y-2">
              {statusOptions.map((status) => {
                const isActive = statusFilter === status
                const counts = {
                  ALL: tickets.length,
                  NEW: newTicketsCount,
                  NEEDS_ATTENTION: needsAttentionCount,
                  IN_PROGRESS: tickets.filter(t => t.status === 'IN_PROGRESS').length,
                  RESOLVED: tickets.filter(t => t.status === 'RESOLVED').length,
                  CLOSED: tickets.filter(t => t.status === 'CLOSED').length
                }
                
                return (
                  <button
                    key={status}
                    onClick={() => {
                      setStatusFilter(status)
                      setShowFilterModal(false)
                    }}
                    className={`w-full text-left px-4 py-3 rounded-xl font-bold transition-colors ${
                      isActive
                        ? 'bg-primary text-white'
                        : 'bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-gray-600'
                    }`}
                  >
                    {status === 'ALL' ? 'All Tickets' : status.replace('_', ' ')} ({counts[status as keyof typeof counts]})
                  </button>
                )
              })}
            </div>
            
            <button
              onClick={() => setShowFilterModal(false)}
              className="w-full mt-4 px-4 py-3 bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white rounded-xl font-bold hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* Tickets List */}
      <main className="p-4">
        {filteredTickets.length === 0 ? (
          <div className="text-center py-12">
            <AlertTriangle className="h-12 w-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 dark:text-gray-400">
              {searchTerm || statusFilter !== 'ALL' ? 'No tickets match your filters' : 'No warranty tickets yet'}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredTickets.map((ticket) => (
              <Link
                key={ticket.id}
                href={`/app/warranty/${ticket.id}`}
                className="block bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4 hover:shadow-md transition-shadow"
              >
                {/* Header */}
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-semibold text-gray-900 dark:text-white">{ticket.ticket_ref}</span>
                      <span className={`text-xs px-2 py-1 rounded-full border ${STATUS_COLORS[ticket.status]}`}>
                        {STATUS_LABELS[ticket.status]}
                      </span>
                      {ticket.match_confidence !== 'none' && (
                        <span className={`text-xs px-2 py-1 rounded-full ${CONFIDENCE_COLORS[ticket.match_confidence as keyof typeof CONFIDENCE_COLORS]}`}>
                          {CONFIDENCE_LABELS[ticket.match_confidence as keyof typeof CONFIDENCE_LABELS]}
                        </span>
                      )}
                    </div>
                    <div className="text-sm text-gray-600 dark:text-gray-400">
                      <span className="font-medium">{ticket.customer_name}</span>
                      <span className="mx-1">•</span>
                      <span>{ticket.customer_phone}</span>
                    </div>
                  </div>
                  {ticket.status === 'NEW' && (
                    <span className="w-3 h-3 bg-red-500 rounded-full flex-shrink-0"></span>
                  )}
                </div>

                {/* Issue */}
                <p className="text-sm text-gray-700 dark:text-gray-300 mb-3 line-clamp-2">
                  {ticket.issue_description}
                </p>

                {/* Metadata */}
                <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
                  {ticket.job_reference && (
                    <span className="flex items-center gap-1">
                      <CheckCircle className="h-3 w-3" />
                      Job: {ticket.job_reference}
                    </span>
                  )}
                  {ticket.device_model && (
                    <span>{ticket.device_model}</span>
                  )}
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {new Date(ticket.submitted_at).toLocaleDateString('en-GB')}
                  </span>
                  <span className="ml-auto capitalize">{ticket.source}</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
