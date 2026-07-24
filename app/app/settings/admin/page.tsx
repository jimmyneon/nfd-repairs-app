'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { ArrowLeft, Home, Save, Loader2, Link as LinkIcon, Star, Plus, Clock } from 'lucide-react'
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
  const [shopLatitude, setShopLatitude] = useState('')
  const [shopLongitude, setShopLongitude] = useState('')
  const [gpsRadius, setGpsRadius] = useState('100')
  const [openingHours, setOpeningHours] = useState<Record<string, { isOpen: boolean; open: string; close: string }>>({
    Sunday:    { isOpen: false, open: '10:00', close: '17:00' },
    Monday:    { isOpen: true,  open: '10:00', close: '17:00' },
    Tuesday:   { isOpen: true,  open: '10:00', close: '17:00' },
    Wednesday: { isOpen: true,  open: '10:00', close: '17:00' },
    Thursday:  { isOpen: true,  open: '10:00', close: '17:00' },
    Friday:    { isOpen: true,  open: '10:00', close: '17:00' },
    Saturday:  { isOpen: true,  open: '10:00', close: '15:00' },
  })
  const [specialHoursActive, setSpecialHoursActive] = useState(false)
  const [specialHoursNote, setSpecialHoursNote] = useState('')
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

    // Load GPS coordinates from the first (and only) admin_settings record
    const { data: gpsData } = await supabase
      .from('admin_settings')
      .select('id, shop_latitude, shop_longitude, gps_radius_meters')
      .limit(1)
      .single()

    if (gpsData) {
      setShopLatitude(gpsData.shop_latitude?.toString() || '')
      setShopLongitude(gpsData.shop_longitude?.toString() || '')
      setGpsRadius(gpsData.gps_radius_meters?.toString() || '100')
    }

    // Load opening hours and special hours from admin_settings
    const { data: hoursData } = await supabase
      .from('admin_settings')
      .select('key, value')
      .in('key', ['opening_hours', 'special_hours'])

    if (hoursData) {
      const hoursSetting = hoursData.find(s => s.key === 'opening_hours')
      if (hoursSetting?.value) {
        try {
          const parsed = typeof hoursSetting.value === 'string' 
            ? JSON.parse(hoursSetting.value) 
            : hoursSetting.value
          if (parsed && typeof parsed === 'object') {
            const newHours: Record<string, { isOpen: boolean; open: string; close: string }> = {}
            for (const [day, data] of Object.entries(parsed)) {
              const d = data as any
              newHours[day] = {
                isOpen: d.isOpen ?? false,
                open: d.open ?? '10:00',
                close: d.close ?? '17:00',
              }
            }
            if (Object.keys(newHours).length > 0) {
              setOpeningHours(newHours)
            }
          }
        } catch (e) {
          console.error('Failed to parse opening_hours:', e)
        }
      }

      const specialSetting = hoursData.find(s => s.key === 'special_hours')
      if (specialSetting?.value) {
        try {
          const parsed = typeof specialSetting.value === 'string' 
            ? JSON.parse(specialSetting.value) 
            : specialSetting.value
          if (parsed && typeof parsed === 'object') {
            setSpecialHoursActive(parsed.active ?? false)
            setSpecialHoursNote(parsed.note ?? '')
          }
        } catch (e) {
          console.error('Failed to parse special_hours:', e)
        }
      }
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

  const saveGpsCoordinates = async () => {
    setSaving(true)
    
    // Get the first admin_settings record ID
    const { data: settingsRecord } = await supabase
      .from('admin_settings')
      .select('id')
      .limit(1)
      .single()
    
    if (!settingsRecord) {
      alert('Failed to find admin settings record')
      setSaving(false)
      return
    }
    
    const { error } = await supabase
      .from('admin_settings')
      .update({
        shop_latitude: parseFloat(shopLatitude) || null,
        shop_longitude: parseFloat(shopLongitude) || null,
        gps_radius_meters: parseInt(gpsRadius) || 100
      })
      .eq('id', settingsRecord.id)

    if (!error) {
      await loadSettings()
      alert('GPS coordinates saved successfully!')
    } else {
      alert('Failed to save: ' + error.message)
    }
    setSaving(false)
  }

  const saveOpeningHours = async () => {
    setSaving(true)

    // Build the JSONB object with formatted display strings
    const hoursData: Record<string, any> = {}
    for (const [day, hrs] of Object.entries(openingHours)) {
      const formatTime = (t: string) => {
        if (!t) return ''
        const [h, m] = t.split(':').map(Number)
        const period = h >= 12 ? 'PM' : 'AM'
        const displayH = h > 12 ? h - 12 : (h === 0 ? 12 : h)
        return `${displayH}:${String(m).padStart(2, '0')} ${period}`
      }
      hoursData[day] = {
        isOpen: hrs.isOpen,
        formatted: hrs.isOpen ? `${formatTime(hrs.open)} - ${formatTime(hrs.close)}` : 'Closed',
        open: hrs.isOpen ? hrs.open : null,
        close: hrs.isOpen ? hrs.close : null,
      }
    }

    const { error: hoursError } = await supabase
      .from('admin_settings')
      .upsert({ key: 'opening_hours', value: hoursData, description: 'Weekly opening hours for shop status API' }, { onConflict: 'key' })

    const specialData = { active: specialHoursActive, note: specialHoursNote || null }
    const { error: specialError } = await supabase
      .from('admin_settings')
      .upsert({ key: 'special_hours', value: specialData, description: 'Special hours for holidays/closures' }, { onConflict: 'key' })

    if (!hoursError && !specialError) {
      alert('Opening hours saved successfully!')
    } else {
      alert('Failed to save: ' + (hoursError?.message || specialError?.message))
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
          <div className="flex items-center gap-2 mb-3">
            <Link href="/app/jobs" className="inline-flex items-center justify-center w-10 h-10 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors" title="Home">
              <Home className="h-5 w-5 text-primary" />
            </Link>
            <Link href="/app/jobs/create" className="inline-flex items-center justify-center w-10 h-10 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors" title="Create New Job">
              <Plus className="h-5 w-5 text-primary" />
            </Link>
          </div>
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

        {/* GPS Coordinates */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6">
          <div className="flex items-center mb-4">
            <LinkIcon className="h-6 w-6 text-primary mr-3" />
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">GPS Coordinates</h2>
          </div>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
            Used for the customer "I'm Here" button to verify they're at your shop
          </p>
          <div className="space-y-4 mb-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Latitude
              </label>
              <input
                type="text"
                value={shopLatitude}
                onChange={(e) => setShopLatitude(e.target.value)}
                placeholder="e.g., 55.7558"
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Longitude
              </label>
              <input
                type="text"
                value={shopLongitude}
                onChange={(e) => setShopLongitude(e.target.value)}
                placeholder="e.g., -3.9626"
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Radius (meters)
              </label>
              <input
                type="number"
                value={gpsRadius}
                onChange={(e) => setGpsRadius(e.target.value)}
                placeholder="100"
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              />
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                How close the customer needs to be (default: 100m)
              </p>
            </div>
          </div>
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 mb-4">
            <p className="text-sm text-blue-800 dark:text-blue-200">
              <strong>How to find your coordinates:</strong><br/>
              1. Go to Google Maps<br/>
              2. Right-click on your shop location<br/>
              3. Click the coordinates (they'll copy automatically)<br/>
              4. Paste them here (format: latitude, longitude)
            </p>
          </div>
          <button
            onClick={saveGpsCoordinates}
            disabled={saving}
            className="w-full bg-primary hover:bg-primary-dark text-white font-bold py-3 px-6 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
          >
            {saving ? (
              <>
                <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="h-5 w-5 mr-2" />
                Save GPS Coordinates
              </>
            )}
          </button>
        </div>

        {/* Opening Hours */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
          <div className="flex items-center mb-4">
            <Clock className="h-6 w-6 text-primary mr-2" />
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">Opening Hours</h2>
          </div>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
            These hours are shown on the website contact page and home page via the shop status API. Changes take effect within 1 minute.
          </p>
          <div className="space-y-3 mb-4">
            {Object.entries(openingHours).map(([day, hrs]) => (
              <div key={day} className="flex items-center gap-3 flex-wrap">
                <div className="w-28 flex-shrink-0">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={hrs.isOpen}
                      onChange={(e) => setOpeningHours(prev => ({
                        ...prev,
                        [day]: { ...prev[day], isOpen: e.target.checked }
                      }))}
                      className="rounded border-gray-300 text-primary focus:ring-primary"
                    />
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{day}</span>
                  </label>
                </div>
                {hrs.isOpen ? (
                  <div className="flex items-center gap-2 flex-1">
                    <input
                      type="time"
                      value={hrs.open}
                      onChange={(e) => setOpeningHours(prev => ({
                        ...prev,
                        [day]: { ...prev[day], open: e.target.value }
                      }))}
                      className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                    />
                    <span className="text-gray-500">to</span>
                    <input
                      type="time"
                      value={hrs.close}
                      onChange={(e) => setOpeningHours(prev => ({
                        ...prev,
                        [day]: { ...prev[day], close: e.target.value }
                      }))}
                      className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                    />
                  </div>
                ) : (
                  <span className="text-sm text-gray-400 italic">Closed</span>
                )}
              </div>
            ))}
          </div>

          {/* Special hours / holiday notice */}
          <div className="border-t border-gray-200 dark:border-gray-700 pt-4 mt-4">
            <div className="flex items-center gap-2 mb-3">
              <input
                type="checkbox"
                checked={specialHoursActive}
                onChange={(e) => setSpecialHoursActive(e.target.checked)}
                className="rounded border-gray-300 text-primary focus:ring-primary"
              />
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Show special hours / holiday notice
              </label>
            </div>
            {specialHoursActive && (
              <input
                type="text"
                value={specialHoursNote}
                onChange={(e) => setSpecialHoursNote(e.target.value)}
                placeholder="e.g., Closed for Christmas Dec 24-Jan 2"
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm mb-3"
              />
            )}
          </div>

          <button
            onClick={saveOpeningHours}
            disabled={saving}
            className="flex items-center space-x-2 px-6 py-3 bg-primary text-white rounded-xl hover:bg-primary-dark transition-colors disabled:opacity-50"
          >
            {saving ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <Save className="h-5 w-5" />
            )}
            <span>Save Opening Hours</span>
          </button>
        </div>

        {/* Warranty API Key */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6">
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
