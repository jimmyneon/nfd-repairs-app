'use client'

import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  CheckCircle,
  Loader2,
  Lock,
  Mail,
  Shield,
} from 'lucide-react'

const LAST_STEP = 2

type IntakeJob = {
  job_ref: string
  customer_name: string
  customer_email: string | null
  device_type: string | null
  device_make: string | null
  device_model: string | null
  issue: string | null
  description: string | null
  password_not_applicable: boolean
  has_device_password: boolean
  terms_accepted: boolean
  is_warranty: boolean
}

const issueOptions: Record<string, string[]> = {
  phone: ['Screen Replacement', 'Battery Replacement', 'Charging Port Replacement', 'Not Charging', 'Water Damage', 'No Power', 'Black Screen', 'Data Recovery', 'Software Issues', 'Other'],
  tablet: ['Screen Replacement', 'Battery Replacement', 'Charging Port Replacement', 'Not Charging', 'Water Damage', 'No Power', 'Black Screen', 'Software Issues', 'Other'],
  laptop: ['Screen Replacement', 'Keyboard Replacement', 'Battery Replacement', 'Charging Issues', 'Windows Reinstall', 'Software Issues', 'Hardware Diagnostics', 'Data Recovery', 'Other'],
  macbook: ['Screen Replacement', 'Battery Replacement', 'Keyboard Replacement', 'Charging Issues', 'macOS Reinstall', 'Software Issues', 'Hardware Diagnostics', 'Data Recovery', 'Other'],
  console: ['HDMI Port Replacement', 'Disc Drive Issues', 'Overheating', 'No Power', 'Software Issues', 'Controller Issues', 'Other'],
  other: ['Hardware Issue', 'Software Issue', 'Data Recovery', 'Other'],
}

function isPlaceholder(value: string | null | undefined) {
  return !value || ['to be added', 'to be assessed', 'unknown', 'repair needed'].includes(value.trim().toLowerCase())
}

