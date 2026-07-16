'use client'

import { AlertCircle, Lock } from 'lucide-react'

interface OnboardingGateProps {
  onboardingCompleted: boolean
  jobRef: string
}

export default function OnboardingGate({ onboardingCompleted, jobRef }: OnboardingGateProps) {
  if (onboardingCompleted) return null

  return (
    <div className="bg-yellow-50 border-2 border-yellow-300 rounded-xl p-5 mb-6">
      <div className="flex items-start space-x-3">
        <Lock className="h-6 w-6 text-yellow-600 flex-shrink-0 mt-1" />
        <div className="flex-1">
          <h3 className="font-bold text-yellow-900 text-lg mb-2">
            Customer Onboarding Required
          </h3>
          <p className="text-yellow-800 text-sm mb-3">
            This job cannot progress until the customer completes the onboarding process. 
            They need to provide:
          </p>
          <ul className="text-yellow-800 text-sm space-y-1 mb-3">
            <li>• Email address (if not provided)</li>
            <li>• Device password/passcode</li>
            <li>• Terms acceptance</li>
          </ul>
          <p className="text-yellow-800 text-sm font-semibold">
            An SMS with the onboarding link has been sent to the customer.
          </p>
        </div>
      </div>
    </div>
  )
}
