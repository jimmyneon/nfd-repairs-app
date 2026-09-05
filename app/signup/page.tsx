'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function SignupPage() {
  const router = useRouter()

  useEffect(() => {
    // Public signup is disabled. Redirect to login.
    router.replace('/login')
  }, [router])

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            NFD Repairs
          </h1>
          <p className="text-gray-600">Staff access is by invitation only</p>
        </div>

        <div className="bg-white rounded-lg shadow-md p-6 text-center">
          <p className="text-gray-600 mb-4">
            New staff accounts are created by the administrator.
          </p>
          <p className="text-sm text-gray-500 mb-6">
            If you need access, please contact the business owner.
          </p>
          <Link href="/login" className="text-primary hover:underline font-medium">
            Go to sign in
          </Link>
        </div>
      </div>
    </div>
  )
}
