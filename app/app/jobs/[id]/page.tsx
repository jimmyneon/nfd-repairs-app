'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { Job, JobEvent, SMSLog, EmailLog, JobStatus } from '@/lib/types-v3'
import { JOB_STATUS_LABELS, JOB_STATUS_COLORS } from '@/lib/constants'
import { ArrowLeft, Clock, DollarSign, Package, CheckCircle, Wrench, AlertCircle, RefreshCw, Smartphone, Laptop, Tablet, Monitor, Gamepad2, Watch, Edit, MessageSquare, Eye, EyeOff, Lock, ShieldCheck } from 'lucide-react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import ContactActions from '@/components/ContactActions'
import StatusChangeModal from '@/components/StatusChangeModal'
import StatusSelectorModal from '@/components/StatusSelectorModal'
import OnboardingGate from '@/components/OnboardingGate'
import ManualOnboardingModal from '@/components/ManualOnboardingModal'
import DelayReasonModal from '@/components/DelayReasonModal'

export default function JobDetailPage({ params }: { params: { id: string } }) {
  const [job, setJob] = useState<Job | null>(null)
  const [events, setEvents] = useState<JobEvent[]>([])
  const [smsLogs, setSmsLogs] = useState<SMSLog[]>([])
  const [emailLogs, setEmailLogs] = useState<EmailLog[]>([])
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)
  const [showStatusModal, setShowStatusModal] = useState(false)
  const [showStatusSelector, setShowStatusSelector] = useState(false)
  const [showSimpleConfirm, setShowSimpleConfirm] = useState(false)
  const [showManualOnboarding, setShowManualOnboarding] = useState(false)
  const [showDelayModal, setShowDelayModal] = useState(false)
  const [showDelayConfirm, setShowDelayConfirm] = useState(false)
  const [newStatus, setNewStatus] = useState<JobStatus | null>(null)
  const [pendingWorkflowStatus, setPendingWorkflowStatus] = useState<JobStatus | null>(null)
  const [pendingDelayReason, setPendingDelayReason] = useState<string>('')
  const [pendingDelayNotes, setPendingDelayNotes] = useState<string>('')
  const [willSendSMS, setWillSendSMS] = useState(false)
  const [willSendEmail, setWillSendEmail] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = createClient()

  const getDeviceIcon = (deviceMake: string, deviceModel: string) => {
    const combined = `${deviceMake} ${deviceModel}`.toLowerCase()
    
    if (combined.includes('iphone') || combined.includes('samsung') || combined.includes('pixel') || combined.includes('phone')) {
      return <Smartphone className="h-16 w-16 md:h-20 md:w-20 text-primary" />
    }
    if (combined.includes('ipad') || combined.includes('tablet')) {
      return <Tablet className="h-16 w-16 md:h-20 md:w-20 text-primary" />
    }
    if (combined.includes('macbook') || combined.includes('laptop')) {
      return <Laptop className="h-16 w-16 md:h-20 md:w-20 text-primary" />
    }
    if (combined.includes('playstation') || combined.includes('xbox') || combined.includes('switch')) {
      return <Gamepad2 className="h-16 w-16 md:h-20 md:w-20 text-primary" />
    }
    if (combined.includes('watch')) {
      return <Watch className="h-16 w-16 md:h-20 md:w-20 text-primary" />
    }
    if (combined.includes('imac') || combined.includes('monitor')) {
      return <Monitor className="h-16 w-16 md:h-20 md:w-20 text-primary" />
    }
    return <Smartphone className="h-16 w-16 md:h-20 md:w-20 text-primary" />
  }

  useEffect(() => {
    loadJobData()
  }, [params.id])

  // Auto-show collection confirmation modal if ?collect=true and status is READY_TO_COLLECT
  useEffect(() => {
    if (job && searchParams.get('collect') === 'true' && job.status === 'READY_TO_COLLECT') {
      setNewStatus('COLLECTED')
      setShowStatusModal(true)
      // Remove query param from URL
      router.replace(`/app/jobs/${params.id}`)
    }
  }, [job, searchParams])

  const loadJobData = async () => {
    const { data: jobData } = await supabase
      .from('jobs')
      .select('*')
      .eq('id', params.id)
      .single()

    const { data: eventsData } = await supabase
      .from('job_events')
      .select('*')
      .eq('job_id', params.id)
      .order('created_at', { ascending: false })

    const { data: smsData } = await supabase
      .from('sms_logs')
      .select('*')
      .eq('job_id', params.id)
      .order('created_at', { ascending: false })

    const { data: emailData } = await supabase
      .from('email_logs')
      .select('*')
      .eq('job_id', params.id)
      .order('created_at', { ascending: false })

    if (jobData) setJob(jobData)
    if (eventsData) setEvents(eventsData)
    if (smsData) setSmsLogs(smsData)
    if (emailData) setEmailLogs(emailData)
    setLoading(false)
  }

  // For manual status changes (from selector modal) - use triple confirmation
  const handleManualStatusChange = async (status: JobStatus) => {
    setNewStatus(status)
    
    // Special handling for DELAYED status - show delay reason modal
    if (status === 'DELAYED') {
      setShowDelayModal(true)
      return
    }
    
    // Check notification config for this status
    const { data: config } = await supabase
      .from('notification_config')
      .select('send_sms, send_email, is_active')
      .eq('status_key', status)
      .single()
    
    setWillSendSMS(config?.send_sms && config?.is_active || false)
    setWillSendEmail(config?.send_email && config?.is_active || false)
    
    setShowStatusModal(true)
  }

  // For workflow status changes - use single confirmation with notification check
  const handleWorkflowStatusChange = async (status: JobStatus) => {
    setPendingWorkflowStatus(status)
    
    // Check notification config for this status
    const { data: config } = await supabase
      .from('notification_config')
      .select('send_sms, send_email, is_active')
      .eq('status_key', status)
      .single()
    
    setWillSendSMS(config?.send_sms && config?.is_active || false)
    setWillSendEmail(config?.send_email && config?.is_active || false)
    
    setShowSimpleConfirm(true)
  }

  const confirmWorkflowStatusChange = async () => {
    if (!job || !pendingWorkflowStatus) return
    setActionLoading(true)
    setShowSimpleConfirm(false)

    // Prepare update object with status and device_in_shop
    const updateData: any = { status: pendingWorkflowStatus }
    
    // Set device_in_shop based on status transition
    if (pendingWorkflowStatus === 'RECEIVED') {
      updateData.device_in_shop = true  // Device now in shop
    } else if (pendingWorkflowStatus === 'COLLECTED') {
      updateData.device_in_shop = false  // Device no longer in shop
    }

    await supabase
      .from('jobs')
      .update(updateData)
      .eq('id', job.id)

    await supabase.from('job_events').insert({
      job_id: job.id,
      type: 'STATUS_CHANGE',
      message: `Status changed to ${JOB_STATUS_LABELS[pendingWorkflowStatus]}`,
    })

    await supabase.from('notifications').insert({
      type: 'STATUS_UPDATE',
      title: `Job ${job.job_ref} updated`,
      body: `Status changed to ${JOB_STATUS_LABELS[pendingWorkflowStatus]}`,
      job_id: job.id,
    })

    // Queue SMS for status change
    try {
      console.log('🔔 Queueing SMS for status:', pendingWorkflowStatus)
      const response = await fetch('/api/jobs/queue-status-sms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jobId: job.id,
          status: pendingWorkflowStatus,
        }),
      })
      console.log('SMS queue response:', response.status, response.ok)
      if (!response.ok) {
        const error = await response.text()
        console.error('SMS queue failed:', error)
      }
    } catch (error) {
      console.error('Failed to queue status SMS:', error)
    }

    // Send email notification
    console.log('📧 Checking email for job:', job.job_ref, 'Email:', job.customer_email)
    if (job.customer_email) {
      try {
        console.log('📧 Calling email API for workflow status change...')
        const emailResponse = await fetch('/api/email/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jobId: job.id,
            type: 'STATUS_UPDATE',
          }),
        })
        const emailResult = await emailResponse.json()
        console.log('📧 Email API response:', emailResponse.status, emailResult)
      } catch (error) {
        console.error('❌ Failed to send email:', error)
      }
    } else {
      console.log('⚠️ No customer email - skipping email notification')
    }

    await loadJobData()
    setActionLoading(false)
    setPendingWorkflowStatus(null)
  }

  const handleDelayReasonSubmit = async (reason: string, notes: string) => {
    // Store delay reason and notes, then check notification config
    setPendingDelayReason(reason)
    setPendingDelayNotes(notes)
    setShowDelayModal(false)
    
    // Check notification config for DELAYED status
    const { data: config } = await supabase
      .from('notification_config')
      .select('send_sms, send_email, is_active')
      .eq('status_key', 'DELAYED')
      .single()
    
    setWillSendSMS(config?.send_sms && config?.is_active || false)
    setWillSendEmail(config?.send_email && config?.is_active || false)
    
    // Show confirmation modal
    setShowDelayConfirm(true)
  }

  const confirmDelayStatusChange = async () => {
    if (!job) return
    setActionLoading(true)
    setShowDelayConfirm(false)

    // Update job with DELAYED status and delay reason/notes
    await supabase
      .from('jobs')
      .update({
        status: 'DELAYED' as JobStatus,
        delay_reason: pendingDelayReason,
        delay_notes: pendingDelayNotes,
      } as any)
      .eq('id', job.id)

    await supabase.from('job_events').insert({
      job_id: job.id,
      type: 'STATUS_CHANGE',
      message: `Status changed to Delayed - ${pendingDelayReason}`,
    } as any)

    await supabase.from('notifications').insert({
      type: 'STATUS_UPDATE',
      title: `Job ${job.job_ref} delayed`,
      body: `Delay reason: ${pendingDelayReason}`,
      job_id: job.id,
    } as any)

    // Queue SMS for DELAYED status (will include delay_reason and delay_notes)
    try {
      await fetch('/api/jobs/queue-status-sms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jobId: job.id,
          status: 'DELAYED',
        }),
      })
    } catch (error) {
      console.error('Failed to queue delay SMS:', error)
    }

    // Send email notification
    if (job.customer_email) {
      try {
        await fetch('/api/email/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jobId: job.id,
            type: 'STATUS_UPDATE',
          }),
        })
      } catch (error) {
        console.error('Failed to send delay email:', error)
      }
    }

    await loadJobData()
    setActionLoading(false)
    setPendingDelayReason('')
    setPendingDelayNotes('')
  }

  const confirmStatusChange = async (skipNotifications?: boolean) => {
    if (!job || !newStatus) return
    setActionLoading(true)
    setShowStatusModal(false)

    const message = `Status changed to ${JOB_STATUS_LABELS[newStatus]}`

    // Prepare update object with status and device_in_shop
    const updateData: any = { status: newStatus }
    
    // Set device_in_shop based on status transition
    if (newStatus === 'RECEIVED') {
      updateData.device_in_shop = true  // Device now in shop
    } else if (newStatus === 'COLLECTED') {
      updateData.device_in_shop = false  // Device no longer in shop
    }

    await supabase
      .from('jobs')
      .update(updateData)
      .eq('id', job.id)

    await supabase.from('job_events').insert({
      job_id: job.id,
      type: 'STATUS_CHANGE',
      message,
    } as any)

    await supabase.from('notifications').insert({
      type: 'STATUS_UPDATE',
      title: `Job ${job.job_ref} updated`,
      body: message,
      job_id: job.id,
    } as any)

    // Queue SMS and Email for status change (unless skipped)
    if (!skipNotifications) {
      try {
        console.log('🔔 Queueing notifications for status:', newStatus)
        const response = await fetch('/api/jobs/queue-status-sms', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jobId: job.id,
            status: newStatus,
          }),
        })
        console.log('Notification queue response:', response.status, response.ok)
        if (!response.ok) {
          console.error('Failed to queue notifications')
        }
      } catch (error) {
        console.error('Error queueing notifications:', error)
      }

      // Send email notification
      if (job.customer_email) {
        try {
          console.log('📧 Calling email API for job:', job.job_ref, 'email:', job.customer_email)
          const emailResponse = await fetch('/api/email/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              jobId: job.id,
              type: 'STATUS_UPDATE',
            }),
          })
          const emailResult = await emailResponse.json()
          console.log('📧 Email API response:', emailResponse.status, emailResult)
        } catch (error) {
          console.error('❌ Failed to send email:', error)
        }
      } else {
        console.log('⚠️ No customer email on job:', job.job_ref)
      }
    } else {
      console.log('⏭️ Skipping notifications as requested')
    }

    await loadJobData()
    setActionLoading(false)
    setNewStatus(null)
  }

  const markDepositReceived = async () => {
    if (!job) return
    setActionLoading(true)

    await supabase
      .from('jobs')
      .update({ 
        deposit_received: true,
        status: 'PARTS_ORDERED'
      } as any)
      .eq('id', job.id)

    await supabase.from('job_events').insert({
      job_id: job.id,
      type: 'STATUS_CHANGE',
      message: `Deposit of £${job.deposit_amount} received`,
    } as any)

    await loadJobData()
    setActionLoading(false)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    )
  }

  if (!job) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-500">Job not found</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-primary/5 to-white dark:from-gray-900 dark:to-gray-800">
      <header className="bg-white dark:bg-gray-800 shadow-sm sticky top-0 z-10">
        <div className="px-4 py-4">
          <Link href="/app/jobs" className="inline-flex items-center text-primary mb-3">
            <ArrowLeft className="h-6 w-6 mr-2" />
            <span className="font-bold">Back to Jobs</span>
          </Link>
        </div>
      </header>

      <main className="p-4 space-y-4 max-w-2xl mx-auto">
        {/* Device Info Card - Mobile First */}
        <div className="bg-gradient-to-br from-gray-50 to-white rounded-2xl shadow-lg p-5 md:p-6 border-2 border-gray-100">
          <div className="flex items-center gap-4 md:gap-5 mb-4">
            <div className="flex-shrink-0 w-20 h-20 md:w-24 md:h-24 bg-primary/10 rounded-2xl flex items-center justify-center">
              {getDeviceIcon(job.device_make || '', job.device_model || '')}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs md:text-sm text-gray-500 mb-1">Job Reference</p>
              <h1 className="text-xl md:text-2xl font-black text-gray-900 mb-1 leading-tight">{job.job_ref}</h1>
              <span className={`inline-block px-3 py-1 rounded-lg font-bold text-xs ${JOB_STATUS_COLORS[job.status]}`}>
                {JOB_STATUS_LABELS[job.status]}
              </span>
            </div>
          </div>
          
          {/* Device Details */}
          <div className="space-y-3">
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Device</p>
              <p className="text-base text-gray-900 dark:text-white break-words">{job.device_make} {job.device_model}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Issue</p>
              <p className="text-base text-gray-900 dark:text-white break-words">{job.issue}</p>
            </div>
          </div>

          {/* Edit Button */}
          <Link
            href={`/app/jobs/${job.id}/edit`}
            className="mt-4 flex items-center justify-center gap-2 w-full px-4 py-2 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-900 dark:text-white rounded-xl transition-colors font-medium"
          >
            <Edit className="h-4 w-4" />
            <span>Edit Job Details</span>
          </Link>
        </div>

        {/* Device Password & Additional Info Card */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-5 md:p-6 border-2 border-gray-100 dark:border-gray-700">
          <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
            <Lock className="h-5 w-5 text-primary" />
            Device Access & Details
          </h2>
          
          <div className="space-y-4">
            {/* Device Password */}
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-2 font-semibold">Device Password/Passcode</p>
              {job.password_not_applicable ? (
                <div className="flex items-center gap-2 bg-gray-50 dark:bg-gray-700 p-3 rounded-lg">
                  <ShieldCheck className="h-5 w-5 text-gray-500" />
                  <span className="text-sm text-gray-600 dark:text-gray-300 font-medium">No password set on device</span>
                </div>
              ) : job.device_password ? (
                <div className="bg-blue-50 dark:bg-blue-900/20 border-2 border-blue-200 dark:border-blue-800 p-4 rounded-xl">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <Lock className="h-4 w-4 text-blue-600 dark:text-blue-400 flex-shrink-0" />
                        <span className="text-xs font-bold text-blue-900 dark:text-blue-300">CONFIDENTIAL</span>
                      </div>
                      <p className="text-lg font-mono font-bold text-gray-900 dark:text-white break-all">
                        {showPassword ? job.device_password : '••••••••'}
                      </p>
                    </div>
                    <button
                      onClick={() => setShowPassword(!showPassword)}
                      className="flex-shrink-0 p-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors active:scale-95"
                      title={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? (
                        <EyeOff className="h-5 w-5" />
                      ) : (
                        <Eye className="h-5 w-5" />
                      )}
                    </button>
                  </div>
                  {job.passcode_deletion_scheduled_at && (
                    <p className="text-xs text-blue-700 dark:text-blue-300 mt-2 flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      Auto-delete scheduled: {new Date(job.passcode_deletion_scheduled_at).toLocaleString('en-GB')}
                    </p>
                  )}
                </div>
              ) : (
                <div className="flex items-center gap-2 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 p-3 rounded-lg">
                  <AlertCircle className="h-5 w-5 text-yellow-600 dark:text-yellow-400" />
                  <span className="text-sm text-yellow-800 dark:text-yellow-300 font-medium">Password not provided yet</span>
                </div>
              )}
            </div>

            {/* Description */}
            {job.description && (
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-1 font-semibold">Additional Description</p>
                <p className="text-sm text-gray-900 dark:text-white bg-gray-50 dark:bg-gray-700 p-3 rounded-lg break-words">{job.description}</p>
              </div>
            )}

            {/* Additional Issues */}
            {job.additional_issues && job.additional_issues.length > 0 && (
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-2 font-semibold">Additional Issues</p>
                <div className="space-y-2">
                  {job.additional_issues.map((additionalIssue, index) => (
                    <div key={index} className="bg-gray-50 dark:bg-gray-700 p-3 rounded-lg">
                      <p className="text-sm font-bold text-gray-900 dark:text-white">{additionalIssue.issue}</p>
                      {additionalIssue.description && (
                        <p className="text-xs text-gray-600 dark:text-gray-300 mt-1">{additionalIssue.description}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Device In Shop Status */}
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-1 font-semibold">Device Location</p>
              <div className={`flex items-center gap-2 p-3 rounded-lg ${
                job.device_in_shop 
                  ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800' 
                  : 'bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600'
              }`}>
                {job.device_in_shop ? (
                  <>
                    <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400" />
                    <span className="text-sm font-bold text-green-900 dark:text-green-300">Device is in shop</span>
                  </>
                ) : (
                  <>
                    <AlertCircle className="h-5 w-5 text-gray-500" />
                    <span className="text-sm font-medium text-gray-600 dark:text-gray-300">Device not yet received</span>
                  </>
                )}
              </div>
            </div>

            {/* Onboarding Status */}
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-1 font-semibold">Onboarding Status</p>
              <div className={`flex items-center gap-2 p-3 rounded-lg ${
                job.onboarding_completed 
                  ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800' 
                  : 'bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800'
              }`}>
                {job.onboarding_completed ? (
                  <>
                    <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400" />
                    <span className="text-sm font-bold text-green-900 dark:text-green-300">Onboarding completed</span>
                  </>
                ) : (
                  <>
                    <AlertCircle className="h-5 w-5 text-yellow-600 dark:text-yellow-400" />
                    <span className="text-sm font-medium text-yellow-800 dark:text-yellow-300">Onboarding pending</span>
                  </>
                )}
              </div>
            </div>

            {/* Terms Accepted */}
            {job.terms_accepted && (
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-1 font-semibold">Terms & Conditions</p>
                <div className="flex items-center gap-2 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 p-3 rounded-lg">
                  <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400" />
                  <span className="text-sm font-bold text-green-900 dark:text-green-300">Accepted by customer</span>
                </div>
              </div>
            )}

            {/* Source & Page Info */}
            {(job.source || job.page) && (
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-1 font-semibold">Job Source</p>
                <div className="bg-gray-50 dark:bg-gray-700 p-3 rounded-lg">
                  {job.source && (
                    <p className="text-sm text-gray-900 dark:text-white">
                      <span className="font-semibold">Source:</span> {job.source}
                    </p>
                  )}
                  {job.page && (
                    <p className="text-sm text-gray-900 dark:text-white">
                      <span className="font-semibold">Page:</span> {job.page}
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Price Card */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-5 md:p-6 border-2 border-gray-100 dark:border-gray-700">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600 dark:text-gray-300 font-medium">Total Price</span>
              <span className="text-3xl font-black text-primary">£{job.price_total.toFixed(2)}</span>
            </div>
            
            {job.deposit_required && (
              <>
                <div className="flex items-center justify-between pt-3 border-t-2 border-gray-100">
                  <span className="text-sm text-gray-600 dark:text-gray-300 font-medium flex items-center gap-2">
                    Deposit (Parts Required)
                    {job.deposit_received && (
                      <CheckCircle className="h-5 w-5 text-green-600" />
                    )}
                  </span>
                  <span className="text-xl font-bold text-gray-900 dark:text-white">
                    £20.00
                  </span>
                </div>
                
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600 dark:text-gray-300 font-medium">Remaining Balance</span>
                  <span className="text-2xl font-black text-gray-900 dark:text-white">
                    £{(job.price_total - 20).toFixed(2)}
                  </span>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Onboarding Gate - shows if customer hasn't completed onboarding */}
        {!job.onboarding_completed && (
          <div className="card bg-yellow-50 border-2 border-yellow-300">
            <OnboardingGate 
              onboardingCompleted={false}
              jobRef={job.job_ref}
            />
            <button
              onClick={() => setShowManualOnboarding(true)}
              className="w-full mt-4 bg-primary hover:bg-primary-dark text-white font-bold py-3 px-6 rounded-xl transition-all"
            >
              Complete Onboarding In-Shop
            </button>
          </div>
        )}

        <div className="card">
          <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-4">Customer Contact</h2>
          <div className="space-y-3 mb-4">
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-1 font-semibold">Name</p>
              <p className="text-base text-gray-900 dark:text-white font-medium">{job.customer_name}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-1 font-semibold">Phone</p>
              <p className="text-base text-gray-900 dark:text-white font-medium">{job.customer_phone}</p>
            </div>
            {job.customer_email && (
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-1 font-semibold">Email</p>
                <p className="text-base text-gray-900 dark:text-white font-medium break-all">{job.customer_email}</p>
              </div>
            )}
          </div>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">Tap to call, text, or message</p>
          <ContactActions 
            phone={job.customer_phone} 
            name={job.customer_name}
          />
        </div>

        {/* Delay/Cancellation Reasons */}
        {(job.delay_reason || job.cancellation_reason) && (
          <div className="card bg-red-50 dark:bg-red-900/20 border-2 border-red-200 dark:border-red-800">
            <h2 className="text-lg font-bold text-red-900 dark:text-red-300 mb-4 flex items-center gap-2">
              <AlertCircle className="h-5 w-5" />
              {job.delay_reason ? 'Delay Information' : 'Cancellation Information'}
            </h2>
            {job.delay_reason && (
              <div className="space-y-2">
                <div>
                  <p className="text-xs text-red-700 dark:text-red-400 mb-1 font-semibold">Delay Reason</p>
                  <p className="text-sm text-red-900 dark:text-red-200 font-bold">{job.delay_reason.replace(/_/g, ' ')}</p>
                </div>
                {job.delay_notes && (
                  <div>
                    <p className="text-xs text-red-700 dark:text-red-400 mb-1 font-semibold">Additional Notes</p>
                    <p className="text-sm text-red-900 dark:text-red-200 bg-red-100 dark:bg-red-900/30 p-3 rounded-lg">{job.delay_notes}</p>
                  </div>
                )}
              </div>
            )}
            {job.cancellation_reason && (
              <div className="space-y-2">
                <div>
                  <p className="text-xs text-red-700 dark:text-red-400 mb-1 font-semibold">Cancellation Reason</p>
                  <p className="text-sm text-red-900 dark:text-red-200 font-bold">{job.cancellation_reason.replace(/_/g, ' ')}</p>
                </div>
                {job.cancellation_notes && (
                  <div>
                    <p className="text-xs text-red-700 dark:text-red-400 mb-1 font-semibold">Additional Notes</p>
                    <p className="text-sm text-red-900 dark:text-red-200 bg-red-100 dark:bg-red-900/30 p-3 rounded-lg">{job.cancellation_notes}</p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {job.deposit_required && !job.deposit_received && (
          <div className="card bg-yellow-50 border-2 border-yellow-300">
            <div className="flex items-start space-x-3 mb-4">
              <AlertCircle className="h-6 w-6 text-yellow-600 flex-shrink-0 mt-1" />
              <div>
                <p className="font-bold text-yellow-900 text-lg mb-1">
                  Deposit Required
                </p>
                <p className="text-yellow-800">
                  £{job.deposit_amount?.toFixed(2)} deposit needed before ordering parts
                </p>
              </div>
            </div>
            <button
              onClick={markDepositReceived}
              disabled={actionLoading}
              className="w-full bg-yellow-600 hover:bg-yellow-700 text-white font-black py-6 px-6 rounded-2xl text-xl disabled:opacity-50 transition-all shadow-lg active:scale-95 flex items-center justify-center space-x-3"
            >
              {actionLoading ? (
                <span>Processing...</span>
              ) : (
                <>
                  <CheckCircle className="h-8 w-8" />
                  <span>Mark Deposit Received</span>
                </>
              )}
            </button>
          </div>
        )}

        <div className="card">
          <h2 className="text-xl font-black text-gray-900 mb-5">Update Status</h2>
          {!job.onboarding_completed && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-3 mb-4">
              <p className="text-sm text-yellow-800 font-semibold">
                ⚠️ Status changes disabled until customer completes onboarding
              </p>
            </div>
          )}
          <div className="space-y-4">
            {job.status === 'QUOTE_APPROVED' && (
              <button
                onClick={() => handleWorkflowStatusChange('RECEIVED')}
                disabled={actionLoading}
                className="w-full bg-primary hover:bg-primary-dark text-white font-black py-6 px-6 rounded-2xl text-xl disabled:opacity-50 transition-all shadow-lg active:scale-95 flex items-center justify-center space-x-3"
              >
                <CheckCircle className="h-7 w-7" />
                <span>Mark as Received</span>
              </button>
            )}
            
            {job.status === 'RECEIVED' && !job.parts_required && (
              <button
                onClick={() => handleWorkflowStatusChange('IN_REPAIR')}
                disabled={actionLoading}
                className="w-full bg-primary hover:bg-primary-dark text-white font-black py-6 px-6 rounded-2xl text-xl disabled:opacity-50 transition-all shadow-lg active:scale-95 flex items-center justify-center space-x-3"
              >
                <Wrench className="h-7 w-7" />
                <span>Start Repair</span>
              </button>
            )}
            
            {job.status === 'RECEIVED' && job.parts_required && (
              <button
                onClick={() => handleWorkflowStatusChange('AWAITING_DEPOSIT')}
                disabled={actionLoading}
                className="w-full bg-primary hover:bg-primary-dark text-white font-black py-6 px-6 rounded-2xl text-xl disabled:opacity-50 transition-all shadow-lg active:scale-95 flex items-center justify-center space-x-3"
              >
                <Coins className="h-7 w-7" />
                <span>Request Deposit</span>
              </button>
            )}
            
            {job.status === 'AWAITING_DEPOSIT' && job.deposit_received && (
              <button
                onClick={() => handleWorkflowStatusChange('PARTS_ORDERED')}
                disabled={actionLoading}
                className="w-full bg-primary hover:bg-primary-dark text-white font-black py-6 px-6 rounded-2xl text-xl disabled:opacity-50 transition-all shadow-lg active:scale-95 flex items-center justify-center space-x-3"
              >
                <Package className="h-8 w-8" />
                <span>Mark Parts Ordered</span>
              </button>
            )}

            {job.status === 'PARTS_ORDERED' && (
              <button
                onClick={() => handleWorkflowStatusChange('PARTS_ARRIVED')}
                disabled={actionLoading}
                className="w-full bg-primary hover:bg-primary-dark text-white font-black py-6 px-6 rounded-2xl text-xl disabled:opacity-50 transition-all shadow-lg active:scale-95 flex items-center justify-center space-x-3"
              >
                <Package className="h-8 w-8" />
                <span>Parts Arrived</span>
              </button>
            )}

            {job.status === 'PARTS_ARRIVED' && (
              <button
                onClick={() => handleWorkflowStatusChange('IN_REPAIR')}
                disabled={actionLoading}
                className="w-full bg-primary hover:bg-primary-dark text-white font-black py-6 px-6 rounded-2xl text-xl disabled:opacity-50 transition-all shadow-lg active:scale-95 flex items-center justify-center space-x-3"
              >
                <Wrench className="h-8 w-8" />
                <span>Start Repair</span>
              </button>
            )}

            {job.status === 'IN_REPAIR' && (
              <button
                onClick={() => handleWorkflowStatusChange('READY_TO_COLLECT')}
                disabled={actionLoading}
                className="w-full bg-green-600 hover:bg-green-700 text-white font-black py-6 px-6 rounded-2xl text-xl disabled:opacity-50 transition-all shadow-lg active:scale-95 flex items-center justify-center space-x-3"
              >
                <CheckCircle className="h-8 w-8" />
                <span>Ready to Collect</span>
              </button>
            )}

            {job.status === 'READY_TO_COLLECT' && (
              <button
                onClick={() => handleWorkflowStatusChange('COLLECTED')}
                disabled={actionLoading}
                className="w-full bg-green-600 hover:bg-green-700 text-white font-black py-6 px-6 rounded-2xl text-xl disabled:opacity-50 transition-all shadow-lg active:scale-95 flex items-center justify-center space-x-3"
              >
                <CheckCircle className="h-8 w-8" />
                <span>Customer Collected Device</span>
              </button>
            )}
            
            {job.status === 'COLLECTED' && (
              <button
                onClick={() => handleWorkflowStatusChange('COMPLETED')}
                disabled={actionLoading}
                className="w-full bg-gray-600 hover:bg-gray-700 text-white font-black py-6 px-6 rounded-2xl text-xl disabled:opacity-50 transition-all shadow-lg active:scale-95 flex items-center justify-center space-x-3"
              >
                <CheckCircle className="h-8 w-8" />
                <span>Close Job</span>
              </button>
            )}

            {/* Manual Status Change Buttons */}
            <div className="pt-4 border-t-2 border-gray-300">
              <p className="text-sm text-gray-600 mb-3 font-bold">Need to change status manually?</p>
              <div className="grid grid-cols-2 gap-4">
                <button
                  onClick={() => setShowStatusSelector(true)}
                  disabled={actionLoading}
                  className="bg-primary hover:bg-primary-dark text-white font-black py-6 px-6 rounded-2xl text-lg disabled:opacity-50 transition-all shadow-lg active:scale-95"
                >
                  Change Status
                </button>
                <button
                  onClick={() => router.push('/app/jobs')}
                  className="bg-gray-200 hover:bg-gray-300 text-gray-900 font-black py-6 px-6 rounded-2xl text-lg transition-all shadow-lg active:scale-95"
                >
                  Cancel
                </button>
              </div>
            </div>

          </div>
        </div>

        {/* Status Selector Modal */}
        {showStatusSelector && (
          <StatusSelectorModal
            currentStatus={job.status}
            onSelect={handleManualStatusChange}
            onClose={() => setShowStatusSelector(false)}
          />
        )}

        {showManualOnboarding && (
          <ManualOnboardingModal
            jobId={job.id}
            jobRef={job.job_ref}
            customerName={job.customer_name}
            onComplete={() => {
              setShowManualOnboarding(false)
              loadJob()
            }}
            onClose={() => setShowManualOnboarding(false)}
          />
        )}

        {showSimpleConfirm && pendingWorkflowStatus && (
          <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4 overflow-y-auto">
            <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl">
              <h2 className="text-2xl font-black text-gray-900 mb-4">Confirm Status Change</h2>
              <p className="text-gray-700 mb-4">
                Change status to <span className="font-bold text-primary">{JOB_STATUS_LABELS[pendingWorkflowStatus]}</span>?
              </p>
              
              {/* Notification Warning */}
              {(willSendSMS || willSendEmail) && (
                <div className="bg-blue-50 border-2 border-blue-200 rounded-xl p-4 mb-4">
                  <div className="flex items-start space-x-3">
                    <MessageSquare className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <p className="text-sm font-bold text-blue-900 mb-1">Notifications Will Be Sent</p>
                      <div className="text-xs text-blue-700 space-y-1">
                        {willSendSMS && (
                          <p>✓ <span className="font-semibold">SMS</span> - Customer will receive a text message</p>
                        )}
                        {willSendEmail && (
                          <p>✓ <span className="font-semibold">Email</span> - Customer will receive an email</p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}
              
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setShowSimpleConfirm(false)
                    setPendingWorkflowStatus(null)
                  }}
                  className="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-900 font-bold py-4 px-6 rounded-xl transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmWorkflowStatusChange}
                  className="flex-1 bg-primary hover:bg-primary-dark text-white font-bold py-4 px-6 rounded-xl transition-colors"
                >
                  Confirm
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Delay Reason Modal */}
        {showDelayModal && job && (
          <DelayReasonModal
            deviceInfo={`${job.device_make} ${job.device_model}`}
            onConfirm={handleDelayReasonSubmit}
            onCancel={() => setShowDelayModal(false)}
          />
        )}

        {/* Delay Confirmation Modal (shows SMS/Email notification info) */}
        {showDelayConfirm && job && (
          <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4 overflow-y-auto">
            <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl">
              <h2 className="text-2xl font-black text-gray-900 mb-4">Confirm Delay Status</h2>
              <p className="text-gray-700 mb-2">
                Mark <span className="font-bold">{job.device_make} {job.device_model}</span> as <span className="font-bold text-red-600">Delayed</span>?
              </p>
              <p className="text-sm text-gray-600 mb-4">
                Reason: <span className="font-semibold">{pendingDelayReason.replace(/_/g, ' ')}</span>
              </p>
              
              {/* Notification Warning */}
              {(willSendSMS || willSendEmail) && (
                <div className="bg-blue-50 border-2 border-blue-200 rounded-xl p-4 mb-4">
                  <div className="flex items-start space-x-3">
                    <MessageSquare className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <p className="text-sm font-bold text-blue-900 mb-1">Notifications Will Be Sent</p>
                      <div className="text-xs text-blue-700 space-y-1">
                        {willSendSMS && (
                          <p>✓ <span className="font-semibold">SMS</span> - Customer will receive delay reason and notes</p>
                        )}
                        {willSendEmail && (
                          <p>✓ <span className="font-semibold">Email</span> - Customer will receive an email</p>
                        )}
                      </div>
                      <p className="text-xs text-blue-600 mt-2">To: {job.customer_phone}{job.customer_email ? ` / ${job.customer_email}` : ''}</p>
                    </div>
                  </div>
                </div>
              )}
              
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setShowDelayConfirm(false)
                    setPendingDelayReason('')
                    setPendingDelayNotes('')
                  }}
                  className="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-900 font-bold py-4 px-6 rounded-xl transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmDelayStatusChange}
                  className="flex-1 bg-red-600 hover:bg-red-700 text-white font-bold py-4 px-6 rounded-xl transition-colors"
                >
                  Confirm Delay
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Triple Confirmation Modal (for manual status changes) */}
        {showStatusModal && newStatus && (
          <StatusChangeModal
            currentStatus={job.status}
            newStatus={newStatus}
            deviceInfo={`${job.device_make} ${job.device_model}`}
            onConfirm={confirmStatusChange}
            onCancel={() => {
              setShowStatusModal(false)
              setNewStatus(null)
            }}
            willSendSMS={willSendSMS}
            willSendEmail={willSendEmail}
          />
        )}

        <div className="card">
          <h2 className="font-semibold text-gray-900 mb-3">Timeline</h2>
          <div className="space-y-3">
            {events.map((event) => (
              <div key={event.id} className="border-l-2 border-primary pl-3 py-1">
                <p className="text-sm font-medium text-gray-900">{event.message}</p>
                <p className="text-xs text-gray-500">
                  {new Date(event.created_at).toLocaleString('en-GB')}
                </p>
              </div>
            ))}
          </div>
        </div>

        {emailLogs.length > 0 && (
          <div className="card">
            <h2 className="font-semibold text-gray-900 mb-3">Email History</h2>
            <div className="space-y-2">
              {emailLogs.map((email) => (
                <div key={email.id} className="bg-gray-50 rounded p-2 text-sm overflow-hidden">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-medium text-gray-700">{email.template_key}</span>
                    <span className={`text-xs px-2 py-1 rounded ${
                      email.status === 'SENT' ? 'bg-green-100 text-green-800' :
                      email.status === 'FAILED' ? 'bg-red-100 text-red-800' :
                      'bg-yellow-100 text-yellow-800'
                    }`}>
                      {email.status}
                    </span>
                  </div>
                  <p className="text-gray-700 font-medium text-xs mb-1">{email.subject}</p>
                  <p className="text-gray-600 text-xs">To: {email.recipient_email}</p>
                  <p className="text-gray-400 text-xs mt-1">
                    {new Date(email.created_at).toLocaleString('en-GB')}
                  </p>
                  {email.error_message && (
                    <p className="text-red-600 text-xs mt-1">Error: {email.error_message}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {smsLogs.length > 0 && (
          <div className="card">
            <h2 className="font-semibold text-gray-900 mb-3">SMS History</h2>
            <div className="space-y-2">
              {smsLogs.map((sms) => (
                <div key={sms.id} className="bg-gray-50 rounded p-2 text-sm overflow-hidden">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-medium text-gray-700">{sms.template_key}</span>
                    <div className="flex items-center gap-2">
                      <span className={`text-xs px-2 py-1 rounded ${
                        sms.status === 'SENT' ? 'bg-green-100 text-green-800' :
                        sms.status === 'FAILED' ? 'bg-red-100 text-red-800' :
                        'bg-yellow-100 text-yellow-800'
                      }`}>
                        {sms.status}
                      </span>
                      {(sms.status === 'FAILED' || sms.status === 'PENDING') && (
                        <button
                          onClick={async () => {
                            setActionLoading(true)
                            try {
                              const response = await fetch('/api/sms/send', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                              })
                              if (response.ok) {
                                await loadJobData()
                              }
                            } catch (error) {
                              console.error('Failed to retry SMS:', error)
                            }
                            setActionLoading(false)
                          }}
                          disabled={actionLoading}
                          className="text-xs px-2 py-1 bg-primary text-white rounded hover:bg-primary-dark disabled:opacity-50"
                          title="Send SMS Again"
                        >
                          <RefreshCw className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                  </div>
                  <p className="text-gray-600 text-xs break-words">{sms.body_rendered}</p>
                  <p className="text-gray-400 text-xs mt-1">
                    {new Date(sms.created_at).toLocaleString('en-GB')}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="card">
          <h2 className="font-semibold text-gray-900 dark:text-white mb-2">Customer Tracking Link</h2>
          <p className="text-xs text-gray-600 dark:text-gray-400 mb-2">Share this link with the customer:</p>
          <div className="bg-gray-50 dark:bg-gray-700 p-2 rounded text-xs break-all text-gray-900 dark:text-white mb-3">
            https://nfd-repairs-app.vercel.app/t/{job.tracking_token}
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => {
                navigator.clipboard.writeText(`https://nfd-repairs-app.vercel.app/t/${job.tracking_token}`)
                alert('Link copied to clipboard!')
              }}
              className="flex-1 bg-primary hover:bg-primary-dark text-white font-semibold py-2 px-4 rounded transition-colors text-sm"
            >
              📋 Copy Link
            </button>
            <button
              onClick={() => {
                window.open(`https://nfd-repairs-app.vercel.app/t/${job.tracking_token}`, '_blank')
              }}
              className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded transition-colors text-sm"
            >
              🔗 Open in New Tab
            </button>
          </div>
        </div>
      </main>
    </div>
  )
}
