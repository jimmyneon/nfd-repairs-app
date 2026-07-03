'use client'

import { useState, useEffect } from 'react'
import QRCode from 'qrcode'
import { QrCode, RefreshCw, Maximize2, Minimize2 } from 'lucide-react'

export default function QRDisplayPage() {
  const [qrDataUrl, setQrDataUrl] = useState<string>('')
  const [fullscreen, setFullscreen] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)

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
  }, [walkInUrl, fullscreen, refreshKey])

  return (
    <div className={`flex flex-col items-center justify-center ${fullscreen ? 'fixed inset-0 z-50 bg-white dark:bg-gray-900' : 'p-6'}`}>
      {!fullscreen && (
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-primary/10 rounded-2xl mb-3">
            <QrCode className="h-7 w-7 text-primary" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-1">
            Walk-In Check-In QR Code
          </h1>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Display this for customers to scan and self-check-in
          </p>
        </div>
      )}

      {qrDataUrl && (
        <div className="bg-white p-6 rounded-3xl shadow-2xl">
          <img
            src={qrDataUrl}
            alt="Walk-in check-in QR code"
            className="block mx-auto"
            style={{ width: fullscreen ? '70vh' : '320px', height: fullscreen ? '70vh' : '320px' }}
          />
        </div>
      )}

      <div className="mt-6 text-center">
        <p className="text-lg font-semibold text-gray-900 dark:text-white mb-1">
          Scan to check in your repair
        </p>
        <p className="text-sm text-gray-500 dark:text-gray-400 break-all">
          {walkInUrl}
        </p>
      </div>

      <div className="mt-6 flex gap-3">
        <button
          onClick={() => setFullscreen(!fullscreen)}
          className="flex items-center gap-2 px-5 py-3 bg-primary text-white rounded-xl hover:bg-primary-dark transition-colors font-medium"
        >
          {fullscreen ? (
            <>
              <Minimize2 className="h-5 w-5" />
              Exit Fullscreen
            </>
          ) : (
            <>
              <Maximize2 className="h-5 w-5" />
              Fullscreen
            </>
          )}
        </button>
        <button
          onClick={() => setRefreshKey(k => k + 1)}
          className="flex items-center gap-2 px-5 py-3 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-xl hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors font-medium"
        >
          <RefreshCw className="h-5 w-5" />
          Refresh
        </button>
      </div>
    </div>
  )
}
