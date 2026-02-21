'use client'

import { useEffect, useRef, useState } from 'react'
import QRCode from 'qrcode'

interface QRCodeDisplayProps {
  value: string
  size?: number
}

export default function QRCodeDisplay({ value, size = 200 }: QRCodeDisplayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (mounted && canvasRef.current && value) {
      QRCode.toCanvas(canvasRef.current, value, {
        width: size,
        margin: 2,
        color: {
          dark: '#009B4D',
          light: '#FFFFFF',
        },
      }).catch(err => console.error('QR Code generation error:', err))
    }
  }, [value, size, mounted])

  if (!mounted) {
    return <div style={{ width: size, height: size }} className="bg-gray-100 animate-pulse rounded" />
  }

  return <canvas ref={canvasRef} />
}
