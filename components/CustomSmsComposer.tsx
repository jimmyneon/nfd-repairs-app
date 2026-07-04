'use client'

import { useState, useRef } from 'react'
import { Send, Plus, DollarSign, FileText, Link as LinkIcon, Clock, CheckCircle, AlertCircle, MessageSquare, X, MessageCircle, Lock } from 'lucide-react'
import { Job } from '@/lib/types-v3'
import { getFirstName } from '@/lib/sms-template'
import SlideUpPanel from './SlideUpPanel'

interface CustomSmsComposerProps {
  job: Job
  onClose: () => void
  onSent?: () => void
}

export default function CustomSmsComposer({ job, onClose, onSent }: CustomSmsComposerProps) {
  const [message, setMessage] = useState('')
  const [sendEmailToo, setSendEmailToo] = useState(true)
  const [sending, setSending] = useState(false)
  const [channel, setChannel] = useState<'sms' | 'whatsapp'>(job.message_preference === 'whatsapp' ? 'whatsapp' : 'sms')
  const [result, setResult] = useState<{ success: boolean; smsStatus?: string; emailStatus?: string } | null>(null)
  const [showPicker, setShowPicker] = useState<'templates' | 'inserts' | null>(null)
  const [sendingPasswordRequest, setSendingPasswordRequest] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const appUrl = 'https://nfd-repairs-app.vercel.app'
  const trackingUrl = `${appUrl}/t/${job.tracking_token}`
  const charCount = message.length

  const insertText = (text: string) => {
    setMessage((prev) => {
      if (prev && !prev.endsWith('\n')) {
        return prev + '\n' + text
      }
      return (prev || '') + text
    })
  }

  const deviceName = `${job.device_make || ''} ${job.device_model || ''}`.trim() || 'your device'
  const firstName = getFirstName(job.customer_name)

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
      text: job.is_warranty
        ? `Hi ${firstName}, your ${deviceName} is all fixed and ready for collection.\n\nPlease check our opening times before setting off:\nhttps://maps.app.goo.gl/oVczouUePXkRbrKb7\n\nPop in whenever we're open.`
        : `Hi ${firstName}, your ${deviceName} is all fixed and ready for collection. The total is £${job.price_total?.toFixed(2) || '0.00'}.\n\nPlease check our opening times before setting off:\nhttps://maps.app.goo.gl/oVczouUePXkRbrKb7\n\nPop in whenever we're open.`,
    },
    ...(job.is_warranty ? [] : [
      {
        label: 'Deposit Needed',
        text: `Hi ${firstName}, I need to order parts for your ${deviceName}. A £20 deposit is required - please pop into the shop when you can to get this sorted.`,
      },
    ]),
    {
      label: 'Chase Collection',
      text: `Hi ${firstName}, just a friendly reminder that your ${deviceName} is ready for collection. It's been a while so please pop in soon to pick it up.`,
    },
    {
      label: 'Final Pickup Reminder',
      text: `Hi ${firstName}, this is a final reminder that your ${deviceName} is ready for collection. Please collect it within 5 days, otherwise we may need to recycle it.\n\nOur opening times:\nhttps://maps.app.goo.gl/oVczouUePXkRbrKb7\n\nMany thanks,\nNew Forest Device Repairs`,
    },
    ...(job.is_warranty ? [] : [
      {
        label: 'Quote Sent',
        text: `Hi ${firstName}, your repair quote for ${deviceName} is ready. Total: £${job.price_total?.toFixed(2) || '0.00'}. Let me know if you'd like to go ahead.\n${trackingUrl}`,
      },
    ]),
  ]

  const applyTemplate = (text: string) => {
    setMessage(text)
    setShowPicker(null)
    setTimeout(() => textareaRef.current?.focus(), 100)
  }

  const applyInsert = (action: () => void) => {
    action()
    setShowPicker(null)
    setTimeout(() => textareaRef.current?.focus(), 100)
  }

  const handleSendPasswordRequest = async () => {
    if (sendingPasswordRequest) return
    setSendingPasswordRequest(true)
    setResult(null)
    try {
      const response = await fetch('/api/password/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId: job.id }),
      })
      const data = await response.json()
      if (data.success) {
        setResult({ success: true, smsStatus: 'Password request sent' })
        onSent?.()
        setTimeout(() => onClose(), 1500)
      } else {
        setResult({ success: false, smsStatus: data.error || 'Failed' })
      }
    } catch {
      setResult({ success: false, smsStatus: 'Failed' })
    }
    setSendingPasswordRequest(false)
  }

  const handleSend = async () => {
    if (!message.trim() || sending) return

    if (channel === 'whatsapp') {
      const phone = (job.customer_phone || '').replace(/[^0-9]/g, '')
      const text = encodeURIComponent(message.trim())
      window.open(`https://wa.me/${phone}?text=${text}`, '_blank')
      setResult({ success: true, smsStatus: 'WhatsApp opened' })
      onSent?.()
      setTimeout(() => onClose(), 1500)
      return
    }

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

  const quickInserts = [
    { label: 'Greeting', icon: Plus, action: () => setMessage((prev) => `Hi ${firstName}, ${prev}`) },
    { label: 'Sign-off', icon: MessageSquare, action: () => insertText('Many thanks,\nJohn\nNew Forest Device Repairs') },
    { label: 'Price', icon: DollarSign, action: () => job.price_total && insertText(`Total: £${job.price_total.toFixed(2)}`), show: !!job.price_total && !job.is_warranty },
    { label: 'Diagnostic', icon: FileText, action: () => job.diagnostic_report && insertText(`\nDiagnostic report:\n${job.diagnostic_report}\n`), show: !!job.diagnostic_report },
    { label: 'Tracking', icon: LinkIcon, action: () => insertText(`Track your repair: ${trackingUrl}`) },
    { label: 'Hours', icon: Clock, action: () => insertText('Opening times: https://maps.app.goo.gl/oVczouUePXkRbrKb7') },
  ].filter((b) => b.show !== false)

  const squareButtons = [
    { label: 'Templates', icon: FileText, onClick: () => setShowPicker('templates') },
    { label: 'Password', icon: Lock, onClick: handleSendPasswordRequest },
    ...quickInserts.map((q) => ({ label: q.label, icon: q.icon, onClick: () => applyInsert(q.action) })),
  ]

  return (
    <>
      <SlideUpPanel
        isOpen={true}
        onClose={onClose}
        title="Send Message"
        icon={<Send className="h-5 w-5 text-primary" />}
        minHeight="40vh"
      >
        <div className="space-y-3">
          {/* Square buttons row */}
          <div className="flex gap-2 overflow-x-auto pb-1">
            {squareButtons.map((btn) => {
              const Icon = btn.icon
              return (
                <button
                  key={btn.label}
                  onClick={btn.onClick}
                  className="flex flex-col items-center justify-center gap-1 w-14 h-14 flex-shrink-0 bg-gray-100 dark:bg-gray-700 rounded-xl hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors active:scale-95"
                >
                  <Icon className="h-5 w-5 text-gray-600 dark:text-gray-300" />
                  <span className="text-[9px] font-medium text-gray-600 dark:text-gray-400">{btn.label}</span>
                </button>
              )
            })}
          </div>

          {/* Channel toggle: SMS vs WhatsApp */}
          <div className="flex gap-1 bg-gray-100 dark:bg-gray-700 rounded-lg p-1">
            <button
              onClick={() => setChannel('sms')}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-md text-sm font-bold transition-all ${
                channel === 'sms' ? 'bg-white dark:bg-gray-900 text-primary shadow-sm' : 'text-gray-500 dark:text-gray-400'
              }`}
            >
              <MessageSquare className="h-4 w-4" />
              SMS
            </button>
            <button
              onClick={() => setChannel('whatsapp')}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-md text-sm font-bold transition-all ${
                channel === 'whatsapp' ? 'bg-green-500 text-white shadow-sm' : 'text-gray-500 dark:text-gray-400'
              }`}
            >
              <MessageCircle className="h-4 w-4" />
              WhatsApp
            </button>
          </div>

          {/* Textarea - small, auto-grow */}
          <textarea
            ref={textareaRef}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Type your message..."
            rows={3}
            maxLength={1600}
            className="w-full p-3 text-sm text-gray-900 dark:text-white bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg resize-none focus:ring-2 focus:ring-primary focus:border-transparent outline-none min-h-[80px]"
            autoFocus
          />

          {/* Bottom row: char count + email toggle */}
          <div className="flex items-center justify-between">
            <p className={`text-xs ${charCount > 160 ? 'text-amber-600' : 'text-gray-400'}`}>
              {charCount}{charCount > 160 && ` · ${Math.ceil(charCount / 160)} SMS`}
            </p>
            {job.customer_email && (
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={sendEmailToo}
                  onChange={(e) => setSendEmailToo(e.target.checked)}
                  className="w-4 h-4 rounded text-primary focus:ring-primary"
                />
                <span className="text-xs text-gray-600 dark:text-gray-400">Also email</span>
              </label>
            )}
          </div>

          {/* Result feedback */}
          {result && (
            <div className={`p-2.5 rounded-lg text-sm flex items-center gap-2 ${
              result.success ? 'bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300' : 'bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300'
            }`}>
              {result.success ? <CheckCircle className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
              {result.success ? `Sent${result.emailStatus === 'SENT' ? ' (SMS + Email)' : ''}` : `Failed${result.smsStatus ? ` — ${result.smsStatus}` : ''}`}
            </div>
          )}

          {/* Send button */}
          <button
            onClick={handleSend}
            disabled={!message.trim() || sending}
            className={`w-full flex items-center justify-center gap-2 py-3 text-white font-bold rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors ${
              channel === 'whatsapp' ? 'bg-green-500 hover:bg-green-600' : 'bg-primary hover:bg-primary-dark'
            }`}
          >
            {channel === 'whatsapp' ? <MessageCircle className="h-4 w-4" /> : <Send className="h-4 w-4" />}
            {channel === 'whatsapp' ? 'Open in WhatsApp' : sending ? 'Sending...' : 'Send SMS'}
          </button>
        </div>
      </SlideUpPanel>

      {/* Picker modal overlay */}
      {showPicker && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50" onClick={() => setShowPicker(null)}>
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-md w-full max-h-[70vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
              <h3 className="font-bold text-gray-900 dark:text-white">{showPicker === 'templates' ? 'Message Templates' : 'Quick Insert'}</h3>
              <button onClick={() => setShowPicker(null)} className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="overflow-y-auto p-3 space-y-2">
              {showPicker === 'templates' && messageTemplates.map((tpl) => (
                <button
                  key={tpl.label}
                  onClick={() => applyTemplate(tpl.text)}
                  className="w-full text-left p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors border border-gray-200 dark:border-gray-600"
                >
                  <span className="font-bold text-sm text-gray-900 dark:text-white">{tpl.label}</span>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 line-clamp-3">{tpl.text}</p>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
