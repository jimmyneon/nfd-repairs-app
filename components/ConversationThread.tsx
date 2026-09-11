'use client'

import { useState, useEffect, useCallback } from 'react'
import { ArrowLeft, Send, Phone, Mail, MessageSquare, User, Clock, Search, Inbox, AlertCircle } from 'lucide-react'

export interface ConversationMessage {
  id: string
  phone: string | null
  direction: 'inbound' | 'outbound'
  channel: 'sms' | 'email'
  message: string
  template_key: string | null
  job_id: string | null
  enquiry_id: string | null
  status: string | null
  staff_author: string | null
  created_at: string
  metadata: any
}

interface ConversationThreadProps {
  /** Filter by phone number */
  phone?: string
  /** Filter by job ID */
  jobId?: string
  /** Filter by enquiry ID */
  enquiryId?: string
  /** Compact mode (no header, for embedding in panels) */
  compact?: boolean
  /** Show search bar */
  searchable?: boolean
  /** Auto-refresh interval in ms (0 = disabled) */
  refreshInterval?: number
  /** Called when new messages load */
  onMessagesLoaded?: (messages: ConversationMessage[]) => void
}

export default function ConversationThread({
  phone,
  jobId,
  enquiryId,
  compact = false,
  searchable = false,
  refreshInterval = 0,
  onMessagesLoaded,
}: ConversationThreadProps) {
  const [messages, setMessages] = useState<ConversationMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')

  const loadMessages = useCallback(async () => {
    const params = new URLSearchParams()
    if (phone) params.set('phone', phone)
    if (jobId) params.set('job_id', jobId)
    if (enquiryId) params.set('enquiry_id', enquiryId)
    if (searchQuery) params.set('search', searchQuery)
    params.set('limit', '200')

    try {
      const res = await fetch(`/api/conversations?${params.toString()}`)
      if (!res.ok) throw new Error('Failed to load conversation')
      const data = await res.json()
      // Reverse to oldest-first for chat display
      const sorted = [...(data.messages || [])].reverse()
      setMessages(sorted)
      onMessagesLoaded?.(sorted)
    } catch (err: any) {
      setError(err.message || 'Failed to load conversation')
    } finally {
      setLoading(false)
    }
  }, [phone, jobId, enquiryId, searchQuery, onMessagesLoaded])

  useEffect(() => {
    loadMessages()
  }, [loadMessages])

  useEffect(() => {
    if (refreshInterval > 0) {
      const interval = setInterval(loadMessages, refreshInterval)
      return () => clearInterval(interval)
    }
  }, [refreshInterval, loadMessages])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center gap-2 text-red-600 text-sm py-4">
        <AlertCircle className="h-4 w-4" />
        {error}
      </div>
    )
  }

  if (messages.length === 0) {
    return (
      <div className="text-center py-8">
        <Inbox className="h-8 w-8 text-gray-300 mx-auto mb-2" />
        <p className="text-sm text-gray-400">No messages yet</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {searchable && (
        <div className="relative mb-3">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search messages..."
            className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>
      )}

      <div className="flex-1 overflow-y-auto space-y-2 px-1">
        {messages.map((msg, idx) => {
          const isInbound = msg.direction === 'inbound'
          const prevMsg = messages[idx - 1]
          const showDateSeparator = !prevMsg || !sameDay(prevMsg.created_at, msg.created_at)

          return (
            <div key={msg.id}>
              {showDateSeparator && (
                <div className="flex items-center gap-2 my-3">
                  <div className="flex-1 h-px bg-gray-200 dark:bg-gray-700" />
                  <span className="text-xs text-gray-400 font-medium">
                    {formatDateSeparator(msg.created_at)}
                  </span>
                  <div className="flex-1 h-px bg-gray-200 dark:bg-gray-700" />
                </div>
              )}
              <div className={`flex ${isInbound ? 'justify-start' : 'justify-end'}`}>
                <div
                  className={`max-w-[80%] rounded-2xl px-3.5 py-2.5 ${
                    isInbound
                      ? 'bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white rounded-bl-md'
                      : 'bg-primary text-white rounded-br-md'
                  }`}
                >
                  <div className="flex items-center gap-1.5 mb-1">
                    {msg.channel === 'email' ? (
                      <Mail className="h-3 w-3 opacity-60" />
                    ) : (
                      <MessageSquare className="h-3 w-3 opacity-60" />
                    )}
                    <span className="text-[10px] opacity-60 font-medium">
                      {isInbound ? 'Customer' : (msg.template_key || 'Outbound')}
                    </span>
                    {msg.status === 'FAILED' && (
                      <span className="text-[10px] bg-red-500/20 text-red-600 px-1 rounded">FAILED</span>
                    )}
                  </div>
                  <p className="text-sm whitespace-pre-line break-words">{msg.message}</p>
                  <p className="text-[10px] opacity-50 mt-1 text-right">
                    {formatTime(msg.created_at)}
                  </p>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function sameDay(a: string, b: string): boolean {
  return new Date(a).toDateString() === new Date(b).toDateString()
}

function formatDateSeparator(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  const diffDays = Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24))
  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Yesterday'
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
}
