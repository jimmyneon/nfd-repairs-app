'use client'

import { useState, useEffect } from 'react'
import { ArrowLeft, Home, Moon, Sun, Bell, User, LogOut, Smartphone, Plus, History, Mail } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'
import { useTheme } from 'next-themes'

export const dynamic = 'force-dynamic'

/**
 * SMS Phone Pairing Card
 *
 * Shows a 6-digit code that the user enters in the Android SMS Relay app
 * to pair their phone. The code is fetched from the relay's Supabase
 * project via the create_pairing_code RPC function.
 *
 * This is the "super simple" onboarding: user opens this page, sees the
 * code, types it into the Android app. Done.
 */
function SmsPhonePairingCard() {
  const [pairingCode, setPairingCode] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [expiresAt, setExpiresAt] = useState<number | null>(null)
  const [timeLeft, setTimeLeft] = useState<number | null>(null)

  // Countdown timer for the pairing code expiry
  useEffect(() => {
    if (!expiresAt) return
    const interval = setInterval(() => {
      const remaining = Math.max(0, Math.floor((expiresAt - Date.now()) / 1000))
      setTimeLeft(remaining)
      if (remaining <= 0) {
        setPairingCode(null)
        setExpiresAt(null)
      }
    }, 1000)
    return () => clearInterval(interval)
  }, [expiresAt])

  const generateCode = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/sms/pairing-code', { method: 'POST' })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Could not generate code')
      }
      const data = await res.json()
      setPairingCode(data.code)
      setExpiresAt(Date.now() + (data.expires_in * 1000))
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="card dark:bg-gray-800">
      <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-4 flex items-center">
        <Smartphone className="h-6 w-6 mr-2" />
        SMS Phone Connection
      </h2>
      <div className="space-y-3">
        <p className="text-sm text-gray-600 dark:text-gray-300">
          Pair an Android phone to send and receive SMS messages for this app.
          Install the SMS Relay app on the phone, then generate a code below.
        </p>

        {pairingCode ? (
          <div className="p-6 bg-gray-50 dark:bg-gray-700 rounded-xl text-center">
            <p className="text-sm text-gray-600 dark:text-gray-300 mb-2">
              Enter this code in the SMS Relay app:
            </p>
            <p className="text-4xl font-bold tracking-[0.5em] text-gray-900 dark:text-white mb-2">
              {pairingCode}
            </p>
            {timeLeft !== null && (
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Expires in {Math.floor(timeLeft / 60)}:{(timeLeft % 60).toString().padStart(2, '0')}
              </p>
            )}
            <button
              onClick={generateCode}
              className="mt-4 text-sm text-primary hover:underline"
            >
              Generate new code
            </button>
          </div>
        ) : (
          <button
            onClick={generateCode}
            disabled={loading}
            className="w-full p-4 bg-primary text-white rounded-xl hover:bg-primary-dark transition-colors font-semibold disabled:opacity-50"
          >
            {loading ? 'Generating...' : 'Generate pairing code'}
          </button>
        )}

        {error && (
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        )}
      </div>
    </div>
  )
}

