'use client'

import { useEffect, useState } from 'react'
import { Download, X } from 'lucide-react'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export default function PwaInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [showPrompt, setShowPrompt] = useState(false)

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault()
      setDeferredPrompt(e as BeforeInstallPromptEvent)

      // Don't show if already dismissed recently
      const dismissed = localStorage.getItem('pwa-install-dismissed')
      if (dismissed) {
        const dismissedTime = parseInt(dismissed, 10)
        const hoursSince = (Date.now() - dismissedTime) / (1000 * 60 * 60)
        if (hoursSince < 24) return
      }

      setShowPrompt(true)
    }

    window.addEventListener('beforeinstallprompt', handler)

    // If already installed (standalone mode), don't show
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setShowPrompt(false)
    }

    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  const handleInstall = async () => {
    if (!deferredPrompt) return
    await deferredPrompt.prompt()
    const choice = await deferredPrompt.userChoice
    if (choice.outcome === 'accepted') {
      setShowPrompt(false)
      setDeferredPrompt(null)
    }
  }

  const handleDismiss = () => {
    setShowPrompt(false)
    localStorage.setItem('pwa-install-dismissed', Date.now().toString())
  }

  if (!showPrompt) return null

  return (
    <div className="fixed bottom-4 left-4 right-4 z-50 sm:left-auto sm:right-4 sm:w-80 animate-in slide-in-from-bottom-4 duration-300">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl border-2 border-primary/20 p-4">
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0 w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center">
            <Download className="h-6 w-6 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-bold text-gray-900 dark:text-white text-sm">Install NFD Repairs</h3>
            <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
              Add to your home screen for quick access and notifications.
            </p>
            <div className="flex gap-2 mt-3">
              <button
                onClick={handleInstall}
                className="flex-1 bg-primary hover:bg-primary-dark text-white text-sm font-semibold py-2 px-3 rounded-lg transition-colors"
              >
                Install
              </button>
              <button
                onClick={handleDismiss}
                className="px-3 py-2 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 text-sm font-medium rounded-lg transition-colors"
              >
                Not now
              </button>
            </div>
          </div>
          <button
            onClick={handleDismiss}
            className="flex-shrink-0 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  )
}
