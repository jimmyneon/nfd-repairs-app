'use client'

import { useEffect, useState } from 'react'
import { Bell, BellOff, X } from 'lucide-react'
import { 
  registerServiceWorker, 
  requestNotificationPermission, 
  subscribeToPushNotifications,
  savePushSubscription,
  checkNotificationSupport 
} from '@/lib/notifications'
import { supabase } from '@/lib/supabase'

export default function NotificationSetup() {
  const [showPrompt, setShowPrompt] = useState(false)
  const [notificationsEnabled, setNotificationsEnabled] = useState(false)
  const [loading, setLoading] = useState(false)
  const [support, setSupport] = useState({ serviceWorker: false, notification: false, pushManager: false })

  useEffect(() => {
    const checkSupport = checkNotificationSupport()
    setSupport(checkSupport)

    if (checkSupport.notification) {
      const currentPermission = Notification.permission
      setNotificationsEnabled(currentPermission === 'granted')
      
      const hasAsked = localStorage.getItem('notification-prompt-shown')
      
      // Only show prompt if permission is default AND we haven't asked before
      if (!hasAsked && currentPermission === 'default') {
        setTimeout(() => setShowPrompt(true), 3000)
      }
      
      // If permission was granted or denied, mark as asked
      if (currentPermission !== 'default' && !hasAsked) {
        localStorage.setItem('notification-prompt-shown', 'true')
      }
    }

    registerServiceWorker()
  }, [])

  const enableNotifications = async () => {
    setLoading(true)

    const permission = await requestNotificationPermission()
    
    if (permission) {
      const subscription = await subscribeToPushNotifications()
      
      if (subscription) {
        const { data: { user } } = await supabase.auth.getUser()
        
        if (user) {
          await savePushSubscription(subscription, user.id)
          setNotificationsEnabled(true)
          setShowPrompt(false)
          localStorage.setItem('notification-prompt-shown', 'true')
        }
      }
    } else {
      localStorage.setItem('notification-prompt-shown', 'true')
      setShowPrompt(false)
    }

    setLoading(false)
  }

  const dismissPrompt = () => {
    setShowPrompt(false)
    localStorage.setItem('notification-prompt-shown', 'true')
  }

  if (!support.notification || !support.pushManager) {
    return null
  }

  if (showPrompt && !notificationsEnabled) {
    return (
      <div className="fixed bottom-4 left-4 right-4 bg-white rounded-lg shadow-lg p-4 z-50 border border-primary/20">
        <button
          onClick={dismissPrompt}
          className="absolute top-2 right-2 text-gray-400 hover:text-gray-600"
        >
          <X className="h-5 w-5" />
        </button>
        
        <div className="flex items-start space-x-3">
          <div className="flex-shrink-0">
            <Bell className="h-6 w-6 text-primary" />
          </div>
          <div className="flex-1">
            <h3 className="font-semibold text-gray-900 mb-1">
              Enable Push Notifications
            </h3>
            <p className="text-sm text-gray-600 mb-3">
              Get instant alerts for new jobs and status updates, even when the app is closed.
            </p>
            <div className="flex space-x-2">
              <button
                onClick={enableNotifications}
                disabled={loading}
                className="btn-primary text-sm py-2 disabled:opacity-50"
              >
                {loading ? 'Enabling...' : 'Enable Notifications'}
              </button>
              <button
                onClick={dismissPrompt}
                className="bg-gray-200 text-gray-700 px-4 py-2 rounded-lg text-sm hover:bg-gray-300"
              >
                Not Now
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return null
}
