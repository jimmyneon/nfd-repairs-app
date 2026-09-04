'use client'

import { AlertCircle, CheckCircle2, ClipboardList } from 'lucide-react'

interface OnboardingGateProps {
  termsAccepted?: boolean
  deviceMake?: string | null
  deviceModel?: string | null
  issue?: string | null
  hasPasscode?: boolean
  passwordNotApplicable?: boolean
}

const incompleteValue = (value?: string | null) =>
  !value || ['unknown', 'to be added', 'to be assessed', 'repair needed'].includes(value.trim().toLowerCase())

export default function OnboardingGate({
  termsAccepted,
  deviceMake,
  deviceModel,
  issue,
  hasPasscode,
  passwordNotApplicable,
}: OnboardingGateProps) {
  const missing = [
    ...(!termsAccepted ? ['Customer repair agreement'] : []),
    ...(incompleteValue(deviceMake) ? ['Device make'] : []),
    ...(incompleteValue(deviceModel) ? ['Device model'] : []),
    ...(incompleteValue(issue) ? ['Fault / repair required'] : []),
  ]

  const passcodePending = !hasPasscode && !passwordNotApplicable

  if (missing.length === 0) return null

  return (
    <div className="bg-yellow-50 border-2 border-yellow-300 rounded-xl p-5 mb-6">
      <div className="flex items-start space-x-3">
        <ClipboardList className="h-6 w-6 text-yellow-600 flex-shrink-0 mt-1" />
        <div className="flex-1">
          <h3 className="font-bold text-yellow-900 text-lg mb-2">
            {missing.length} {missing.length === 1 ? 'item needs' : 'items need'} attention
          </h3>
          <p className="text-yellow-800 text-sm mb-3">
            The job is saved and can continue, but the following should be completed:
          </p>
          <ul className="text-yellow-800 text-sm space-y-1 mb-3">
            {missing.map(item => <li key={item} className="flex items-center gap-2"><AlertCircle className="h-4 w-4" />{item}</li>)}
            {passcodePending && <li className="flex items-center gap-2 text-yellow-700"><CheckCircle2 className="h-4 w-4" />Passcode can be requested later if testing requires it</li>}
          </ul>
          <p className="text-yellow-800 text-sm font-semibold">
            Open the completion form below and either hand the screen to the customer or complete the known details with them.
          </p>
        </div>
      </div>
    </div>
  )
}
