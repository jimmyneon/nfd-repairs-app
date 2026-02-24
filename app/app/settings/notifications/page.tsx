'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { ArrowLeft, Mail, MessageSquare, Save, Loader2, Bell, Send } from 'lucide-react'
import Link from 'next/link'
import { 
  registerServiceWorker, 
  requestNotificationPermission, 
  subscribeToPushNotifications,
  savePushSubscription
} from '@/lib/notifications'

interface NotificationConfig {
  id: string
  status_key: string
  status_label: string
  send_sms: boolean
  send_email: boolean
  is_active: boolean
  description: string | null
}

export default function NotificationSettingsPage() {
  const [configs, setConfigs] = useState<NotificationConfig[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [pushTestLoading, setPushTestLoading] = useState(false)
  const [pushTestResult, setPushTestResult] = useState<string | null>(null)
  const [pushPermission, setPushPermission] = useState<NotificationPermission>('default')
  const [hasSubscription, setHasSubscription] = useState(false)
  const [checkingSubscription, setCheckingSubscription] = useState(true)
  const [subscribing, setSubscribing] = useState(false)
  const supabase = createClient()

  useEffect(() => {
    loadConfigs()
    checkPushSubscription()
    if ('Notification' in window) {
      setPushPermission(Notification.permission)
    }
  }, [])

  const checkPushSubscription = async () => {
    setCheckingSubscription(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const { data, error } = await supabase
          .from('push_subscriptions')
          .select('id')
          .eq('user_id', user.id)
          .single()
        
        setHasSubscription(!!data && !error)
      }
    } catch (error) {
      console.error('Error checking subscription:', error)
    }
    setCheckingSubscription(false)
  }

  const manualSubscribe = async () => {
    setSubscribing(true)
    setPushTestResult(null)
    
    try {
      // Register service worker first
      await registerServiceWorker()
      
      // Request permission
      const permission = await requestNotificationPermission()
      
      if (!permission) {
        setPushTestResult('❌ Notification permission denied')
        setSubscribing(false)
        return
      }
      
      setPushPermission('granted')
      
      // Subscribe to push notifications
      const subscription = await subscribeToPushNotifications()
      
      if (!subscription) {
        setPushTestResult('❌ Failed to create push subscription')
        setSubscribing(false)
        return
      }
      
      // Save to database
      const { data: { user } } = await supabase.auth.getUser()
      
      if (!user) {
        setPushTestResult('❌ User not authenticated')
        setSubscribing(false)
        return
      }
      
      try {
        await savePushSubscription(subscription, user.id)
        setPushTestResult('✅ Successfully subscribed to push notifications!')
        setHasSubscription(true)
        // Clear localStorage flag so prompt can show again if needed
        localStorage.removeItem('notification-prompt-shown')
      } catch (saveError) {
        console.error('Failed to save subscription:', saveError)
        setPushTestResult(`❌ Failed to save to database: ${saveError instanceof Error ? saveError.message : 'Unknown error'}`)
      }
    } catch (error) {
      console.error('Subscription error:', error)
      setPushTestResult(`❌ Error: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
    
    setSubscribing(false)
  }

  const loadConfigs = async () => {
    const { data, error } = await supabase
      .from('notification_config')
      .select('*')
      .order('status_key', { ascending: true })

    if (!error && data) {
      setConfigs(data)
    }
    setLoading(false)
  }

  const toggleSMS = async (id: string, currentValue: boolean) => {
    setSaving(true)
    await supabase
      .from('notification_config')
      .update({ send_sms: !currentValue })
      .eq('id', id)
    
    await loadConfigs()
    setSaving(false)
  }

  const toggleEmail = async (id: string, currentValue: boolean) => {
    setSaving(true)
    await supabase
      .from('notification_config')
      .update({ send_email: !currentValue })
      .eq('id', id)
    
    await loadConfigs()
    setSaving(false)
  }

  const toggleActive = async (id: string, currentValue: boolean) => {
    setSaving(true)
    await supabase
      .from('notification_config')
      .update({ is_active: !currentValue })
      .eq('id', id)
    
    await loadConfigs()
    setSaving(false)
  }

  const sendTestPushNotification = async () => {
    setPushTestLoading(true)
    setPushTestResult(null)

    try {
      const response = await fetch('/api/notifications/send-push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: 'Test Notification',
          body: 'This is a test push notification from NFD Repairs',
          url: '/app/jobs',
        }),
      })

      if (response.ok) {
        setPushTestResult('✅ Test notification sent successfully!')
      } else {
        const error = await response.text()
        setPushTestResult(`❌ Failed to send: ${error}`)
      }
    } catch (error) {
      setPushTestResult(`❌ Error: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }

    setPushTestLoading(false)
    setTimeout(() => setPushTestResult(null), 5000)
  }

  const requestPushPermission = async () => {
    if ('Notification' in window) {
      const permission = await Notification.requestPermission()
      setPushPermission(permission)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <header className="bg-white dark:bg-gray-800 shadow-sm sticky top-0 z-10">
        <div className="px-4 py-4">
          <Link href="/app/settings" className="inline-flex items-center text-primary mb-3">
            <ArrowLeft className="h-5 w-5 mr-2" />
            Back to Settings
          </Link>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Notification Settings</h1>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
            Control which notifications are sent for each status change
          </p>
        </div>
      </header>

      <main className="p-4 max-w-4xl mx-auto">
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-4 mb-6">
          <p className="text-sm text-blue-800 dark:text-blue-200">
            <strong>How it works:</strong> Toggle SMS and Email for each status. When a job status changes, 
            only the enabled notification types will be sent to the customer.
          </p>
        </div>

        <div className="space-y-3">
          {configs.map((config) => (
            <div
              key={config.id}
              className={`bg-white dark:bg-gray-800 rounded-xl shadow-sm border-2 transition-all ${
                config.is_active 
                  ? 'border-gray-200 dark:border-gray-700' 
                  : 'border-gray-300 dark:border-gray-600 opacity-60'
              }`}
            >
              <div className="p-5">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1">
                    <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                      {config.status_label}
                    </h3>
                    {config.description && (
                      <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                        {config.description}
                      </p>
                    )}
                  </div>
                  <button
                    onClick={() => toggleActive(config.id, config.is_active)}
                    disabled={saving}
                    className={`px-4 py-2 rounded-lg font-medium text-sm transition-colors ${
                      config.is_active
                        ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                        : 'bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-300'
                    }`}
                  >
                    {config.is_active ? 'Active' : 'Disabled'}
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  {/* SMS Toggle */}
                  <button
                    onClick={() => toggleSMS(config.id, config.send_sms)}
                    disabled={saving || !config.is_active}
                    className={`flex items-center justify-between p-4 rounded-xl border-2 transition-all ${
                      config.send_sms && config.is_active
                        ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-300 dark:border-blue-700'
                        : 'bg-gray-50 dark:bg-gray-700/50 border-gray-200 dark:border-gray-600'
                    } ${!config.is_active ? 'opacity-50 cursor-not-allowed' : 'hover:shadow-md'}`}
                  >
                    <div className="flex items-center space-x-3">
                      <MessageSquare className={`h-5 w-5 ${
                        config.send_sms && config.is_active ? 'text-blue-600 dark:text-blue-400' : 'text-gray-400'
                      }`} />
                      <div className="text-left">
                        <p className="font-semibold text-gray-900 dark:text-white text-sm">SMS</p>
                        <p className="text-xs text-gray-600 dark:text-gray-400">
                          {config.send_sms && config.is_active ? 'Enabled' : 'Disabled'}
                        </p>
                      </div>
                    </div>
                    <div className={`w-12 h-6 rounded-full transition-colors ${
                      config.send_sms && config.is_active ? 'bg-blue-600' : 'bg-gray-300 dark:bg-gray-600'
                    }`}>
                      <div className={`w-5 h-5 bg-white rounded-full shadow-md transform transition-transform ${
                        config.send_sms && config.is_active ? 'translate-x-6' : 'translate-x-0.5'
                      } mt-0.5`} />
                    </div>
                  </button>

                  {/* Email Toggle */}
                  <button
                    onClick={() => toggleEmail(config.id, config.send_email)}
                    disabled={saving || !config.is_active}
                    className={`flex items-center justify-between p-4 rounded-xl border-2 transition-all ${
                      config.send_email && config.is_active
                        ? 'bg-green-50 dark:bg-green-900/20 border-green-300 dark:border-green-700'
                        : 'bg-gray-50 dark:bg-gray-700/50 border-gray-200 dark:border-gray-600'
                    } ${!config.is_active ? 'opacity-50 cursor-not-allowed' : 'hover:shadow-md'}`}
                  >
                    <div className="flex items-center space-x-3">
                      <Mail className={`h-5 w-5 ${
                        config.send_email && config.is_active ? 'text-green-600 dark:text-green-400' : 'text-gray-400'
                      }`} />
                      <div className="text-left">
                        <p className="font-semibold text-gray-900 dark:text-white text-sm">Email</p>
                        <p className="text-xs text-gray-600 dark:text-gray-400">
                          {config.send_email && config.is_active ? 'Enabled' : 'Disabled'}
                        </p>
                      </div>
                    </div>
                    <div className={`w-12 h-6 rounded-full transition-colors ${
                      config.send_email && config.is_active ? 'bg-green-600' : 'bg-gray-300 dark:bg-gray-600'
                    }`}>
                      <div className={`w-5 h-5 bg-white rounded-full shadow-md transform transition-transform ${
                        config.send_email && config.is_active ? 'translate-x-6' : 'translate-x-0.5'
                      } mt-0.5`} />
                    </div>
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-6 bg-white dark:bg-gray-800 rounded-xl shadow-sm border-2 border-gray-200 dark:border-gray-700 p-5">
          <div className="flex items-center gap-3 mb-4">
            <Bell className="h-6 w-6 text-purple-600 dark:text-purple-400" />
            <div>
              <h3 className="font-bold text-gray-900 dark:text-white">Push Notifications Test</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Test browser push notifications to all subscribed devices
              </p>
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
              <div>
                <p className="text-sm font-medium text-gray-900 dark:text-white">Permission Status</p>
                <p className="text-xs text-gray-600 dark:text-gray-400">
                  {pushPermission === 'granted' ? 'Notifications enabled' : 
                   pushPermission === 'denied' ? 'Notifications blocked' : 
                   'Not yet requested'}
                </p>
              </div>
              <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                pushPermission === 'granted' ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' :
                pushPermission === 'denied' ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400' :
                'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400'
              }`}>
                {pushPermission}
              </span>
            </div>

            <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
              <div>
                <p className="text-sm font-medium text-gray-900 dark:text-white">Subscription Status</p>
                <p className="text-xs text-gray-600 dark:text-gray-400">
                  {checkingSubscription ? 'Checking...' :
                   hasSubscription ? 'Subscribed to push notifications' : 
                   'Not subscribed yet'}
                </p>
              </div>
              <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                hasSubscription ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' :
                'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400'
              }`}>
                {checkingSubscription ? '...' : hasSubscription ? 'Active' : 'Inactive'}
              </span>
            </div>

            {!hasSubscription && !checkingSubscription && (
              <button
                onClick={manualSubscribe}
                disabled={subscribing}
                className="w-full bg-purple-600 hover:bg-purple-700 disabled:bg-gray-400 text-white px-4 py-3 rounded-lg font-medium flex items-center justify-center gap-2"
              >
                {subscribing ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin" />
                    Subscribing...
                  </>
                ) : (
                  <>
                    <Bell className="h-5 w-5" />
                    Subscribe to Push Notifications
                  </>
                )}
              </button>
            )}

            {pushPermission === 'granted' && hasSubscription && (
              <button
                onClick={sendTestPushNotification}
                disabled={pushTestLoading}
                className="w-full bg-purple-600 hover:bg-purple-700 disabled:bg-gray-400 text-white px-4 py-3 rounded-lg font-medium flex items-center justify-center gap-2"
              >
                {pushTestLoading ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin" />
                    Sending...
                  </>
                ) : (
                  <>
                    <Send className="h-5 w-5" />
                    Send Test Notification
                  </>
                )}
              </button>
            )}


            {pushTestResult && (
              <div className={`p-3 rounded-lg text-sm ${
                pushTestResult.startsWith('✅') 
                  ? 'bg-green-50 dark:bg-green-900/20 text-green-800 dark:text-green-200' 
                  : 'bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-200'
              }`}>
                {pushTestResult}
              </div>
            )}

            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
              <p className="text-xs text-blue-800 dark:text-blue-200">
                <strong>How it works:</strong> Click "Subscribe to Push Notifications" above, allow browser permission when prompted, 
                and you'll start receiving push notifications for job updates. You can test it with the button below once subscribed.
              </p>
            </div>
          </div>
        </div>

        <div className="mt-6 bg-gray-100 dark:bg-gray-800 rounded-xl p-4">
          <h3 className="font-bold text-gray-900 dark:text-white mb-2">Quick Tips</h3>
          <ul className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
            <li>• <strong>SMS</strong> - Best for urgent updates (e.g., Ready to Collect)</li>
            <li>• <strong>Email</strong> - Best for detailed information (e.g., Job Created, includes full job details)</li>
            <li>• <strong>Both</strong> - Recommended for important status changes</li>
            <li>• <strong>Disable</strong> - Turn off entire status to prevent any notifications</li>
          </ul>
        </div>
      </main>
    </div>
  )
}
