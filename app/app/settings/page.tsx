'use client'

import { useState, useEffect } from 'react'
import { ArrowLeft, Moon, Sun, Bell, User, LogOut, Smartphone } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'
import { useTheme } from 'next-themes'

export default function SettingsPage() {
  const { theme, setTheme } = useTheme()
  const [notificationsEnabled, setNotificationsEnabled] = useState(false)
  const [mounted, setMounted] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    setMounted(true)
    setNotificationsEnabled(Notification.permission === 'granted')
  }, [])

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
          <Link href="/app/jobs" className="inline-flex items-center text-primary mb-3">
            <ArrowLeft className="h-5 w-5 mr-2" />
            Back to Jobs
          </Link>
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
