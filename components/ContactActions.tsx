'use client'

import { useState } from 'react'
import { Phone, Mail, MessageSquare, X, Send } from 'lucide-react'
import { Job } from '@/lib/types-v3'
import CustomSmsComposer from './CustomSmsComposer'

interface ContactActionsProps {
  phone: string
  email?: string
  name: string
  job?: Job
  onMessageSent?: () => void
}

export default function ContactActions({ phone, email, name, job, onMessageSent }: ContactActionsProps) {
  const [showPhoneMenu, setShowPhoneMenu] = useState(false)
  const [showComposer, setShowComposer] = useState(false)

  const handleCall = () => {
    window.location.href = `tel:${phone}`
  }

  const handleWhatsApp = () => {
    const cleanPhone = phone.replace(/\D/g, '')
    window.open(`https://wa.me/${cleanPhone}`, '_blank')
  }

  const handleEmail = () => {
    if (email) {
      window.location.href = `mailto:${email}`
    }
  }

  return (
    <div className="space-y-3">
      {/* Phone Actions */}
      <div className="relative">
        <button
          onClick={() => setShowPhoneMenu(!showPhoneMenu)}
          className="w-full flex items-center justify-between p-4 bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-xl hover:border-primary transition-colors"
        >
          <div className="flex items-center space-x-3">
            <div className="w-12 h-12 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center">
              <Phone className="h-6 w-6 text-green-600 dark:text-green-400" />
            </div>
            <div className="text-left">
              <p className="text-sm text-gray-500 dark:text-gray-400 font-medium">Phone</p>
              <p className="text-lg font-semibold text-gray-900 dark:text-white">{phone}</p>
            </div>
          </div>
        </button>

        {showPhoneMenu && (
          <div className="absolute top-full left-0 right-0 mt-2 bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-xl shadow-lg z-10 overflow-hidden">
            <button
              onClick={() => { handleCall(); setShowPhoneMenu(false); }}
              className="w-full flex items-center space-x-3 p-4 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors border-b border-gray-100 dark:border-gray-700"
            >
              <Phone className="h-5 w-5 text-blue-600" />
              <span className="font-medium text-gray-900 dark:text-white">Call {name}</span>
            </button>
            <button
              onClick={() => { setShowComposer(true); setShowPhoneMenu(false); }}
              className="w-full flex items-center space-x-3 p-4 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors border-b border-gray-100 dark:border-gray-700"
            >
              <Send className="h-5 w-5 text-primary" />
              <span className="font-medium text-gray-900 dark:text-white">Send SMS via App</span>
            </button>
            <button
              onClick={() => { handleWhatsApp(); setShowPhoneMenu(false); }}
              className="w-full flex items-center space-x-3 p-4 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            >
              <MessageSquare className="h-5 w-5 text-green-500" />
              <span className="font-medium text-gray-900 dark:text-white">WhatsApp</span>
            </button>
          </div>
        )}
      </div>

      {/* Email Actions */}
      {email && (
        <button
          onClick={handleEmail}
          className="w-full flex items-center justify-between p-4 bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-xl hover:border-primary transition-colors"
        >
          <div className="flex items-center space-x-3">
            <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center">
              <Mail className="h-6 w-6 text-blue-600 dark:text-blue-400" />
            </div>
            <div className="text-left">
              <p className="text-sm text-gray-500 dark:text-gray-400 font-medium">Email</p>
              <p className="text-base font-semibold text-gray-900 dark:text-white">{email}</p>
            </div>
          </div>
        </button>
      )}

      {/* Custom SMS Composer Modal */}
      {showComposer && job && (
        <CustomSmsComposer
          job={job}
          onClose={() => setShowComposer(false)}
          onSent={onMessageSent}
        />
      )}
    </div>
  )
}
