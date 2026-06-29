'use client'

import { useState } from 'react'
import { X, Send, Mail, Phone, Plus, DollarSign, FileText, Link as LinkIcon, Clock } from 'lucide-react'
import { Job } from '@/lib/types-v3'

interface CustomSmsComposerProps {
  job: Job
  onClose: () => void
  onSent?: () => void
}

export default function CustomSmsComposer({ job, onClose, onSent }: CustomSmsComposerProps) {
  const [message, setMessage] = useState('')
  const [sendEmailToo, setSendEmailToo] = useState(false)
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState<{ success: boolean; smsStatus?: string; emailStatus?: string } | null>(null)

  const appUrl = 'https://nfd-repairs-app.vercel.app'
  const trackingUrl = `${appUrl}/t/${job.tracking_token}`
  const charCount = message.length
  const maxSmsChars = 1600

  const insertText = (text: string) => {
    setMessage((prev) => {
      if (prev && !prev.endsWith('\n')) {
        return prev + '\n' + text
      }
      return (prev || '') + text
    })
  }

  const insertPrice = () => {
    if (job.price_total) {
      insertText(`Total: £${job.price_total.toFixed(2)}`)
    }
  }

  const insertDiagnosticReport = () => {
    if (job.diagnostic_report) {
      insertText(`\nDiagnostic report:\n${job.diagnostic_report}\n`)
    }
  }

  const insertTrackingLink = () => {
    insertText(`Track your repair: ${trackingUrl}`)
  }

  const insertHoursLink = () => {
    insertText('Opening times: https://maps.app.goo.gl/oVczouUePXkRbrKb7')
  }

  const insertGreeting = () => {
    const firstName = job.customer_name?.trim().split(' ')[0] || 'there'
    setMessage((prev) => `Hi ${firstName}, ${prev}`)
  }

  const handleSend = async () => {
    if (!message.trim() || sending) return
    setSending(true)
    setResult(null)

    try {
      const response = await fetch('/api/sms/send-custom', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jobId: job.id,
          message: message.trim(),
          sendEmail: sendEmailToo,
        }),
      })

      const data = await response.json()
      setResult(data)

      if (data.success) {
        onSent?.()
        setTimeout(() => {
          onClose()
        }, 1500)
      }
    } catch (error) {
      console.error('Failed to send custom SMS:', error)
      setResult({ success: false, smsStatus: 'FAILED' })
    }

    setSending(false)
  }

  const quickInsertButtons = [
    { label: 'Greeting', icon: Plus, onClick: insertGreeting, show: true },
    { label: 'Price', icon: DollarSign, onClick: insertPrice, show: !!job.price_total },
    { label: 'Diagnostic', icon: FileText, onClick: insertDiagnosticReport, show: !!job.diagnostic_report },
    { label: 'Tracking', icon: LinkIcon, onClick: insertTrackingLink, show: true },
    { label: 'Hours', icon: Clock, onClick: insertHoursLink, show: true },
  ].filter((b) => b.show)

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-800 rounded-xl max-w-lg w-full shadow-xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Send Message</h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Recipient info */}
        <div className="px-4 py-3 bg-gray-50 dark:bg-gray-900/50 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
            <Phone className="h-4 w-4" />
            <span className="font-medium text-gray-900 dark:text-white">{job.customer_name}</span>
            <span>·</span>
            <span>{job.customer_phone}</span>
          </div>
          {sendEmailToo && job.customer_email && (
            <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 mt-1">
              <Mail className="h-4 w-4" />
              <span>{job.customer_email}</span>
            </div>
          )}
        </div>

        {/* Quick insert buttons */}
        <div className="px-4 py-2 border-b border-gray-200 dark:border-gray-700">
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">Quick insert:</p>
          <div className="flex flex-wrap gap-2">
            {quickInsertButtons.map((btn) => {
              const Icon = btn.icon
              return (
                <button
                  key={btn.label}
                  onClick={btn.onClick}
                  className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                >
                  <Icon className="h-3.5 w-3.5" />
                  {btn.label}
                </button>
              )
            })}
          </div>
        </div>

        {/* Text editor */}
        <div className="p-4">
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Type your message here..."
            rows={8}
            maxLength={maxSmsChars}
            className="w-full p-3 text-sm text-gray-900 dark:text-white bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg resize-none focus:ring-2 focus:ring-primary focus:border-transparent outline-none"
            autoFocus
          />
          <div className="flex items-center justify-between mt-1">
            <p className={`text-xs ${charCount > 160 ? 'text-amber-600' : 'text-gray-400'}`}>
              {charCount} characters{charCount > 160 && ` · ${Math.ceil(charCount / 160)} SMS parts`}
            </p>
          </div>

          {/* Email toggle */}
          {job.customer_email && (
            <label className="flex items-center gap-2 mt-3 cursor-pointer">
              <input
                type="checkbox"
                checked={sendEmailToo}
                onChange={(e) => setSendEmailToo(e.target.checked)}
                className="w-4 h-4 rounded text-primary focus:ring-primary"
              />
              <span className="text-sm text-gray-700 dark:text-gray-300">
                Also send to email: {job.customer_email}
              </span>
            </label>
          )}

          {/* Result feedback */}
          {result && (
            <div className={`mt-3 p-2.5 rounded-lg text-sm ${
              result.success
                ? 'bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                : 'bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300'
            }`}>
              {result.success
                ? `Message sent successfully${result.emailStatus === 'SENT' ? ' (SMS + Email)' : ''}`
                : `Failed to send${result.smsStatus ? ` — SMS: ${result.smsStatus}` : ''}`}
            </div>
          )}

          {/* Send button */}
          <button
            onClick={handleSend}
            disabled={!message.trim() || sending}
            className="w-full mt-4 flex items-center justify-center gap-2 py-3 bg-primary text-white font-semibold rounded-lg hover:bg-primary-dark disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Send className="h-4 w-4" />
            {sending ? 'Sending...' : 'Send Message'}
          </button>
        </div>
      </div>
    </div>
  )
}
