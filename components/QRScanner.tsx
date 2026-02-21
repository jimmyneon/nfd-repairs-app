'use client'

import { useState, useRef, useEffect } from 'react'
import { X, Camera } from 'lucide-react'
import { useRouter } from 'next/navigation'

interface QRScannerProps {
  onClose: () => void
  onScan: (jobRef: string) => void
}

export default function QRScanner({ onClose, onScan }: QRScannerProps) {
  const [error, setError] = useState<string>('')
  const [scanning, setScanning] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const router = useRouter()

  useEffect(() => {
    startCamera()
    return () => {
      stopCamera()
    }
  }, [])

  const startCamera = async () => {
    try {
      setError('')
      setScanning(true)

      // Request camera access
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' } // Use back camera on mobile
      })

      streamRef.current = stream

      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
      }

      // Note: For actual QR scanning, you'd need a library like jsQR or @zxing/library
      // This is a placeholder that shows the camera
      setError('Camera ready. QR scanning library needed for full functionality.')
    } catch (err) {
      console.error('Camera error:', err)
      setError('Unable to access camera. Please check permissions.')
      setScanning(false)
    }
  }

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop())
      streamRef.current = null
    }
    setScanning(false)
  }

  const handleManualEntry = () => {
    const jobRef = prompt('Enter job reference (e.g., NFD-20260221-001):')
    if (jobRef) {
      onScan(jobRef)
      router.push(`/app/jobs?search=${jobRef}`)
      onClose()
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-90 z-50 flex flex-col">
      {/* Header */}
      <div className="bg-gray-900 p-4 flex items-center justify-between">
        <h2 className="text-white text-lg font-bold">Scan QR Code</h2>
        <button
          onClick={() => {
            stopCamera()
            onClose()
          }}
          className="text-white p-2 hover:bg-gray-800 rounded-lg"
        >
          <X className="h-6 w-6" />
        </button>
      </div>

      {/* Camera View */}
      <div className="flex-1 relative flex items-center justify-center">
        <video
          ref={videoRef}
          className="max-w-full max-h-full"
          playsInline
          muted
        />

        {/* Scanning Frame */}
        {scanning && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-64 h-64 border-4 border-primary rounded-2xl shadow-lg">
              <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-white rounded-tl-2xl"></div>
              <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-white rounded-tr-2xl"></div>
              <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-white rounded-bl-2xl"></div>
              <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-white rounded-br-2xl"></div>
            </div>
          </div>
        )}

        {/* Error Message */}
        {error && (
          <div className="absolute bottom-20 left-4 right-4 bg-yellow-500 text-white p-4 rounded-xl">
            <p className="text-sm font-medium">{error}</p>
          </div>
        )}
      </div>

      {/* Bottom Actions */}
      <div className="bg-gray-900 p-4 space-y-3">
        <p className="text-white text-center text-sm mb-2">
          Point camera at QR code on tracking page
        </p>
        <button
          onClick={handleManualEntry}
          className="w-full bg-white text-gray-900 font-semibold py-4 px-6 rounded-xl flex items-center justify-center space-x-2"
        >
          <span>Enter Job Reference Manually</span>
        </button>
      </div>
    </div>
  )
}