export default function CompleteWalkInPage({ params }: { params: { token: string } }) {
  const searchParams = useSearchParams()
  const agreementOnly = searchParams.get('mode') === 'agreement'
  const [job, setJob] = useState<IntakeJob | null>(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [currentStep, setCurrentStep] = useState(agreementOnly ? LAST_STEP : 0)

  const [formData, setFormData] = useState({
    deviceType: 'phone',
    deviceMake: '',
    deviceModel: '',
    issue: '',
    description: '',
    notSure: false,
    customerEmail: '',
    emailOptOut: false,
    passcodeChoice: 'later' as 'later' | 'not_needed' | 'provided',
    devicePassword: '',
    termsAccepted: false,
    diagnosticFeeAcknowledged: false,
    marketingOptIn: false,
  })

  useEffect(() => {
    const loadJob = async () => {
      try {
        const response = await fetch(`/api/public/intake/${encodeURIComponent(params.token)}`, { cache: 'no-store' })
        const result = await response.json()
        if (!response.ok || !result.job) throw new Error(result.error || 'Invalid or expired link')

        const loaded = result.job as IntakeJob
        setJob(loaded)
        setFormData(prev => ({
          ...prev,
          deviceType: loaded.device_type || 'phone',
          deviceMake: isPlaceholder(loaded.device_make) ? '' : (loaded.device_make || ''),
          deviceModel: isPlaceholder(loaded.device_model) ? '' : (loaded.device_model || ''),
          issue: isPlaceholder(loaded.issue) ? '' : (loaded.issue || ''),
          description: loaded.description?.startsWith('Quick intake') ? '' : (loaded.description || ''),
          customerEmail: loaded.customer_email || '',
          emailOptOut: !loaded.customer_email,
          passcodeChoice: loaded.has_device_password ? 'later' : loaded.password_not_applicable ? 'not_needed' : 'later',
          termsAccepted: loaded.terms_accepted,
          diagnosticFeeAcknowledged: loaded.is_warranty,
        }))
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Invalid or expired link')
      } finally {
        setLoading(false)
      }
    }

    loadJob()
  }, [params.token])

  const setField = <K extends keyof typeof formData>(key: K, value: (typeof formData)[K]) => {
    setFormData(prev => ({ ...prev, [key]: value }))
    setError(null)
  }

  const goNext = () => {
    if (currentStep === 0 && !formData.notSure) {
      if (!formData.deviceMake.trim()) return setError('Please enter the device make, or choose “I’m not sure”')
      if (!formData.deviceModel.trim()) return setError('Please enter the device model, or choose “I’m not sure”')
      if (!formData.issue) return setError('Please select the issue, or choose “I’m not sure”')
    }
    if (currentStep === 1 && formData.passcodeChoice === 'provided' && !formData.devicePassword.trim()) {
      return setError('Please enter the passcode or choose another passcode option')
    }
    setError(null)
    setCurrentStep(step => Math.min(step + 1, LAST_STEP))
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const goBack = () => {
    setError(null)
    setCurrentStep(step => Math.max(step - 1, 0))
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handleSubmit = async () => {
    if (!formData.termsAccepted) return setError('Please accept the repair terms')
    if (!job?.is_warranty && !formData.diagnosticFeeAcknowledged) {
      return setError('Please acknowledge the diagnostic fee policy')
    }

    setSubmitting(true)
    setError(null)
    try {
      const response = await fetch(`/api/public/intake/${encodeURIComponent(params.token)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          device_type: formData.deviceType,
          device_make: formData.deviceMake,
          device_model: formData.deviceModel,
          issue: formData.issue,
          description: formData.description,
          not_sure: formData.notSure,
          customer_email: formData.customerEmail,
          email_opt_out: formData.emailOptOut,
          passcode_choice: formData.passcodeChoice,
          device_password: formData.devicePassword,
          terms_accepted: formData.termsAccepted,
          diagnostic_fee_acknowledged: formData.diagnosticFeeAcknowledged,
          marketing_opt_in: formData.marketingOptIn,
        }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Unable to save your details')
      setSuccess(true)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return <div className="min-h-screen bg-slate-50 flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
  }

  if (!job) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-3xl shadow-lg p-8 text-center">
          <AlertCircle className="h-16 w-16 text-red-500 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Unable to open this form</h1>
          <p className="text-gray-600">{error || 'Please ask us to send you a new link.'}</p>
        </div>
      </div>
    )
  }

  if (success) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-50 to-emerald-100 flex items-center justify-center p-4">
        <div className="max-w-lg w-full bg-white rounded-3xl shadow-xl p-8 sm:p-12 text-center">
          <CheckCircle className="h-20 w-20 text-green-600 mx-auto mb-5" />
          <h1 className="text-3xl font-bold text-gray-900 mb-3">All done</h1>
          <p className="text-gray-600 mb-6">Your details and repair agreement have been saved.</p>
          <div className="rounded-2xl bg-blue-50 border border-blue-200 p-5 mb-6">
            <p className="text-xs font-semibold text-blue-800 uppercase tracking-wide">Repair reference</p>
            <p className="text-3xl font-bold font-mono text-blue-700 mt-1">{job.job_ref}</p>
          </div>
          {agreementOnly ? (
            <div className="grid sm:grid-cols-2 gap-3">
              <a href="/app/jobs/create" className="inline-flex justify-center bg-primary text-white font-bold py-3 px-5 rounded-xl">Book next customer</a>
              <a href="/app/jobs" className="inline-flex justify-center bg-gray-200 text-gray-900 font-bold py-3 px-5 rounded-xl">Return to jobs</a>
            </div>
          ) : (
            <a href={`/t/${params.token}`} className="inline-flex justify-center bg-primary text-white font-bold py-3 px-8 rounded-xl">Track my repair</a>
          )}
        </div>
      </div>
    )
  }

  const stepLabels = ['Device', 'Contact', 'Agreement']

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-blue-50 py-6 px-3 sm:px-4">
      <div className="max-w-2xl mx-auto">
        <div className="mb-5 text-center">
          <p className="text-sm font-semibold text-primary mb-1">New Forest Device Repairs · {job.job_ref}</p>
          <h1 className="text-3xl font-bold text-gray-900">{agreementOnly ? 'Confirm your repair' : 'Complete your check-in'}</h1>
          <p className="text-gray-600 mt-2">Hi {job.customer_name.split(' ')[0]}, this should only take a minute.</p>
        </div>

        {!agreementOnly && (
          <div className="flex justify-center mb-5" aria-label={`Step ${currentStep + 1} of 3`}>
            {stepLabels.map((label, index) => (
              <div key={label} className="flex items-center">
                <div className="flex flex-col items-center gap-1">
                  <span className={`h-9 w-9 rounded-full flex items-center justify-center font-bold ${index <= currentStep ? 'bg-primary text-white' : 'bg-gray-200 text-gray-500'}`}>
                    {index < currentStep ? <CheckCircle className="h-5 w-5" /> : index + 1}
                  </span>
                  <span className="text-[11px] font-semibold text-gray-600">{label}</span>
                </div>
                {index < stepLabels.length - 1 && <div className={`w-12 sm:w-20 h-1 mx-2 mb-5 ${index < currentStep ? 'bg-primary' : 'bg-gray-200'}`} />}
              </div>
            ))}
          </div>
        )}

        {error && (
          <div role="alert" className="mb-4 p-4 bg-red-50 border-2 border-red-300 rounded-xl flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
            <p className="text-sm font-semibold text-red-800">{error}</p>
          </div>
        )}

        <div className="bg-white rounded-3xl shadow-xl border border-gray-100 p-5 sm:p-8">
          {currentStep === 0 && (
            <section className="space-y-5">
              <div><h2 className="text-2xl font-bold text-gray-900">What device have you left?</h2><p className="text-sm text-gray-500 mt-1">Fill in what you know. We can identify it for you if needed.</p></div>
              <label className="flex items-center gap-3 p-4 rounded-xl border-2 border-gray-200 cursor-pointer">
                <input type="checkbox" checked={formData.notSure} onChange={event => setField('notSure', event.target.checked)} className="h-5 w-5 rounded text-primary" />
                <span className="font-semibold text-gray-900">I’m not sure — let staff identify it</span>
              </label>
              {!formData.notSure && <>
                <label className="block"><span className="block text-sm font-semibold mb-2">Device type</span><select value={formData.deviceType} onChange={event => setField('deviceType', event.target.value)} className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl bg-white text-lg"><option value="phone">Phone</option><option value="tablet">Tablet</option><option value="laptop">Windows laptop</option><option value="macbook">MacBook</option><option value="console">Games console</option><option value="other">Other</option></select></label>
                <label className="block"><span className="block text-sm font-semibold mb-2">Make</span><input value={formData.deviceMake} onChange={event => setField('deviceMake', event.target.value)} className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl text-lg" placeholder="For example Apple, Samsung or HP" /></label>
                <label className="block"><span className="block text-sm font-semibold mb-2">Model</span><input value={formData.deviceModel} onChange={event => setField('deviceModel', event.target.value)} className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl text-lg" placeholder="For example iPhone 14 or Pavilion 15" /></label>
                <label className="block"><span className="block text-sm font-semibold mb-2">Main problem</span><select value={formData.issue} onChange={event => setField('issue', event.target.value)} className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl bg-white text-lg"><option value="">Choose the closest option…</option>{(issueOptions[formData.deviceType] || issueOptions.other).map(issue => <option key={issue}>{issue}</option>)}</select></label>
                <label className="block"><span className="block text-sm font-semibold mb-2">Anything else we should know? <span className="font-normal text-gray-500">Optional</span></span><textarea value={formData.description} onChange={event => setField('description', event.target.value)} rows={3} className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl" /></label>
              </>}
            </section>
          )}

          {currentStep === 1 && (
            <section className="space-y-5">
              <div><h2 className="text-2xl font-bold text-gray-900">Contact and testing</h2><p className="text-sm text-gray-500 mt-1">Email is optional. Only provide a passcode if we will need it to test the repair.</p></div>
              <label className="block"><span className="flex items-center gap-2 text-sm font-semibold mb-2"><Mail className="h-4 w-4" />Email address <span className="font-normal text-gray-500">Optional</span></span><input type="email" value={formData.customerEmail} disabled={formData.emailOptOut} onChange={event => setField('customerEmail', event.target.value)} className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl disabled:bg-gray-100" /></label>
              <label className="flex items-center gap-3"><input type="checkbox" checked={formData.emailOptOut} onChange={event => { setField('emailOptOut', event.target.checked); if (event.target.checked) setField('customerEmail', '') }} className="h-5 w-5 rounded text-primary" /><span className="text-sm">No email address / SMS only</span></label>
              <fieldset className="space-y-2"><legend className="flex items-center gap-2 text-sm font-semibold mb-2"><Lock className="h-4 w-4" />Device passcode</legend>
                {[['later', 'Not now — staff can ask if needed'], ['not_needed', 'No passcode is needed'], ['provided', 'Enter the passcode securely now']].map(([value, label]) => <label key={value} className={`block p-3 rounded-xl border-2 cursor-pointer ${formData.passcodeChoice === value ? 'border-primary bg-blue-50' : 'border-gray-200'}`}><input type="radio" className="mr-3" checked={formData.passcodeChoice === value} onChange={() => setField('passcodeChoice', value as typeof formData.passcodeChoice)} />{label}</label>)}
              </fieldset>
              {formData.passcodeChoice === 'provided' && <input type="text" value={formData.devicePassword} onChange={event => setField('devicePassword', event.target.value)} className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl" placeholder="Device passcode" autoComplete="off" />}
            </section>
          )}

          {currentStep === 2 && (
            <section className="space-y-5">
              <div><h2 className="text-2xl font-bold text-gray-900">Repair agreement</h2><p className="text-sm text-gray-500 mt-1">Please check the information below before confirming.</p></div>
              <div className="rounded-xl bg-gray-50 border border-gray-200 p-4 text-sm space-y-2">
                <p><span className="text-gray-500">Device:</span> <strong>{formData.notSure ? 'Staff to identify' : (`${formData.deviceMake || job.device_make || ''} ${formData.deviceModel || job.device_model || ''}`.trim() || 'Staff to identify')}</strong></p>
                <p><span className="text-gray-500">Issue:</span> <strong>{formData.notSure ? 'Staff to assess' : (formData.issue || job.issue || 'Staff to assess')}</strong></p>
              </div>
              {!job.is_warranty && <>
                <div className="rounded-xl bg-amber-50 border-2 border-amber-200 p-4 text-sm text-amber-900"><strong>Diagnostic fees:</strong> where diagnosis is required, the minimum is £20 for small devices and £40 for laptops, desktops and consoles. It is deducted from the repair cost if you proceed.</div>
                <label className="flex items-start gap-3 p-4 rounded-xl border-2 border-amber-200 cursor-pointer"><input type="checkbox" checked={formData.diagnosticFeeAcknowledged} onChange={event => setField('diagnosticFeeAcknowledged', event.target.checked)} className="h-6 w-6 mt-0.5 rounded text-amber-600" /><span><strong>I understand the diagnostic fee policy</strong></span></label>
              </>}
              {job.is_warranty && <div className="rounded-xl bg-green-50 border-2 border-green-200 p-4 flex gap-3"><Shield className="h-5 w-5 text-green-700" /><p className="text-sm text-green-900"><strong>Warranty return:</strong> there is no diagnostic charge for work covered by the warranty.</p></div>}
              <label className="flex items-start gap-3 p-4 rounded-xl border-2 border-blue-200 bg-blue-50 cursor-pointer"><input type="checkbox" checked={formData.termsAccepted} onChange={event => setField('termsAccepted', event.target.checked)} className="h-6 w-6 mt-0.5 rounded text-primary" /><span className="text-sm"><strong>I accept the repair terms and authorise inspection and agreed repair work for this booking.</strong><a href="https://nfdr.uk/terms-and-conditions/" target="_blank" rel="noopener noreferrer" onClick={event => event.stopPropagation()} className="block mt-1 text-primary font-semibold underline">Read the full terms</a></span></label>
              <label className="flex items-start gap-3 p-4 rounded-xl border border-gray-200 cursor-pointer"><input type="checkbox" checked={formData.marketingOptIn} onChange={event => setField('marketingOptIn', event.target.checked)} className="h-5 w-5 mt-0.5 rounded text-primary" /><span className="text-sm"><strong>Send me occasional offers and repair tips</strong><span className="block text-xs text-gray-500 mt-1">Optional. You can unsubscribe at any time.</span></span></label>
            </section>
          )}
        </div>

        <div className="flex gap-3 mt-5">
          {!agreementOnly && currentStep > 0 && <button type="button" onClick={goBack} className="px-5 py-4 rounded-xl font-semibold bg-gray-200 text-gray-800 flex items-center gap-2"><ArrowLeft className="h-5 w-5" />Back</button>}
          {currentStep < LAST_STEP ? <button type="button" onClick={goNext} className="flex-1 py-4 rounded-xl font-bold bg-primary text-white flex items-center justify-center gap-2">Continue<ArrowRight className="h-5 w-5" /></button> : <button type="button" onClick={handleSubmit} disabled={submitting} className="flex-1 py-4 rounded-xl font-bold bg-green-600 text-white disabled:opacity-50 flex items-center justify-center gap-2">{submitting ? <><Loader2 className="h-5 w-5 animate-spin" />Saving…</> : <><CheckCircle className="h-5 w-5" />Accept and finish</>}</button>}
        </div>
      </div>

    </div>
  )
}
