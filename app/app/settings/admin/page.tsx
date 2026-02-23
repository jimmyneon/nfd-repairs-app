'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { ArrowLeft, Save, Loader2, Link as LinkIcon, Star } from 'lucide-react'
import Link from 'next/link'

interface AdminSetting {
  id: string
  key: string
  value: string
  description: string | null
  updated_at: string
}

export default function AdminSettingsPage() {
  const [settings, setSettings] = useState<AdminSetting[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [googleReviewLink, setGoogleReviewLink] = useState('')
  const [googleMapsLink, setGoogleMapsLink] = useState('')
  const [warrantyApiKey, setWarrantyApiKey] = useState('')
  const supabase = createClient()

  useEffect(() => {
    loadSettings()
  }, [])

  const loadSettings = async () => {
    const { data, error } = await supabase
      .from('admin_settings')
      .select('*')
      .in('key', ['google_review_link', 'google_maps_link', 'warranty_api_key'])

    if (!error && data) {
      setSettings(data)
      const reviewLink = data.find(s => s.key === 'google_review_link')
      const mapsLink = data.find(s => s.key === 'google_maps_link')
      const apiKey = data.find(s => s.key === 'warranty_api_key')
      
      if (reviewLink) setGoogleReviewLink(reviewLink.value)
      if (mapsLink) setGoogleMapsLink(mapsLink.value)
      if (apiKey) setWarrantyApiKey(apiKey.value)
    }
    setLoading(false)
  }

  const saveGoogleReviewLink = async () => {
    setSaving(true)
    const { error } = await supabase
      .from('admin_settings')
      .update({ value: googleReviewLink })
      .eq('key', 'google_review_link')

    if (!error) {
      await loadSettings()
      alert('Google review link saved successfully!')
    } else {
      alert('Failed to save: ' + error.message)
    }
    setSaving(false)
  }

  const saveGoogleMapsLink = async () => {
    setSaving(true)
    const { error } = await supabase
      .from('admin_settings')
      .update({ value: googleMapsLink })
      .eq('key', 'google_maps_link')

    if (!error) {
      await loadSettings()
      alert('Google Maps link saved successfully!')
    } else {
      alert('Failed to save: ' + error.message)
    }
    setSaving(false)
  }

  const regenerateWarrantyApiKey = async () => {
    if (!confirm('Are you sure you want to regenerate the warranty API key? The old key will stop working.')) {
      return
    }

    setSaving(true)
    // Generate new random key
    const newKey = Array.from(crypto.getRandomValues(new Uint8Array(32)))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('')

    const { error } = await supabase
      .from('admin_settings')
      .update({ value: newKey })
      .eq('key', 'warranty_api_key')

    if (!error) {
      await loadSettings()
      alert('New API key generated! Make sure to update your website.')
    } else {
      alert('Failed to regenerate: ' + error.message)
    }
    setSaving(false)
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
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Admin Settings</h1>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
            Configure system-wide settings and integrations
          </p>
        </div>
      </header>

      <main className="p-4 max-w-4xl mx-auto space-y-6">
        {/* Google Review Link */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
          <div className="flex items-center mb-4">
            <Star className="h-6 w-6 text-yellow-500 mr-2" />
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">Google Review Link</h2>
          </div>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
            This link is included in post-collection SMS messages to encourage customer reviews.
          </p>
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Review Link URL
              </label>
              <input
                type="url"
                value={googleReviewLink}
                onChange={(e) => setGoogleReviewLink(e.target.value)}
                placeholder="https://g.page/r/YOUR_GOOGLE_REVIEW_LINK/review"
                className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              />
            </div>
            <button
              onClick={saveGoogleReviewLink}
              disabled={saving}
              className="flex items-center space-x-2 px-6 py-3 bg-primary text-white rounded-xl hover:bg-primary-dark transition-colors disabled:opacity-50"
            >
              {saving ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <Save className="h-5 w-5" />
              )}
              <span>Save Google Review Link</span>
            </button>
          </div>
        </div>

        {/* Google Maps Link */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
          <div className="flex items-center mb-4">
            <LinkIcon className="h-6 w-6 text-green-500 mr-2" />
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">Google Maps Link</h2>
          </div>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
            This link is included in SMS messages to help customers find your shop location.
          </p>
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Maps Link URL
              </label>
              <input
                type="url"
                value={googleMapsLink}
                onChange={(e) => setGoogleMapsLink(e.target.value)}
                placeholder="https://maps.app.goo.gl/..."
                className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              />
            </div>
            <button
              onClick={saveGoogleMapsLink}
              disabled={saving}
              className="flex items-center space-x-2 px-6 py-3 bg-primary text-white rounded-xl hover:bg-primary-dark transition-colors disabled:opacity-50"
            >
              {saving ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <Save className="h-5 w-5" />
              )}
              <span>Save Google Maps Link</span>
            </button>
          </div>
        </div>

        {/* Warranty API Key */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
          <div className="flex items-center mb-4">
            <LinkIcon className="h-6 w-6 text-blue-500 mr-2" />
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">Warranty API Key</h2>
          </div>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
            This key is used by your website to create warranty tickets via the API.
          </p>
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Current API Key
              </label>
              <div className="flex items-center space-x-2">
                <input
                  type="text"
                  value={warrantyApiKey}
                  readOnly
                  className="flex-1 px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-xl bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white font-mono text-sm"
                />
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(warrantyApiKey)
                    alert('API key copied to clipboard!')
                  }}
                  className="px-4 py-3 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-xl hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                >
                  Copy
                </button>
              </div>
            </div>
            <button
              onClick={regenerateWarrantyApiKey}
              disabled={saving}
              className="flex items-center space-x-2 px-6 py-3 bg-red-500 text-white rounded-xl hover:bg-red-600 transition-colors disabled:opacity-50"
            >
              {saving ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <LinkIcon className="h-5 w-5" />
              )}
              <span>Regenerate API Key</span>
            </button>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              ⚠️ Warning: Regenerating will invalidate the old key. Update your website immediately after regenerating.
            </p>
          </div>
        </div>

        {/* Info Box */}
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-4">
          <h3 className="font-bold text-blue-900 dark:text-blue-200 mb-2">Need Help?</h3>
          <ul className="text-sm text-blue-800 dark:text-blue-300 space-y-1">
            <li>• <strong>Google Review Link:</strong> Get this from your Google Business Profile</li>
            <li>• <strong>Warranty API Key:</strong> Share this with your website developer for warranty form integration</li>
            <li>• See <code className="bg-blue-100 dark:bg-blue-900 px-1 rounded">WARRANTY_SYSTEM_SETUP.md</code> for full documentation</li>
          </ul>
        </div>
      </main>
    </div>
  )
}