export default function SettingsPage() {
  const { theme, setTheme } = useTheme()
  const [notificationsEnabled, setNotificationsEnabled] = useState(false)
  const [mounted, setMounted] = useState(false)
  const router = useRouter()
  const supabase = createClient() as any

  useEffect(() => {
    setMounted(true)
    checkNotificationStatus()
  }, [])

  const checkNotificationStatus = async () => {
    // Check both browser permission AND database subscription
    const hasPermission = 'Notification' in window && Notification.permission === 'granted'
    
    if (!hasPermission) {
      setNotificationsEnabled(false)
      return
    }

    // Check if user has an active subscription in the database
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const { data } = await supabase
          .from('push_subscriptions')
          .select('id')
          .eq('user_id', user.id)
          .single()
        
        setNotificationsEnabled(!!data)
      } else {
        setNotificationsEnabled(false)
      }
    } catch (error) {
      console.error('Error checking subscription:', error)
      setNotificationsEnabled(false)
    }
  }

  const toggleTheme = () => {
    const newTheme = theme === 'light' ? 'dark' : 'light'
    console.log('🌙 Toggling theme from', theme, 'to', newTheme)
    setTheme(newTheme)
  }

  useEffect(() => {
    if (mounted) {
      console.log('⚙️ Settings page - Current theme:', theme)
      console.log('⚙️ HTML classList:', document.documentElement.classList.toString())
    }
  }, [theme, mounted])

  if (!mounted) {
    return null
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <header className="bg-white dark:bg-gray-800 shadow-sm sticky top-0 z-10">
        <div className="px-4 py-4">
          <div className="flex items-center gap-2 mb-3">
            <Link href="/app/jobs" className="inline-flex items-center justify-center w-10 h-10 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors" title="Home">
              <Home className="h-5 w-5 text-primary" />
            </Link>
            <Link href="/app/jobs/create" className="inline-flex items-center justify-center w-10 h-10 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors" title="Create New Job">
              <Plus className="h-5 w-5 text-primary" />
            </Link>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Settings</h1>
        </div>
      </header>

      <main className="p-4 space-y-4 max-w-2xl mx-auto">
        {/* Appearance */}
        <div className="card dark:bg-gray-800">
          <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-4 flex items-center">
            {theme === 'light' ? <Sun className="h-6 w-6 mr-2" /> : <Moon className="h-6 w-6 mr-2" />}
            Appearance
          </h2>
          <div className="space-y-3">
            <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700 rounded-xl">
              <div>
                <p className="font-semibold text-gray-900 dark:text-white">Theme</p>
                <p className="text-sm text-gray-600 dark:text-gray-300">
                  {theme === 'light' ? 'Light mode' : 'Dark mode'}
                </p>
              </div>
              <button
                onClick={toggleTheme}
                className="relative inline-flex h-12 w-24 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
                style={{ backgroundColor: theme === 'dark' ? '#009B4D' : '#E5E7EB' }}
              >
                <span
                  className={`inline-block h-10 w-10 transform rounded-full bg-white shadow-lg transition-transform ${
                    theme === 'dark' ? 'translate-x-12' : 'translate-x-1'
                  }`}
                >
                  {theme === 'light' ? (
                    <Sun className="h-6 w-6 m-2 text-yellow-500" />
                  ) : (
                    <Moon className="h-6 w-6 m-2 text-blue-500" />
                  )}
                </span>
              </button>
            </div>
          </div>
        </div>

        {/* Notifications */}
        <div className="card dark:bg-gray-800">
          <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-4 flex items-center">
            <Bell className="h-6 w-6 mr-2" />
            Notifications
          </h2>
          <div className="space-y-3">
            <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700 rounded-xl">
              <div>
                <p className="font-semibold text-gray-900 dark:text-white">Push Notifications</p>
                <p className="text-sm text-gray-600 dark:text-gray-300">
                  {notificationsEnabled ? 'Enabled' : 'Disabled'}
                </p>
              </div>
              <div className={`px-4 py-2 rounded-full font-medium ${
                notificationsEnabled 
                  ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' 
                  : 'bg-gray-200 text-gray-700 dark:bg-gray-600 dark:text-gray-300'
              }`}>
                {notificationsEnabled ? 'Active' : 'Inactive'}
              </div>
            </div>
            {!notificationsEnabled && (
              <p className="text-sm text-gray-600 dark:text-gray-400 px-4">
                Enable notifications in your browser settings to receive job updates
              </p>
            )}
          </div>
        </div>

        {/* SMS Phone Pairing */}
        <SmsPhonePairingCard />

        {/* Quick Actions */}
        <div className="card dark:bg-gray-800">
          <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-4 flex items-center">
            <Smartphone className="h-6 w-6 mr-2" />
            Quick Actions
          </h2>
          <div className="space-y-3">
            <Link
              href="/app/settings/notifications"
              className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors"
            >
              <div>
                <p className="font-semibold text-gray-900 dark:text-white">Notification Settings</p>
                <p className="text-sm text-gray-600 dark:text-gray-300">Configure email/SMS per status</p>
              </div>
              <ArrowLeft className="h-5 w-5 text-gray-400 rotate-180" />
            </Link>
            <Link
              href="/app/templates"
              className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors"
            >
              <div>
                <p className="font-semibold text-gray-900 dark:text-white">SMS Templates</p>
                <p className="text-sm text-gray-600 dark:text-gray-300">Manage message templates</p>
              </div>
              <ArrowLeft className="h-5 w-5 text-gray-400 rotate-180" />
            </Link>
            <Link
              href="/app/history"
              className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors"
            >
              <div>
                <p className="font-semibold text-gray-900 dark:text-white">Job History</p>
                <p className="text-sm text-gray-600 dark:text-gray-300">Search and view past jobs</p>
              </div>
              <ArrowLeft className="h-5 w-5 text-gray-400 rotate-180" />
            </Link>
            <Link
              href="/app/enquiries"
              className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors"
            >
              <div>
                <p className="font-semibold text-gray-900 dark:text-white">Enquiries</p>
                <p className="text-sm text-gray-600 dark:text-gray-300">Customer enquiries and contact form submissions</p>
              </div>
              <ArrowLeft className="h-5 w-5 text-gray-400 rotate-180" />
            </Link>
            <Link
              href="/app/email-templates"
              className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors"
            >
              <div>
                <p className="font-semibold text-gray-900 dark:text-white">Email Templates</p>
                <p className="text-sm text-gray-600 dark:text-gray-300">Manage HTML email templates</p>
              </div>
              <ArrowLeft className="h-5 w-5 text-gray-400 rotate-180" />
            </Link>
            <Link
              href="/app/notifications"
              className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors"
            >
              <div>
                <p className="font-semibold text-gray-900 dark:text-white">Notifications</p>
                <p className="text-sm text-gray-600 dark:text-gray-300">View all notifications</p>
              </div>
              <ArrowLeft className="h-5 w-5 text-gray-400 rotate-180" />
            </Link>
            <Link
              href="/app/settings/admin"
              className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors"
            >
              <div>
                <p className="font-semibold text-gray-900 dark:text-white">Admin Settings</p>
                <p className="text-sm text-gray-600 dark:text-gray-300">Google review link, API keys</p>
              </div>
              <ArrowLeft className="h-5 w-5 text-gray-400 rotate-180" />
            </Link>
          </div>
        </div>

        {/* Account */}
        <div className="card dark:bg-gray-800">
          <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-4 flex items-center">
            <User className="h-6 w-6 mr-2" />
            Account
          </h2>
          <button
            onClick={handleLogout}
            className="w-full flex items-center justify-center space-x-2 p-4 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-xl hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors font-semibold"
          >
            <LogOut className="h-5 w-5" />
            <span>Sign Out</span>
          </button>
        </div>

        {/* App Info */}
        <div className="card dark:bg-gray-800">
          <div className="text-center space-y-2">
            <p className="text-sm text-gray-600 dark:text-gray-400">NFD Repairs Staff App</p>
            <p className="text-xs text-gray-500 dark:text-gray-500">Version 1.0.0</p>
          </div>
        </div>
      </main>
    </div>
  )
}
