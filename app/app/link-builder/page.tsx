'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Home, Link2, Copy, Check, ExternalLink } from 'lucide-react'

const PRESETS = [
  { source: 'sms', medium: 'sms', label: 'SMS Text', icon: '💬' },
  { source: 'wa', medium: 'whatsapp', label: 'WhatsApp', icon: '🟢' },
  { source: 'fb', medium: 'social', label: 'Facebook', icon: '📘' },
  { source: 'ig', medium: 'social', label: 'Instagram', icon: '📷' },
  { source: 'email', medium: 'email', label: 'Email', icon: '✉️' },
  { source: 'google', medium: 'search', label: 'Google Ad', icon: '🔍' },
  { source: 'flyer', medium: 'print', label: 'Flyer/Card', icon: '📄' },
  { source: 'word', medium: 'word_of_mouth', label: 'Word of Mouth', icon: '👥' },
]

const SITE_DOMAIN = 'https://newforestdevicerepairs.co.uk'

export default function LinkBuilderPage() {
  const [selectedPreset, setSelectedPreset] = useState<typeof PRESETS[0] | null>(null)
  const [campaign, setCampaign] = useState('')
  const [customSource, setCustomSource] = useState('')
  const [copiedShort, setCopiedShort] = useState(false)
  const [copiedFull, setCopiedFull] = useState(false)
  const [showFull, setShowFull] = useState(false)

  const source = customSource.trim() || selectedPreset?.source || ''
  const medium = selectedPreset?.medium || 'custom'
  const campaignTrimmed = campaign.trim()

  const hasResult = source.length > 0

  const shortPath = `/q/${source}${campaignTrimmed ? `/${campaignTrimmed}` : ''}`
  const shortUrl = `${SITE_DOMAIN}${shortPath}`

  const fullUrlParams = new URLSearchParams({
    s: source,
    utm_source: source,
    utm_medium: medium,
  })
  if (campaignTrimmed) fullUrlParams.set('utm_campaign', campaignTrimmed)
  const fullUrl = `${SITE_DOMAIN}/quote/?${fullUrlParams.toString()}`

  const copyText = async (text: string, type: 'short' | 'full') => {
    try {
      await navigator.clipboard.writeText(text)
      if (type === 'short') {
        setCopiedShort(true)
        setTimeout(() => setCopiedShort(false), 2000)
      } else {
        setCopiedFull(true)
        setTimeout(() => setCopiedFull(false), 2000)
      }
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <header className="bg-white dark:bg-gray-800 shadow-sm sticky top-0 z-10">
        <div className="px-4 py-3">
          <div className="flex items-center gap-2 mb-3">
            <Link href="/app" className="w-10 h-10 flex items-center justify-center rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
              <Home className="h-5 w-5 text-primary" />
            </Link>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <Link2 className="w-5 h-5 text-green-600" />
              Link Builder
            </h1>
          </div>
          <Link
            href="/app/analytics"
            className="flex items-center gap-1.5 text-sm text-green-600 dark:text-green-400 font-medium px-3 py-2 bg-green-50 dark:bg-green-900/20 rounded-lg w-fit"
          >
            <span>← Back to Analytics</span>
          </Link>
        </div>
      </header>

      <main className="p-4 space-y-4 max-w-2xl mx-auto">
        <div className="bg-white dark:bg-gray-800 rounded-xl p-4 space-y-4">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Create tagged links so analytics knows where people came from. Use this when sending links via SMS, WhatsApp, Facebook, etc.
          </p>

          {/* Preset buttons */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
              Where are you sending this link?
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {PRESETS.map((preset) => (
                <button
                  key={preset.source}
                  onClick={() => {
                    setSelectedPreset(preset)
                    setCustomSource('')
                  }}
                  className={`flex items-center gap-2 px-3 py-2.5 rounded-lg border-2 text-sm font-medium transition-all ${
                    selectedPreset?.source === preset.source
                      ? 'border-green-500 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400'
                      : 'border-gray-200 dark:border-gray-600 hover:border-green-400 hover:bg-green-50 dark:hover:bg-green-900/10 text-gray-700 dark:text-gray-300'
                  }`}
                >
                  <span className="text-base">{preset.icon}</span>
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          {/* Campaign name */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
              Campaign name (optional)
            </label>
            <input
              type="text"
              value={campaign}
              onChange={(e) => setCampaign(e.target.value)}
              placeholder="e.g. summer_offer"
              className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:border-green-500 focus:outline-none"
            />
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Keep it short for SMS. Only use letters, numbers, underscores, hyphens.
            </p>
          </div>

          {/* Custom source */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
              Or use a custom tag (optional)
            </label>
            <input
              type="text"
              value={customSource}
              onChange={(e) => setCustomSource(e.target.value)}
              placeholder="e.g. youtube, local_ad, blog"
              className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:border-green-500 focus:outline-none"
            />
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Overrides the preset above. Keep it short!
            </p>
          </div>

          {/* Result */}
          {hasResult && (
            <div className="bg-green-50 dark:bg-green-900/20 border-2 border-green-500 rounded-xl p-4 space-y-3">
              <div>
                <label className="block text-sm font-semibold text-green-800 dark:text-green-400 mb-1.5">
                  Short link (copy this):
                </label>
                <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg p-3 font-mono text-sm text-gray-900 dark:text-white break-all">
                  {shortUrl}
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => copyText(shortUrl, 'short')}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white transition-colors ${
                    copiedShort ? 'bg-teal-600' : 'bg-green-600 hover:bg-green-700'
                  }`}
                >
                  {copiedShort ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  {copiedShort ? 'Copied!' : 'Copy Short Link'}
                </button>
                <button
                  onClick={() => copyText(fullUrl, 'full')}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white transition-colors ${
                    copiedFull ? 'bg-teal-600' : 'bg-gray-600 hover:bg-gray-700'
                  }`}
                >
                  {copiedFull ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  {copiedFull ? 'Copied!' : 'Copy Full URL'}
                </button>
                <a
                  href={shortUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-green-700 dark:text-green-400 bg-white dark:bg-gray-800 border border-green-300 dark:border-green-700 hover:bg-green-50 dark:hover:bg-green-900/20"
                >
                  <ExternalLink className="w-4 h-4" />
                  Test Link
                </a>
              </div>

              {/* Full URL toggle */}
              <button
                onClick={() => setShowFull(!showFull)}
                className="text-xs text-green-700 dark:text-green-400 hover:underline"
              >
                {showFull ? '↑ Hide full URL' : '↓ Show full URL'}
              </button>
              {showFull && (
                <div className="text-xs text-gray-600 dark:text-gray-400">
                  <span className="font-semibold">Full URL (for reference):</span>
                  <div className="mt-1 font-mono break-all bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded p-2">
                    {fullUrl}
                  </div>
                </div>
              )}
            </div>
          )}

          {!hasResult && (
            <div className="text-center py-8 text-gray-400 dark:text-gray-500 text-sm">
              Select a source above to generate a tagged link.
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
