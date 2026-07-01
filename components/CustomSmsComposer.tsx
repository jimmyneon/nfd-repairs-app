'use client'

import { useState, useRef } from 'react'
import { Send, Mail, Phone, Plus, DollarSign, FileText, Link as LinkIcon, Clock, CheckCircle, AlertCircle, ArrowLeft, MessageSquare } from 'lucide-react'
import { Job } from '@/lib/types-v3'
import SlideUpPanel from './SlideUpPanel'

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
  const [step, setStep] = useState<'compose' | 'confirm'>('compose')
  const [showTemplates, setShowTemplates] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

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

  const insertSignOff = () => {
    insertText('Many thanks,\nJohn\nNew Forest Device Repairs')
  }

  const deviceName = `${job.device_make || ''} ${job.device_model || ''}`.trim() || 'your device'
  const firstName = job.customer_name?.trim().split(' ')[0] || 'there'

  const messageTemplates = [
    {
      label: 'Parts Arrived',
      text: `Hi ${firstName}, the parts for your ${deviceName} have arrived. Pop it into me at your convenience and I'll get the repair started right away.`,
    },
    {
      label: 'Diagnostic Done',
      text: `Hi ${firstName}, I've completed the diagnostic on your ${deviceName}.\n\n${job.diagnostic_report || '[Add diagnostic findings here]'}\n\nLet me know if you'd like to go ahead with the repair.`,
    },
    {
      label: 'Ready to Collect',
      text: `Hi ${firstName}, your ${deviceName} is all fixed and ready for collection. The total is £${job.price_total?.toFixed(2) || '0.00'}. Pop in whenever we're open.`,
    },
    {
      label: 'Deposit Needed',
      text: `Hi ${firstName}, I need to order parts for your ${deviceName}. A £20 deposit is required - please pop into the shop when you can to get this sorted.`,
    },
    {
      label: 'Chase Collection',
      text: `Hi ${firstName}, just a friendly reminder that your ${deviceName} is ready for collection. It's been a while so please pop in soon to pick it up.`,
    },
    {
      label: 'Quote Sent',
      text: `Hi ${firstName}, your repair quote for ${deviceName} is ready. Total: £${job.price_total?.toFixed(2) || '0.00'}. Let me know if you'd like to go ahead.\n${trackingUrl}`,
    },
  ]

  const applyTemplate = (text: string) => {
    setMessage(text)
    setShowTemplates(false)
    textareaRef.current?.focus()
  }

  // Prevent textarea from losing focus when tapping quick insert buttons
  const keepFocus = (e: React.MouseEvent) => {
    e.preventDefault()
    textareaRef.current?.focus()
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
    { label: 'Sign-off', icon: MessageSquare, onClick: insertSignOff, show: true },
    { label: 'Price', icon: DollarSign, onClick: insertPrice, show: !!job.price_total },
    { label: 'Diagnostic', icon: FileText, onClick: insertDiagnosticReport, show: !!job.diagnostic_report },
    { label: 'Tracking', icon: LinkIcon, onClick: insertTrackingLink, show: true },
    { label: 'Hours', icon: Clock, onClick: insertHoursLink, show: true },
  ].filter((b) => b.show)

  return (
    <SlideUpPanel
      isOpen={true}
      onClose={onClose}
      title={step === 'compose' ? 'Send Message' : 'Confirm Send'}
      icon={<Send className="h-5 w-5 text-primary" />}
      minHeight="60vh"
    >
      {step === 'compose' ? (
        <div className="space-y-4">
          {/* Recipient info */}
          <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-900/50 p-3 rounded-lg">
            <Phone className="h-4 w-4 flex-shrink-0" />
            <span className="font-medium text-gray-900 dark:text-white">{job.customer_name}</span>
            <span>·</span>
            <span>{job.customer_phone}</span>
          </div>

          {/* Templates dropdown */}
          <div>
            <button
              onClick={() => setShowTemplates(!showTemplates)}
              onMouseDown={keepFocus}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-primary/10 text-primary rounded-lg hover:bg-primary/20 transition-colors"
            >
              <FileText className="h-3.5 w-3.5" />
              {showTemplates ? 'Hide Templates' : 'Message Templates'}
            </button>
            {showTemplates && (
              <div className="mt-2 space-y-1.5">
                {messageTemplates.map((tpl) => (
                  <button
                    key={tpl.label}
                    onClick={() => applyTemplate(tpl.text)}
                    className="w-full text-left p-2.5 text-xs bg-gray-50 dark:bg-gray-700/50 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors border border-gray-200 dark:border-gray-600"
                  >
                    <span className="font-bold text-gray-900 dark:text-white">{tpl.label}</span>
                    <p className="text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-2">{tpl.text}</p>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Quick insert buttons */}
          <div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">Quick insert:</p>
            <div className="flex flex-wrap gap-2">
              {quickInsertButtons.map((btn) => {
                const Icon = btn.icon
                return (
                  <button
                    key={btn.label}
                    onClick={btn.onClick}
                    onMouseDown={keepFocus}
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
          <textarea
            ref={textareaRef}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Type your message here..."
            rows={8}
            maxLength={maxSmsChars}
            className="w-full p-3 text-sm text-gray-900 dark:text-white bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg resize-none focus:ring-2 focus:ring-primary focus:border-transparent outline-none"
            autoFocus
          />
          <p className={`text-xs ${charCount > 160 ? 'text-amber-600' : 'text-gray-400'}`}>
            {charCount} characters{charCount > 160 && ` · ${Math.ceil(charCount / 160)} SMS parts`}
          </p>

          {/* Email toggle */}
          {job.customer_email && (
            <label className="flex items-center gap-2 cursor-pointer">
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
            <div className={`p-2.5 rounded-lg text-sm ${
              result.success
                ? 'bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                : 'bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300'
            }`}>
              {result.success
                ? `Message sent successfully${result.emailStatus === 'SENT' ? ' (SMS + Email)' : ''}`
                : `Failed to send${result.smsStatus ? ` — SMS: ${result.smsStatus}` : ''}`}
            </div>
          )}

          {/* Review button */}
          <button
            onClick={() => setStep('confirm')}
            disabled={!message.trim()}
            className="w-full flex items-center justify-center gap-2 py-3 bg-primary text-white font-semibold rounded-lg hover:bg-primary-dark disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Send className="h-4 w-4" />
            Review & Send
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Back button */}
          <button
            onClick={() => setStep('compose')}
            className="flex items-center gap-1 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to edit
          </button>

          {/* Recipient */}
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
            <p className="text-xs font-bold text-blue-900 dark:text-blue-300 mb-2">Sending to:</p>
            <div className="flex items-center gap-2 text-sm text-blue-800 dark:text-blue-200">
              <Phone className="h-4 w-4" />
              <span>{job.customer_phone}</span>
            </div>
            {sendEmailToo && job.customer_email && (
              <div className="flex items-center gap-2 text-sm text-blue-800 dark:text-blue-200 mt-1">
                <Mail className="h-4 w-4" />
                <span>{job.customer_email}</span>
              </div>
            )}
          </div>

          {/* Message preview */}
          <div>
            <p className="text-xs font-bold text-gray-500 dark:text-gray-400 mb-2">Message preview:</p>
            <div className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg p-3">
              <p className="text-sm text-gray-900 dark:text-white whitespace-pre-line">{message.trim()}</p>
            </div>
            <p className="text-xs text-gray-400 mt-1">
              {charCount} characters{charCount > 160 && ` · ${Math.ceil(charCount / 160)} SMS parts`}
              {sendEmailToo && ' · SMS + Email'}
            </p>
          </div>

          {/* Result feedback */}
          {result && (
            <div className={`p-2.5 rounded-lg text-sm flex items-center gap-2 ${
              result.success
                ? 'bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                : 'bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300'
            }`}>
              {result.success ? <CheckCircle className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
              {result.success
                ? `Message sent successfully${result.emailStatus === 'SENT' ? ' (SMS + Email)' : ''}`
                : `Failed to send${result.smsStatus ? ` — SMS: ${result.smsStatus}` : ''}`}
            </div>
          )}

          {/* Confirm/Cancel buttons */}
          <div className="flex gap-3 pt-2">
            <button
              onClick={() => setStep('compose')}
              disabled={sending}
              className="flex-1 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-900 dark:text-white font-bold py-3 rounded-lg transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={handleSend}
              disabled={sending}
              className="flex-1 flex items-center justify-center gap-2 bg-primary hover:bg-primary-dark text-white font-bold py-3 rounded-lg transition-colors disabled:opacity-50"
            >
              <Send className="h-4 w-4" />
              {sending ? 'Sending...' : 'Confirm & Send'}
            </button>
          </div>
        </div>
      )}
    </SlideUpPanel>
  )
}
