'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { Search, Home, Inbox, MessageSquare, Mail, ArrowLeft, Send, User, Clock, AlertCircle, RefreshCw } from 'lucide-react'
import Link from 'next/link'
import ConversationThread from '@/components/ConversationThread'

export const dynamic = 'force-dynamic'

interface ConversationSummary {
  phone: string
  customer_name?: string
  last_message: string
  last_direction: 'inbound' | 'outbound'
  last_channel: string
  last_at: string
  last_template_key?: string
  unread_count: number
  job_id?: string
  enquiry_id?: string
  job_ref?: string
  enquiry_ref?: string
  message_count: number
}

export default function MessagesPage() {
  const [conversations, setConversations] = useState<ConversationSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedPhone, setSelectedPhone] = useState<string | null>(null)
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null)
  const [selectedEnquiryId, setSelectedEnquiryId] = useState<string | null>(null)
  const [selectedName, setSelectedName] = useState<string>('')
  const [unreadOnly, setUnreadOnly] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [totalUnread, setTotalUnread] = useState(0)

  const loadConversations = useCallback(async () => {
    try {
      const params = new URLSearchParams()
      if (unreadOnly) params.set('unread_only', '1')
      params.set('limit', '100')
      const res = await fetch(`/api/conversations/inbox?${params.toString()}`)
      if (!res.ok) throw new Error('Failed to load conversations')
      const data = await res.json()
      setConversations(data.conversations || [])
      setTotalUnread(data.total_unread || 0)
    } catch (err: any) {
      setError(err.message || 'Failed to load conversations')
    } finally {
      setLoading(false)
    }
  }, [unreadOnly])

  useEffect(() => {
    loadConversations()
    const interval = setInterval(loadConversations, 30000)
    return () => clearInterval(interval)
  }, [loadConversations])

  const filteredConversations = searchQuery
    ? conversations.filter((c) =>
        c.phone?.includes(searchQuery) ||
        c.customer_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.last_message?.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : conversations

  const handleSelect = (conv: ConversationSummary) => {
    setSelectedPhone(conv.phone)
    setSelectedJobId(conv.job_id || null)
    setSelectedEnquiryId(conv.enquiry_id || null)
    setSelectedName(conv.customer_name || conv.phone)
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
        {/* Header */}
        <header className="bg-white dark:bg-gray-800 shadow-sm sticky top-0 z-10">
          <div className="px-4 py-3">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                <Link href="/app/jobs" className="w-10 h-10 flex items-center justify-center rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
                  <Home className="h-5 w-5 text-primary" />
                </Link>
                <h1 className="text-xl font-bold text-gray-900 dark:text-white">Messages</h1>
                {totalUnread > 0 && (
                  <span className="bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                    {totalUnread} unread
                  </span>
                )}
              </div>
              <button
                onClick={loadConversations}
                className="w-10 h-10 flex items-center justify-center rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              >
                <RefreshCw className="h-5 w-5 text-gray-500" />
              </button>
            </div>

            {/* Search + filter */}
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search by name, phone, or message..."
                  className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
              <button
                onClick={() => setUnreadOnly(!unreadOnly)}
                className={`px-3 py-2 text-sm font-bold rounded-lg whitespace-nowrap transition-colors ${
                  unreadOnly
                    ? 'bg-primary text-white'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300'
                }`}
              >
                Unread only
              </button>
            </div>
          </div>
        </header>

        {/* Main content: split view on desktop, stacked on mobile */}
        <div className="flex flex-col md:flex-row md:h-[calc(100vh-120px)]">
          {/* Conversation list */}
          <div className={`md:w-80 md:border-r border-gray-200 dark:border-gray-700 overflow-y-auto ${selectedPhone ? 'hidden md:block' : 'block'}`}>
            {loading && (
              <div className="flex items-center justify-center py-12">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
              </div>
            )}
            {error && (
              <div className="flex items-center gap-2 text-red-600 text-sm p-4">
                <AlertCircle className="h-4 w-4" />
                {error}
              </div>
            )}
            {!loading && filteredConversations.length === 0 && (
              <div className="text-center py-12">
                <Inbox className="h-10 w-10 text-gray-300 mx-auto mb-2" />
                <p className="text-sm text-gray-400">No conversations found</p>
              </div>
            )}
            {filteredConversations.map((conv) => (
              <button
                key={conv.phone}
                onClick={() => handleSelect(conv)}
                className={`w-full text-left p-3 border-b border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors ${
                  selectedPhone === conv.phone ? 'bg-primary/5 border-l-4 border-l-primary' : ''
                }`}
              >
                <div className="flex items-start gap-2">
                  <div className="flex-shrink-0 mt-0.5">
                    {conv.unread_count > 0 ? (
                      <div className="w-8 h-8 rounded-full bg-red-500 flex items-center justify-center">
                        <span className="text-white text-xs font-bold">{conv.unread_count}</span>
                      </div>
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-600 flex items-center justify-center">
                        <User className="h-4 w-4 text-gray-500" />
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1">
                      <p className="text-sm font-bold text-gray-900 dark:text-white truncate">
                        {conv.customer_name || conv.phone}
                      </p>
                      <span className="text-[10px] text-gray-400 whitespace-nowrap">
                        {formatRelative(conv.last_at)}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 truncate">
                      {conv.last_direction === 'inbound' ? '← ' : '→ '}
                      {conv.last_message}
                    </p>
                    <div className="flex items-center gap-1.5 mt-1">
                      {conv.last_channel === 'email' ? (
                        <Mail className="h-3 w-3 text-gray-400" />
                      ) : (
                        <MessageSquare className="h-3 w-3 text-gray-400" />
                      )}
                      {conv.job_ref && (
                        <Link
                          href={`/app/jobs/${conv.job_id}`}
                          className="text-[10px] text-primary font-medium hover:underline"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {conv.job_ref}
                        </Link>
                      )}
                      {conv.enquiry_ref && (
                        <span className="text-[10px] text-gray-400">
                          {conv.enquiry_ref}
                        </span>
                      )}
                      <span className="text-[10px] text-gray-400">
                        · {conv.message_count} msg{conv.message_count !== 1 ? 's' : ''}
                      </span>
                    </div>
                  </div>
                </div>
              </button>
            ))}
          </div>

          {/* Conversation thread */}
          <div className={`flex-1 flex flex-col ${selectedPhone ? 'block' : 'hidden md:block'}`}>
            {selectedPhone ? (
              <>
                <div className="flex items-center gap-3 p-3 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
                  <button
                    onClick={() => { setSelectedPhone(null); setSelectedJobId(null); setSelectedEnquiryId(null) }}
                    className="md:hidden w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
                  >
                    <ArrowLeft className="h-5 w-5 text-gray-500" />
                  </button>
                  <div className="flex-1">
                    <p className="font-bold text-gray-900 dark:text-white">{selectedName}</p>
                    <p className="text-xs text-gray-500">{selectedPhone}</p>
                  </div>
                  {selectedJobId && (
                    <Link
                      href={`/app/jobs/${selectedJobId}`}
                      className="text-xs px-3 py-1.5 bg-primary text-white rounded-lg font-bold hover:bg-primary-dark"
                    >
                      View Job
                    </Link>
                  )}
                </div>
                <div className="flex-1 overflow-hidden p-3">
                  <ConversationThread
                    phone={selectedPhone}
                    jobId={selectedJobId || undefined}
                    enquiryId={selectedEnquiryId || undefined}
                    refreshInterval={10000}
                  />
                </div>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center">
                <div className="text-center">
                  <MessageSquare className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                  <p className="text-sm text-gray-400">Select a conversation to view messages</p>
                </div>
              </div>
            )}
          </div>
        </div>
    </div>
  )
}

function formatRelative(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  const diffMin = Math.floor((now.getTime() - d.getTime()) / (1000 * 60))
  if (diffMin < 1) return 'now'
  if (diffMin < 60) return `${diffMin}m`
  const diffHrs = Math.floor(diffMin / 60)
  if (diffHrs < 24) return `${diffHrs}h`
  const diffDays = Math.floor(diffHrs / 24)
  if (diffDays === 1) return 'yesterday'
  if (diffDays < 7) return `${diffDays}d`
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}
