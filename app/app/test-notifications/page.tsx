'use client'

import { useState } from 'react'
import { ArrowLeft, Send, Bell, CheckCircle, XCircle } from 'lucide-react'
import Link from 'next/link'

export default function TestNotificationsPage() {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)
  const [testTitle, setTestTitle] = useState('New Repair Job')
  const [testBody, setTestBody] = useState('iPhone 14 Pro - Screen Repair')
  const [testUrl, setTestUrl] = useState('/app/jobs')

  const sendTestNotification = async () => {
    setLoading(true)
    setError(null)
    setResult(null)

    try {
      const response = await fetch('/api/notifications/send-push', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: testTitle,
          body: testBody,
          url: testUrl,
          jobId: 'test-job-id',
        }),
      })

      const data = await response.json()

      if (response.ok) {
        setResult(data)
      } else {
        setError(data.error || 'Failed to send notification')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    }

    setLoading(false)
  }

  const checkPermission = () => {
    if (!('Notification' in window)) {
      return 'Not Supported'
    }
    return Notification.permission
  }

  const requestPermission = async () => {
    if ('Notification' in window) {
      const permission = await Notification.requestPermission()
      window.location.reload()
    }
  }

  const checkServiceWorker = async () => {
    if ('serviceWorker' in navigator) {
      const registration = await navigator.serviceWorker.getRegistration()
      return registration ? 'Registered' : 'Not Registered'
    }
    return 'Not Supported'
  }

  const [swStatus, setSwStatus] = useState<string>('Checking...')

  useState(() => {
    checkServiceWorker().then(setSwStatus)
  })

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <header className="bg-white dark:bg-gray-800 shadow-sm sticky top-0 z-10">
        <div className="px-4 py-3">
          <Link href="/app/jobs" className="inline-flex items-center text-primary mb-3">
            <ArrowLeft className="h-5 w-5 mr-2" />
            Back to Jobs
          </Link>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Test Push Notifications</h1>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
            Test the push notification system
          </p>
        </div>
      </header>

      <main className="p-4 space-y-4">
        {/* System Status */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4">
          <h2 className="font-semibold text-lg mb-3 text-gray-900 dark:text-white flex items-center gap-2">
            <Bell className="h-5 w-5" />
            System Status
          </h2>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600 dark:text-gray-400">Notification Permission:</span>
              <span className={`text-sm font-medium ${
                checkPermission() === 'granted' ? 'text-green-600' :
                checkPermission() === 'denied' ? 'text-red-600' :
                'text-yellow-600'
              }`}>
                {checkPermission()}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600 dark:text-gray-400">Service Worker:</span>
              <span className={`text-sm font-medium ${
                swStatus === 'Registered' ? 'text-green-600' : 'text-yellow-600'
              }`}>
                {swStatus}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600 dark:text-gray-400">Browser Support:</span>
              <span className={`text-sm font-medium ${
                'Notification' in window && 'serviceWorker' in navigator ? 'text-green-600' : 'text-red-600'
              }`}>
                {'Notification' in window && 'serviceWorker' in navigator ? 'Supported' : 'Not Supported'}
              </span>
            </div>
          </div>

          {checkPermission() !== 'granted' && (
            <button
              onClick={requestPermission}
              className="w-full mt-4 bg-primary hover:bg-primary-dark text-white px-4 py-2 rounded-lg font-medium"
            >
              Request Permission
            </button>
          )}
        </div>

        {/* Test Form */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4">
          <h2 className="font-semibold text-lg mb-3 text-gray-900 dark:text-white">Send Test Notification</h2>
          
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Title
              </label>
              <input
                type="text"
                value={testTitle}
                onChange={(e) => setTestTitle(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Body
              </label>
              <input
                type="text"
                value={testBody}
                onChange={(e) => setTestBody(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                URL (when clicked)
              </label>
              <input
                type="text"
                value={testUrl}
                onChange={(e) => setTestUrl(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              />
            </div>

            <button
              onClick={sendTestNotification}
              disabled={loading || checkPermission() !== 'granted'}
              className="w-full bg-green-500 hover:bg-green-600 text-white px-4 py-3 rounded-lg font-medium flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
              ) : (
                <>
                  <Send className="h-5 w-5" />
                  Send Test Notification
                </>
              )}
            </button>

            {checkPermission() !== 'granted' && (
              <p className="text-sm text-yellow-600 dark:text-yellow-400 text-center">
                ⚠️ Please grant notification permission first
              </p>
            )}
          </div>
        </div>

        {/* Result */}
        {result && (
          <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
            <div className="flex items-center gap-2 text-green-800 dark:text-green-200 mb-2">
              <CheckCircle className="h-5 w-5" />
              <span className="font-semibold">Success!</span>
            </div>
            <div className="text-sm text-green-700 dark:text-green-300">
              <p>Sent to {result.sent} of {result.total} subscriptions</p>
              {result.results && (
                <div className="mt-2 space-y-1">
                  {result.results.map((r: any, i: number) => (
                    <div key={i} className="flex items-center gap-2">
                      {r.success ? (
                        <CheckCircle className="h-4 w-4 text-green-600" />
                      ) : (
                        <XCircle className="h-4 w-4 text-red-600" />
                      )}
                      <span className="text-xs">User: {r.userId}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {error && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
            <div className="flex items-center gap-2 text-red-800 dark:text-red-200 mb-2">
              <XCircle className="h-5 w-5" />
              <span className="font-semibold">Error</span>
            </div>
            <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
          </div>
        )}

        {/* Instructions */}
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
          <h3 className="font-semibold text-blue-900 dark:text-blue-200 mb-2">How to Test:</h3>
          <ol className="text-sm text-blue-800 dark:text-blue-300 space-y-1 list-decimal list-inside">
            <li>Make sure notification permission is granted</li>
            <li>Make sure service worker is registered</li>
            <li>Customize the notification title and body</li>
            <li>Click "Send Test Notification"</li>
            <li>You should see a push notification appear</li>
            <li>Click the notification to navigate to the URL</li>
          </ol>
        </div>

        {/* VAPID Keys Info */}
        <div className="bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg p-4">
          <h3 className="font-semibold text-gray-900 dark:text-white mb-2">Environment Variables Required:</h3>
          <div className="text-sm text-gray-700 dark:text-gray-300 space-y-1 font-mono">
            <p>NEXT_PUBLIC_VAPID_PUBLIC_KEY=your_public_key</p>
            <p>VAPID_PRIVATE_KEY=your_private_key</p>
          </div>
          <p className="text-xs text-gray-600 dark:text-gray-400 mt-2">
            Generate VAPID keys using: <code className="bg-gray-200 dark:bg-gray-700 px-1 rounded">npx web-push generate-vapid-keys</code>
          </p>
        </div>
      </main>
    </div>
  )
}
