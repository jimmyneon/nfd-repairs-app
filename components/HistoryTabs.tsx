'use client'

import { useState } from 'react'
import { JobEvent, SMSLog, EmailLog } from '@/lib/types-v3'
import { RefreshCw, MessageSquare, Clock, Mail, StickyNote, ChevronDown, Send, AlertCircle, CheckCircle } from 'lucide-react'

interface HistoryTabsProps {
  events: JobEvent[]
  smsLogs: SMSLog[]
  emailLogs: EmailLog[]
  actionLoading: boolean
  activeTab: 'all' | 'status' | 'messages' | 'notes' | 'emails'
  onTabChange: (tab: 'all' | 'status' | 'messages' | 'notes' | 'emails') => void
  onRetrySms: () => void
}

const fmt = (d: string) => new Date(d).toLocaleString('en-GB')

type IconType = typeof Clock

interface TimelineItem {
  id: string
  date: string
  type: string
  icon: IconType
  iconColor: string
  title: string
  detail?: string
  status?: string
  extra?: string
  retryFn?: () => void
}

export default function HistoryTabs({ events, smsLogs, emailLogs, actionLoading, activeTab, onTabChange, onRetrySms }: HistoryTabsProps) {
  const [expanded, setExpanded] = useState<string | null>(null)

  const items: TimelineItem[] = [
    ...events.map((e) => ({
      id: `evt-${e.id}`,
      date: e.created_at,
      type: e.type,
      icon: e.type === 'STATUS_CHANGE' ? Clock : e.type === 'NOTE' ? StickyNote : MessageSquare,
      iconColor: e.type === 'STATUS_CHANGE' ? 'text-primary' : e.type === 'NOTE' ? 'text-amber-500' : 'text-gray-400',
      title: e.message,
    })),
    ...smsLogs.map((s) => ({
      id: `sms-${s.id}`,
      date: s.created_at,
      type: 'SMS',
      icon: Send,
      iconColor: 'text-blue-500',
      title: s.template_key || 'Custom SMS',
      detail: s.body_rendered,
      status: s.status,
      retryFn: (s.status === 'FAILED' || s.status === 'PENDING') ? onRetrySms : undefined,
    })),
    ...emailLogs.map((em) => ({
      id: `em-${em.id}`,
      date: em.created_at,
      type: 'EMAIL',
      icon: Mail,
      iconColor: 'text-indigo-500',
      title: em.subject || em.template_key || 'Email',
      detail: `To: ${em.recipient_email}`,
      status: em.status,
      extra: em.error_message,
    })),
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

  const toggle = (id: string) => setExpanded(expanded === id ? null : id)

  return (
    <div className="space-y-2">
      {items.length === 0 && <p className="text-sm text-gray-400 text-center py-8">No history yet</p>}
      {items.map((item) => {
        const Icon = item.icon
        const isOpen = expanded === item.id
        const hasDetail = !!item.detail || !!item.extra || !!item.retryFn
        return (
          <div key={item.id} className={`rounded-lg border transition-colors ${isOpen ? 'border-primary/30 bg-primary/5' : 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/50'}`}>
            <button onClick={() => hasDetail ? toggle(item.id) : undefined} className={`w-full flex items-start gap-2.5 p-3 text-left ${hasDetail ? 'cursor-pointer' : 'cursor-default'}`}>
              <Icon className={`h-4 w-4 flex-shrink-0 mt-0.5 ${item.iconColor}`} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-[10px] font-bold uppercase text-gray-400">{item.type.replace('_', ' ')}</span>
                  {item.status && (
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
                      item.status === 'SENT' ? 'bg-green-100 text-green-700' :
                      item.status === 'FAILED' ? 'bg-red-100 text-red-700' :
                      'bg-yellow-100 text-yellow-700'
                    }`}>
                      {item.status === 'SENT' && <CheckCircle className="h-2.5 w-2.5 inline mr-0.5" />}
                      {item.status === 'FAILED' && <AlertCircle className="h-2.5 w-2.5 inline mr-0.5" />}
                      {item.status}
                    </span>
                  )}
                </div>
                <p className="text-sm text-gray-900 dark:text-white line-clamp-2">{item.title}</p>
                <p className="text-xs text-gray-500 mt-0.5">{fmt(item.date)}</p>
              </div>
              {hasDetail && (
                <ChevronDown className={`h-4 w-4 text-gray-400 flex-shrink-0 mt-1 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
              )}
            </button>
            {isOpen && hasDetail && (
              <div className="px-3 pb-3 pl-10 space-y-2">
                {item.detail && (
                  <p className="text-xs text-gray-600 dark:text-gray-300 break-words whitespace-pre-line">{item.detail}</p>
                )}
                {item.extra && (
                  <p className="text-xs text-red-600">Error: {item.extra}</p>
                )}
                {item.retryFn && (
                  <button onClick={item.retryFn} disabled={actionLoading} className="flex items-center gap-1 text-xs px-2.5 py-1 bg-primary text-white rounded-lg hover:bg-primary-dark disabled:opacity-50">
                    <RefreshCw className="h-3 w-3" />
                    Retry
                  </button>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
