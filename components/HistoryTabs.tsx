'use client'

import { JobEvent, SMSLog, EmailLog } from '@/lib/types-v3'
import { RefreshCw, MessageSquare, Clock, Mail, Activity, StickyNote } from 'lucide-react'

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

export default function HistoryTabs({ events, smsLogs, emailLogs, actionLoading, activeTab, onTabChange, onRetrySms }: HistoryTabsProps) {
  const statusEvents = events.filter((e) => e.type === 'STATUS_CHANGE')
  const noteEvents = events.filter((e) => e.type === 'NOTE')

  const tabs = [
    { key: 'all' as const, label: 'All', icon: Activity, count: events.length + smsLogs.length + emailLogs.length },
    { key: 'status' as const, label: 'Status', icon: Clock, count: statusEvents.length },
    { key: 'messages' as const, label: 'Messages', icon: MessageSquare, count: smsLogs.length },
    { key: 'notes' as const, label: 'Notes', icon: StickyNote, count: noteEvents.length },
    { key: 'emails' as const, label: 'Emails', icon: Mail, count: emailLogs.length },
  ]

  return (
    <div className="space-y-4">
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {tabs.map((tab) => {
          const Icon = tab.icon
          const isActive = activeTab === tab.key
          return (
            <button key={tab.key} onClick={() => onTabChange(tab.key)} className={`flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-lg whitespace-nowrap transition-colors ${isActive ? 'bg-primary text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'}`}>
              <Icon className="h-3.5 w-3.5" />
              {tab.label}
              {tab.count > 0 && <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${isActive ? 'bg-white/20' : 'bg-gray-200 dark:bg-gray-600'}`}>{tab.count}</span>}
            </button>
          )
        })}
      </div>
      <div className="space-y-3">
        {activeTab === 'all' && (
          <>
            {events.length === 0 && smsLogs.length === 0 && emailLogs.length === 0 && <p className="text-sm text-gray-400 text-center py-8">No history yet</p>}
            {events.map((event) => (
              <div key={event.id} className="border-l-2 border-primary pl-3 py-1">
                <div className="flex items-center gap-1.5 mb-0.5">
                  {event.type === 'STATUS_CHANGE' && <Clock className="h-3 w-3 text-primary" />}
                  {event.type === 'NOTE' && <StickyNote className="h-3 w-3 text-amber-500" />}
                  {event.type === 'SYSTEM' && <Activity className="h-3 w-3 text-gray-400" />}
                  <span className="text-[10px] font-bold uppercase text-gray-400">{event.type.replace('_', ' ')}</span>
                </div>
                <p className="text-sm font-medium text-gray-900 dark:text-white">{event.message}</p>
                <p className="text-xs text-gray-500">{fmt(event.created_at)}</p>
              </div>
            ))}
            {smsLogs.map((sms) => (
              <SmsCard key={sms.id} sms={sms} actionLoading={actionLoading} onRetry={onRetrySms} />
            ))}
            {emailLogs.map((email) => (
              <EmailCard key={email.id} email={email} />
            ))}
          </>
        )}
        {activeTab === 'status' && (
          <>
            {statusEvents.length === 0 ? <p className="text-sm text-gray-400 text-center py-8">No status updates yet</p> : statusEvents.map((event) => (
              <div key={event.id} className="border-l-2 border-primary pl-3 py-1">
                <p className="text-sm font-medium text-gray-900 dark:text-white">{event.message}</p>
                <p className="text-xs text-gray-500">{fmt(event.created_at)}</p>
              </div>
            ))}
          </>
        )}
        {activeTab === 'messages' && (
          <>
            {smsLogs.length === 0 ? <p className="text-sm text-gray-400 text-center py-8">No messages sent yet</p> : smsLogs.map((sms) => (
              <SmsCard key={sms.id} sms={sms} actionLoading={actionLoading} onRetry={onRetrySms} />
            ))}
          </>
        )}
        {activeTab === 'notes' && (
          <>
            {noteEvents.length === 0 ? <p className="text-sm text-gray-400 text-center py-8">No notes yet</p> : noteEvents.map((event) => (
              <div key={event.id} className="bg-amber-50 dark:bg-amber-900/20 border-l-2 border-amber-400 pl-3 py-2 rounded-r-lg">
                <p className="text-sm text-gray-900 dark:text-white">{event.message}</p>
                <p className="text-xs text-gray-500 mt-0.5">{fmt(event.created_at)}</p>
              </div>
            ))}
          </>
        )}
        {activeTab === 'emails' && (
          <>
            {emailLogs.length === 0 ? <p className="text-sm text-gray-400 text-center py-8">No emails sent yet</p> : emailLogs.map((email) => (
              <EmailCard key={email.id} email={email} />
            ))}
          </>
        )}
      </div>
    </div>
  )
}

function SmsCard({ sms, actionLoading, onRetry }: { sms: SMSLog; actionLoading: boolean; onRetry: () => void }) {
  return (
    <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-2.5 text-sm">
      <div className="flex items-center justify-between mb-1">
        <span className="font-medium text-gray-700 dark:text-gray-300">{sms.template_key}</span>
        <div className="flex items-center gap-2">
          <span className={`text-xs px-2 py-0.5 rounded ${sms.status === 'SENT' ? 'bg-green-100 text-green-800' : sms.status === 'FAILED' ? 'bg-red-100 text-red-800' : 'bg-yellow-100 text-yellow-800'}`}>{sms.status}</span>
          {(sms.status === 'FAILED' || sms.status === 'PENDING') && (
            <button onClick={onRetry} disabled={actionLoading} className="text-xs px-2 py-0.5 bg-primary text-white rounded hover:bg-primary-dark disabled:opacity-50" title="Retry SMS">
              <RefreshCw className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>
      <p className="text-gray-600 dark:text-gray-300 text-xs break-words">{sms.body_rendered}</p>
      <p className="text-gray-400 text-xs mt-1">{fmt(sms.created_at)}</p>
    </div>
  )
}

function EmailCard({ email }: { email: EmailLog }) {
  return (
    <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-2.5 text-sm">
      <div className="flex items-center justify-between mb-1">
        <span className="font-medium text-gray-700 dark:text-gray-300">{email.template_key}</span>
        <span className={`text-xs px-2 py-0.5 rounded ${email.status === 'SENT' ? 'bg-green-100 text-green-800' : email.status === 'FAILED' ? 'bg-red-100 text-red-800' : 'bg-yellow-100 text-yellow-800'}`}>{email.status}</span>
      </div>
      <p className="text-gray-700 dark:text-gray-300 font-medium text-xs mb-0.5">{email.subject}</p>
      <p className="text-gray-600 dark:text-gray-400 text-xs">To: {email.recipient_email}</p>
      <p className="text-gray-400 text-xs mt-1">{fmt(email.created_at)}</p>
      {email.error_message && <p className="text-red-600 text-xs mt-0.5">Error: {email.error_message}</p>}
    </div>
  )
}
