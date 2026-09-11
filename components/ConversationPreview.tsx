'use client'

import { useState, useEffect } from 'react'
import { MessageSquare, Mail, ChevronDown, ChevronUp, Clock } from 'lucide-react'

interface ConversationPreviewProps {
  phone: string
  /** Max messages to show (default 5) */
  maxMessages?: number
}

interface Message {
  id: string
  direction: 'inbound' | 'outbound'
  channel: string
  message: string
  template_key: string | null
  created_at: string
}

/**
 * Compact preview of recent conversation messages for a phone number.
 * Used on the job creation page to give staff context about prior contact.
 */
export default function ConversationPreview({ phone, maxMessages = 5 }: ConversationPreviewProps) {
  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading] = useState(false)
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    if (!phone || phone.replace(/\D/g, '').length < 7) {
      setMessages([])
      return
    }

    let cancelled = false
    setLoading(true)

    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/conversations?phone=${encodeURIComponent(phone)}&limit=${maxMessages}`)
        if (!res.ok) return
        const data = await res.json()
        if (!cancelled) {
          setMessages(data.messages || [])
        }
      } catch (e) {
        // Silent fail
      } finally {
        if (!cancelled) setLoading(false)
      }
    }, 400) // debounce

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [phone, maxMessages])

  if (loading || messages.length === 0) return null

  const shown = expanded ? messages : messages.slice(0, 3)
  const hasMore = messages.length > 3

  return (
    <div className="mt-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-3">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          <MessageSquare className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
          <p className="text-xs font-bold text-amber-900 dark:text-amber-300">
            Previous conversation ({messages.length})
          </p>
        </div>
        {hasMore && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-xs text-amber-700 dark:text-amber-400 font-medium flex items-center gap-0.5"
          >
            {expanded ? (
              <>Show less <ChevronUp className="h-3 w-3" /></>
            ) : (
              <>Show all {messages.length} <ChevronDown className="h-3 w-3" /></>
            )}
          </button>
        )}
      </div>
      <div className="space-y-1.5">
        {shown.map((msg) => (
          <div key={msg.id} className="flex gap-2">
            <span className={`text-xs font-bold flex-shrink-0 ${msg.direction === 'inbound' ? 'text-amber-700 dark:text-amber-400' : 'text-gray-500'}`}>
              {msg.direction === 'inbound' ? '←' : '→'}
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-gray-700 dark:text-gray-300 line-clamp-2 whitespace-pre-line">
                {msg.message}
              </p>
              <p className="text-[10px] text-gray-400 mt-0.5 flex items-center gap-1">
                <Clock className="h-2.5 w-2.5" />
                {new Date(msg.created_at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                {msg.template_key && ` · ${msg.template_key}`}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
