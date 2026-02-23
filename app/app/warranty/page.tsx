'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { Search, AlertTriangle, ArrowLeft, Clock, CheckCircle, XCircle, Settings } from 'lucide-react'
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
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    loadTickets()

    const subscription = supabase
      .channel('warranty-tickets-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'warranty_tickets' }, () => {
        loadTickets()
      })
      .subscribe()

    return () => {
      subscription.unsubscribe()
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

  const newTicketsCount = tickets.filter(t => t.status === 'NEW').length
  const needsAttentionCount = tickets.filter(t => t.status === 'NEEDS_ATTENTION').length

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm sticky top-0 z-10">
        <div className="px-4 py-3">
          <Link href="/app/jobs" className="inline-flex items-center text-primary mb-3">
            <ArrowLeft className="h-5 w-5 mr-2" />
            Back to Jobs
          </Link>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                <AlertTriangle className="h-6 w-6 text-orange-500" />
                Warranty Tickets
              </h1>
              <p className="text-sm text-gray-600 mt-1">
                {newTicketsCount > 0 && (
                  <span className="text-red-600 font-semibold">{newTicketsCount} new</span>
                )}
                {newTicketsCount > 0 && needsAttentionCount > 0 && <span className="mx-1">•</span>}
                {needsAttentionCount > 0 && (
                  <span className="text-orange-600 font-semibold">{needsAttentionCount} need attention</span>
                )}
                {newTicketsCount === 0 && needsAttentionCount === 0 && (
                  <span className="text-gray-500">All tickets handled</span>
                )}
              </p>
            </div>
            <Link href="/app/settings" className="p-2 hover:bg-gray-100 rounded-lg">
              <Settings className="h-5 w-5 text-gray-600" />
            </Link>
          </div>

          {/* Search */}
          <div className="relative mb-3">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search tickets..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
            />
          </div>

          {/* Status Filter */}
          <div className="flex gap-2 overflow-x-auto pb-2">
            <button
              onClick={() => setStatusFilter('ALL')}
              className={`px-3 py-1 rounded-full text-sm font-medium whitespace-nowrap ${
                statusFilter === 'ALL'
                  ? 'bg-primary text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              All ({tickets.length})
            </button>
            <button
              onClick={() => setStatusFilter('NEW')}
              className={`px-3 py-1 rounded-full text-sm font-medium whitespace-nowrap ${
                statusFilter === 'NEW'
                  ? 'bg-red-500 text-white'
                  : 'bg-red-100 text-red-700 hover:bg-red-200'
              }`}
            >
              New ({newTicketsCount})
            </button>
            <button
              onClick={() => setStatusFilter('NEEDS_ATTENTION')}
              className={`px-3 py-1 rounded-full text-sm font-medium whitespace-nowrap ${
                statusFilter === 'NEEDS_ATTENTION'
                  ? 'bg-orange-500 text-white'
                  : 'bg-orange-100 text-orange-700 hover:bg-orange-200'
              }`}
            >
              Needs Attention ({needsAttentionCount})
            </button>
            <button
              onClick={() => setStatusFilter('IN_PROGRESS')}
              className={`px-3 py-1 rounded-full text-sm font-medium whitespace-nowrap ${
                statusFilter === 'IN_PROGRESS'
                  ? 'bg-blue-500 text-white'
                  : 'bg-blue-100 text-blue-700 hover:bg-blue-200'
              }`}
            >
              In Progress
            </button>
            <button
              onClick={() => setStatusFilter('RESOLVED')}
              className={`px-3 py-1 rounded-full text-sm font-medium whitespace-nowrap ${
                statusFilter === 'RESOLVED'
                  ? 'bg-green-500 text-white'
                  : 'bg-green-100 text-green-700 hover:bg-green-200'
              }`}
            >
              Resolved
            </button>
          </div>
        </div>
      </header>

      {/* Tickets List */}
      <main className="p-4">
        {filteredTickets.length === 0 ? (
          <div className="text-center py-12">
            <AlertTriangle className="h-12 w-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500">
              {searchTerm || statusFilter !== 'ALL' ? 'No tickets match your filters' : 'No warranty tickets yet'}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredTickets.map((ticket) => (
              <Link
                key={ticket.id}
                href={`/app/warranty/${ticket.id}`}
                className="block bg-white rounded-lg shadow-sm border border-gray-200 p-4 hover:shadow-md transition-shadow"
              >
                {/* Header */}
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-semibold text-gray-900">{ticket.ticket_ref}</span>
                      <span className={`text-xs px-2 py-1 rounded-full border ${STATUS_COLORS[ticket.status]}`}>
                        {STATUS_LABELS[ticket.status]}
                      </span>
                      {ticket.match_confidence !== 'none' && (
                        <span className={`text-xs px-2 py-1 rounded-full ${CONFIDENCE_COLORS[ticket.match_confidence as keyof typeof CONFIDENCE_COLORS]}`}>
                          {CONFIDENCE_LABELS[ticket.match_confidence as keyof typeof CONFIDENCE_LABELS]}
                        </span>
                      )}
                    </div>
                    <div className="text-sm text-gray-600">
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
                <p className="text-sm text-gray-700 mb-3 line-clamp-2">
                  {ticket.issue_description}
                </p>

                {/* Metadata */}
                <div className="flex items-center gap-3 text-xs text-gray-500">
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
