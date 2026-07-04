'use client'

import { useState, useEffect } from 'react'
import QRCode from 'qrcode'

export default function QRDisplayPage() {
  const [qrDataUrl, setQrDataUrl] = useState<string>('')
  const walkInUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/walk-in`
    : ''

  useEffect(() => {
    if (walkInUrl) {
      QRCode.toDataURL(walkInUrl, {
        width: 600,
        margin: 2,
        color: {
          dark: '#1e293b',
          light: '#ffffff',
        },
      }).then(setQrDataUrl)
    }
  }, [walkInUrl])

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50 dark:bg-gray-900 p-4">
      {qrDataUrl && (
        <img
          src={qrDataUrl}
          alt="Scan to check in"
          className="rounded-2xl shadow-lg"
          style={{ width: 'min(80vw, 500px)', height: 'min(80vw, 500px)' }}
        />
      )}

      <p className="mt-4 font-semibold text-gray-900 dark:text-white text-lg">
        Scan to check in your repair
      </p>
    </div>
  )
}
