'use client'

import { useState } from 'react'
import { MapPin, Loader2, CheckCircle, XCircle } from 'lucide-react'

interface ImHereButtonProps {
  jobId: string
  jobRef: string
  shopLatitude: number
  shopLongitude: number
  radiusMeters?: number
}

export default function ImHereButton({
  jobId,
  jobRef,
  shopLatitude,
  shopLongitude,
  radiusMeters = 100
}: ImHereButtonProps) {
  const [checking, setChecking] = useState(false)
  const [result, setResult] = useState<'success' | 'too-far' | 'error' | null>(null)
  const [distance, setDistance] = useState<number | null>(null)

  const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
    const R = 6371e3 // Earth's radius in meters
    const φ1 = lat1 * Math.PI / 180
    const φ2 = lat2 * Math.PI / 180
    const Δφ = (lat2 - lat1) * Math.PI / 180
    const Δλ = (lon2 - lon1) * Math.PI / 180

    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ / 2) * Math.sin(Δλ / 2)
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))

    return R * c // Distance in meters
  }

  const handleImHere = async () => {
    setChecking(true)
    setResult(null)

    try {
      // Request GPS permission
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        if (!navigator.geolocation) {
          reject(new Error('Geolocation not supported'))
          return
        }

        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 0
        })
      })

      const { latitude, longitude } = position.coords
      
      // Calculate distance from shop
      const distanceMeters = calculateDistance(
        latitude,
        longitude,
        shopLatitude,
        shopLongitude
      )
      
      setDistance(Math.round(distanceMeters))

      // Check if within radius
      if (distanceMeters <= radiusMeters) {
        // Send notification to shop
        const response = await fetch('/api/notifications/customer-arrived', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jobId,
            jobRef,
            customerLatitude: latitude,
            customerLongitude: longitude,
            distanceMeters: Math.round(distanceMeters)
          })
        })

        if (response.ok) {
          setResult('success')
        } else {
          setResult('error')
        }
      } else {
        setResult('too-far')
      }
    } catch (error) {
      console.error('GPS error:', error)
      setResult('error')
    } finally {
      setChecking(false)
    }
  }

  if (result === 'success') {
    return (
      <div className="bg-green-50 border-2 border-green-200 rounded-xl p-6 text-center">
        <CheckCircle className="h-12 w-12 text-green-600 mx-auto mb-3" />
        <h3 className="text-lg font-bold text-green-900 mb-2">Perfect! 👋</h3>
        <p className="text-sm text-green-700">
          We've linked your arrival to your repair job. This helps us identify which device is yours.
        </p>
      </div>
    )
  }

  if (result === 'too-far') {
    return (
      <div className="bg-yellow-50 border-2 border-yellow-200 rounded-xl p-6 text-center">
        <MapPin className="h-12 w-12 text-yellow-600 mx-auto mb-3" />
        <h3 className="text-lg font-bold text-yellow-900 mb-2">Not quite there yet</h3>
        <p className="text-sm text-yellow-700 mb-3">
          You're about {distance}m away. This button works when you're at our location.
        </p>
        <button
          onClick={() => setResult(null)}
          className="text-sm text-yellow-800 underline font-semibold"
        >
          Try again
        </button>
      </div>
    )
  }

  if (result === 'error') {
    return (
      <div className="bg-red-50 border-2 border-red-200 rounded-xl p-6 text-center">
        <XCircle className="h-12 w-12 text-red-600 mx-auto mb-3" />
        <h3 className="text-lg font-bold text-red-900 mb-2">Couldn't verify location</h3>
        <p className="text-sm text-red-700 mb-3">
          Please make sure location services are enabled and try again.
        </p>
        <button
          onClick={() => setResult(null)}
          className="text-sm text-red-800 underline font-semibold"
        >
          Try again
        </button>
      </div>
    )
  }

  return (
    <button
      onClick={handleImHere}
      disabled={checking}
      className="w-full bg-primary hover:bg-primary-dark text-white font-bold py-4 px-6 rounded-xl transition-all shadow-md active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
    >
      <div className="flex items-center justify-center space-x-2">
        {checking ? (
          <>
            <Loader2 className="h-5 w-5 animate-spin" />
            <span>Checking location...</span>
          </>
        ) : (
          <>
            <MapPin className="h-5 w-5" />
            <span>I'm Here for Collection</span>
          </>
        )}
      </div>
    </button>
  )
}
