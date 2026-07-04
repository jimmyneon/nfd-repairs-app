'use client'

import { useState, useEffect } from 'react'
import QRCode from 'qrcode'
import { Maximize2, Minimize2 } from 'lucide-react'

export default function QRDisplayPage() {
  const [qrDataUrl, setQrDataUrl] = useState<string>('')
  const [fullscreen, setFullscreen] = useState(false)
  const walkInUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/walk-in`
    : ''

  useEffect(() => {
    if (walkInUrl) {
      QRCode.toDataURL(walkInUrl, {
        width: fullscreen ? 800 : 400,
        margin: 2,
        color: {
          dark: '#1e293b',
          light: '#ffffff',
        },
      }).then(setQrDataUrl)
    }
  }, [walkInUrl, fullscreen])

  return (
    <div className={`flex flex-col items-center justify-center ${fullscreen ? 'fixed inset-0 z-50 bg-white' : 'min-h-screen bg-gray-50 dark:bg-gray-900 p-4'}`}>
      {qrDataUrl && (
        <img
          src={qrDataUrl}
          alt="Scan to check in"
          className="rounded-2xl shadow-lg"
          style={{ width: fullscreen ? '70vh' : '350px', height: fullscreen ? '70vh' : '350px' }}
        />
      )}

      <p className={`mt-4 font-semibold text-gray-900 dark:text-white ${fullscreen ? 'text-2xl' : 'text-base'}`}>
        Scan to check in your repair
      </p>

      <button
        onClick={() => setFullscreen(!fullscreen)}
        className={`mt-4 flex items-center gap-2 px-4 py-2 rounded-xl font-medium transition-colors ${
          fullscreen
            ? 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
        }`}
      >
        {fullscreen ? <Minimize2 className="h-5 w-5" /> : <Maximize2 className="h-5 w-5" />}
        {fullscreen ? 'Exit' : 'Fullscreen'}
      </button>
    </div>
  )
}
