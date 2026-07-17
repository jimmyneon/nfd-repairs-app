'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { Job, JobEvent, SMSLog, EmailLog, JobStatus } from '@/lib/types-v3'
import { JOB_STATUS_LABELS, JOB_STATUS_SHORT_LABELS, JOB_STATUS_COLORS } from '@/lib/constants'
import { ArrowLeft, Home, Clock, Package, CheckCircle, Wrench, AlertCircle, RefreshCw, Smartphone, Laptop, Tablet, Monitor, Gamepad2, Watch, Edit, MessageSquare, Eye, EyeOff, Lock, ShieldCheck, Coins, FileText, Send, User, Star, StickyNote, Link2, PoundSterling, Plus, Shield, MessageCircle, Stethoscope, Truck } from 'lucide-react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import ContactActions from '@/components/ContactActions'
import StatusChangeModal from '@/components/StatusChangeModal'
import StatusSelectorModal from '@/components/StatusSelectorModal'
import OnboardingGate from '@/components/OnboardingGate'
import ManualOnboardingModal from '@/components/ManualOnboardingModal'
import DelayReasonModal from '@/components/DelayReasonModal'
import CancellationReasonModal from '@/components/CancellationReasonModal'
import CustomerFlagControls from '@/components/CustomerFlagControls'
import ReviewPlatformControls from '@/components/ReviewPlatformControls'
import CustomerArrivedPrompt from '@/components/CustomerArrivedPrompt'
import CustomerNotesEditor from '@/components/CustomerNotesEditor'
import EditCustomerDetails from '@/components/EditCustomerDetails'
import SlideUpPanel from '@/components/SlideUpPanel'
import DiagnosticReportEditor from '@/components/DiagnosticReportEditor'
import HistoryTabs from '@/components/HistoryTabs'
import CustomSmsComposer from '@/components/CustomSmsComposer'
import RepairOutcomeSelector from '@/components/RepairOutcomeSelector'
import PriceSetterModal from '@/components/PriceSetterModal'
import QuickActionsModal from '@/components/QuickActionsModal'

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
  const [showCancellationModal, setShowCancellationModal] = useState(false)
  const [showCancellationConfirm, setShowCancellationConfirm] = useState(false)
  const [newStatus, setNewStatus] = useState<JobStatus | null>(null)
  const [pendingWorkflowStatus, setPendingWorkflowStatus] = useState<JobStatus | null>(null)
  const [pendingDelayReason, setPendingDelayReason] = useState<string>('')
  const [pendingDelayNotes, setPendingDelayNotes] = useState<string>('')
  const [pendingCancellationReason, setPendingCancellationReason] = useState<string>('')
  const [pendingCancellationNotes, setPendingCancellationNotes] = useState<string>('')
  const [willSendSMS, setWillSendSMS] = useState(false)
  const [willSendEmail, setWillSendEmail] = useState(false)
  const [overrideSMS, setOverrideSMS] = useState(false)
  const [overrideEmail, setOverrideEmail] = useState(false)
  const [sendPriceInSms, setSendPriceInSms] = useState(true)
  const [showPassword, setShowPassword] = useState(false)
  const [showBigPassword, setShowBigPassword] = useState(false)
  const [decryptedPassword, setDecryptedPassword] = useState<string | null>(null)
  const [showTrackingLinkModal, setShowTrackingLinkModal] = useState(false)
  const [linkCopied, setLinkCopied] = useState(false)
  const [showCustomerArrivedPrompt, setShowCustomerArrivedPrompt] = useState(false)
  const [activePanel, setActivePanel] = useState<'device' | 'customer' | 'diagnostic' | 'history' | 'notes' | null>(null)
  const [historyTab, setHistoryTab] = useState<'all' | 'status' | 'messages' | 'notes' | 'emails'>('all')
  const [showSmsComposer, setShowSmsComposer] = useState(false)
  const [showPriceModal, setShowPriceModal] = useState(false)
  const [showQuickActions, setShowQuickActions] = useState(false)
  const [editingName, setEditingName] = useState(false)
  const [nameValue, setNameValue] = useState('')
  const [editingPhone, setEditingPhone] = useState(false)
  const [phoneValue, setPhoneValue] = useState('')
  const [editingEmail, setEditingEmail] = useState(false)
  const [emailValue, setEmailValue] = useState('')
  const [diagnosticSmsMessage, setDiagnosticSmsMessage] = useState<string | null>(null)
  const [reviewToggling, setReviewToggling] = useState(false)
  const [showReviewReason, setShowReviewReason] = useState(false)
  const [showReviewPlatforms, setShowReviewPlatforms] = useState(false)
  const [repairOutcome, setRepairOutcome] = useState<'repaired' | 'unrepaired'>('repaired')
  const [depositAmountInput, setDepositAmountInput] = useState('20.00')
  const [partsSupplier, setPartsSupplier] = useState('')
  const [partsTrackingNumber, setPartsTrackingNumber] = useState('')
  const [partsTrackingUrl, setPartsTrackingUrl] = useState('')
  const [partsExpectedAt, setPartsExpectedAt] = useState('')
  const [savingPartsInfo, setSavingPartsInfo] = useState(false)
  const [showTrackingPanel, setShowTrackingPanel] = useState(false)
  const [checkingTracking, setCheckingTracking] = useState(false)
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
    
    // Check if arrived from customer arrival notification
    const arrivedParam = searchParams.get('customer_arrived')
    if (arrivedParam === 'true') {
      setShowCustomerArrivedPrompt(true)
    }

    // Real-time subscription for this job
    const jobSubscription = supabase
      .channel(`job-${params.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'jobs', filter: `id=eq.${params.id}` }, () => {
        loadJobData()
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'job_events', filter: `job_id=eq.${params.id}` }, () => {
        loadJobData()
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sms_logs', filter: `job_id=eq.${params.id}` }, () => {
        loadJobData()
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'email_logs', filter: `job_id=eq.${params.id}` }, () => {
        loadJobData()
      })
      .subscribe()

    return () => {
      jobSubscription.unsubscribe()
    }
  }, [params.id])

  // Auto-show customer arrived prompt if customer is waiting (within last 30 minutes)
  useEffect(() => {
    if (job && job.customer_arrived_at && job.status === 'READY_TO_COLLECT') {
      const arrivedAt = new Date(job.customer_arrived_at)
      const now = new Date()
      const minutesSinceArrival = (now.getTime() - arrivedAt.getTime()) / (1000 * 60)
      
      // Show prompt if customer arrived within last 30 minutes
      if (minutesSinceArrival < 30) {
        setShowCustomerArrivedPrompt(true)
      }
    }
  }, [job])

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

    if (jobData) {
      setJob(jobData)
      setPartsSupplier(jobData.parts_supplier || '')
      setPartsTrackingNumber(jobData.parts_tracking_number || '')
      setPartsTrackingUrl(jobData.parts_tracking_url || '')
      if (jobData.parts_expected_at) {
        const d = new Date(jobData.parts_expected_at)
        const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
        setPartsExpectedAt(local)
      } else {
        setPartsExpectedAt('')
      }
    }
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
    
    // Special handling for CANCELLED status - show cancellation reason modal
    if (status === 'CANCELLED') {
      setShowCancellationModal(true)
      return
    }
    
    // Check notification config for this status
    const { data: config } = await supabase
      .from('notification_config')
      .select('send_sms, send_email, is_active')
      .eq('status_key', status)
      .single()
    
    // Special handling for PARTS_ARRIVED: Don't send SMS if device already in shop
    let shouldSendSMS = config?.send_sms && config?.is_active || false
    if (status === 'PARTS_ARRIVED' && job?.device_in_shop) {
      shouldSendSMS = false
    }
    
    setWillSendSMS(shouldSendSMS)
    setWillSendEmail(config?.send_email && config?.is_active || false)
    setOverrideSMS(false)
    setOverrideEmail(false)
    setSendPriceInSms(true)
    
    setShowStatusModal(true)
  }

  const handleSaveName = async () => {
    if (!nameValue.trim()) return
    setActionLoading(true)
    try {
      await supabase.from('jobs').update({ customer_name: nameValue.trim() }).eq('id', job.id)
      await supabase.from('job_events').insert({
        job_id: job.id,
        type: 'SYSTEM',
        message: `Customer name updated to: ${nameValue.trim()}`,
      })
      setEditingName(false)
      loadJobData()
    } catch (err) {
      console.error('Failed to update name:', err)
    } finally {
      setActionLoading(false)
    }
  }

  const handleSavePhone = async () => {
    if (!phoneValue.trim()) return
    setActionLoading(true)
    try {
      await supabase.from('jobs').update({ customer_phone: phoneValue.trim() }).eq('id', job.id)
      await supabase.from('job_events').insert({
        job_id: job.id,
        type: 'SYSTEM',
        message: `Customer phone updated to: ${phoneValue.trim()}`,
      })
      setEditingPhone(false)
      loadJobData()
    } catch (err) {
      console.error('Failed to update phone:', err)
    } finally {
      setActionLoading(false)
    }
  }

  const handleSaveEmail = async () => {
    setActionLoading(true)
    try {
      await supabase.from('jobs').update({ customer_email: emailValue.trim() || null }).eq('id', job.id)
      await supabase.from('job_events').insert({
        job_id: job.id,
        type: 'SYSTEM',
        message: emailValue.trim() ? `Customer email updated to: ${emailValue.trim()}` : 'Customer email cleared',
      })
      setEditingEmail(false)
      loadJobData()
    } catch (err) {
      console.error('Failed to update email:', err)
    } finally {
      setActionLoading(false)
    }
  }

  const handleSavePartsInfo = async () => {
    if (!job) return
    setSavingPartsInfo(true)
    try {
      const updateData: any = {
        parts_supplier: partsSupplier.trim() || null,
        parts_tracking_number: partsTrackingNumber.trim() || null,
        parts_tracking_url: partsTrackingUrl.trim() || null,
        parts_expected_at: partsExpectedAt ? new Date(partsExpectedAt).toISOString() : null,
      }
      await supabase.from('jobs').update(updateData).eq('id', job.id)
      await supabase.from('job_events').insert({
        job_id: job.id,
        type: 'SYSTEM',
        message: `Parts tracking info updated${partsSupplier ? ` - Supplier: ${partsSupplier}` : ''}${partsTrackingNumber ? ` - Tracking: ${partsTrackingNumber}` : ''}${partsExpectedAt ? ` - Expected: ${new Date(partsExpectedAt).toLocaleDateString('en-GB')}` : ''}`,
      })

      // Auto-check tracking immediately when tracking number is saved
      if (partsTrackingNumber.trim()) {
        try {
          await fetch('/api/tracking/check', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ jobId: job.id }),
          })
        } catch (checkError) {
          console.error('Failed to auto-check tracking:', checkError)
        }
      }

      await loadJobData()
    } catch (err) {
      console.error('Failed to save parts info:', err)
    } finally {
      setSavingPartsInfo(false)
    }
  }

  const handleCheckTracking = async () => {
    if (!job) return
    setCheckingTracking(true)
    try {
      const res = await fetch('/api/tracking/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId: job.id }),
      })
      const data = await res.json()
      if (!res.ok) {
        console.error('Tracking check failed:', data.error)
      }
      await loadJobData()
    } catch (err) {
      console.error('Failed to check tracking:', err)
    } finally {
      setCheckingTracking(false)
    }
  }

  const handleQuickReviewToggle = async () => {
    setReviewToggling(true)
    try {
      const newValue = !job.skip_review_request
      await supabase.from('jobs').update({ skip_review_request: newValue } as any).eq('id', job.id)
      await supabase.from('job_events').insert({
        job_id: job.id,
        type: 'SYSTEM',
        message: `Review request ${newValue ? 'DISABLED' : 'ENABLED'}`,
      } as any)
      loadJobData()
    } catch (err) {
      console.error('Failed to toggle review:', err)
    } finally {
      setReviewToggling(false)
    }
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
    
    // Special handling for PARTS_ARRIVED: Don't send SMS if device already in shop
    let shouldSendSMS = config?.send_sms && config?.is_active || false
    if (status === 'PARTS_ARRIVED' && job?.device_in_shop) {
      shouldSendSMS = false
    }
    
    setWillSendSMS(shouldSendSMS)
    setWillSendEmail(config?.send_email && config?.is_active || false)
    setOverrideSMS(false)
    setOverrideEmail(false)
    setSendPriceInSms(true)
    
    setShowSimpleConfirm(true)
  }

  const confirmWorkflowStatusChange = async () => {
    if (!job || !pendingWorkflowStatus) return
    setActionLoading(true)
    setShowSimpleConfirm(false)

    // Prepare update object with status and device_in_shop
    const updateData: any = { status: pendingWorkflowStatus, status_changed_at: new Date().toISOString() }
    
    // Set device_in_shop based on status transition
    if (pendingWorkflowStatus === 'RECEIVED') {
      updateData.device_in_shop = true  // Device now in shop
    } else if (pendingWorkflowStatus === 'COLLECTED') {
      updateData.device_in_shop = false  // Device no longer in shop
      updateData.customer_arrived_at = null  // Clear arrival indicator
      // Save repair outcome and auto-skip review if not fixed
      updateData.repair_outcome = repairOutcome
      if (repairOutcome === 'unrepaired') {
        updateData.skip_review_request = true
      }
    }

    const { error: updateError } = await supabase
      .from('jobs')
      .update(updateData)
      .eq('id', job.id)

    if (updateError) {
      console.error('Failed to update job:', updateError)
      // If repair_outcome column doesn't exist yet, retry without it
      if (updateError.message.includes('repair_outcome') || updateError.message.includes('Could not find')) {
        const { repair_outcome, ...dataWithoutOutcome } = updateData
        await supabase.from('jobs').update(dataWithoutOutcome).eq('id', job.id)
      }
    }

    // Optimistic update - update local state immediately
    setJob({ ...job, ...updateData } as Job)

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

    // Queue SMS for status change (unless overridden)
    if (!overrideSMS) {
      try {
        const response = await fetch('/api/jobs/queue-status-sms', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jobId: job.id,
            status: pendingWorkflowStatus,
            sendPriceInSms,
          }),
        })
        if (!response.ok) {
          const error = await response.text()
          console.error('SMS queue failed:', error)
        }
      } catch (error) {
        console.error('Failed to queue status SMS:', error)
      }
    }

    // Send email notification (unless overridden)
    if (!overrideEmail) {
      if (job.customer_email) {
        try {
          const emailResponse = await fetch('/api/email/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              jobId: job.id,
              type: 'STATUS_UPDATE',
            }),
          })
          await emailResponse.json()
        } catch (error) {
          console.error('Failed to send email:', error)
        }
      }
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
    setOverrideSMS(false)
    setOverrideEmail(false)
    setSendPriceInSms(true)
    
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

    // Queue SMS for DELAYED status (will include delay_reason and delay_notes) - unless overridden
    if (!overrideSMS) {
      try {
        await fetch('/api/jobs/queue-status-sms', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jobId: job.id,
            status: 'DELAYED',
            sendPriceInSms,
          }),
        })
      } catch (error) {
        console.error('Failed to queue delay SMS:', error)
      }
    }

    // Send email notification (unless overridden)
    if (!overrideEmail) {
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
    }

    await loadJobData()
    setActionLoading(false)
    setPendingDelayReason('')
    setPendingDelayNotes('')
  }

  const handleCancellationReasonSubmit = async (reason: string, notes: string) => {
    // Store cancellation reason and notes, then check notification config
    setPendingCancellationReason(reason)
    setPendingCancellationNotes(notes)
    setShowCancellationModal(false)
    
    // Check notification config for CANCELLED status
    const { data: config } = await supabase
      .from('notification_config')
      .select('send_sms, send_email, is_active')
      .eq('status_key', 'CANCELLED')
      .single()
    
    setWillSendSMS(config?.send_sms && config?.is_active || false)
    setWillSendEmail(config?.send_email && config?.is_active || false)
    setOverrideSMS(false)
    setOverrideEmail(false)
    setSendPriceInSms(true)
    
    // Show confirmation modal
    setShowCancellationConfirm(true)
  }

  const confirmCancellationStatusChange = async () => {
    if (!job) return
    setActionLoading(true)
    setShowCancellationConfirm(false)

    // Update job with CANCELLED status and cancellation reason/notes
    await supabase
      .from('jobs')
      .update({
        status: 'CANCELLED' as JobStatus,
        cancellation_reason: pendingCancellationReason,
        cancellation_notes: pendingCancellationNotes,
      } as any)
      .eq('id', job.id)

    await supabase.from('job_events').insert({
      job_id: job.id,
      type: 'STATUS_CHANGE',
      message: `Status changed to Cancelled - ${pendingCancellationReason}`,
    } as any)

    await supabase.from('notifications').insert({
      type: 'STATUS_UPDATE',
      title: `Job ${job.job_ref} cancelled`,
      body: `Cancellation reason: ${pendingCancellationReason}`,
      job_id: job.id,
    } as any)

    // Queue SMS for CANCELLED status (will include cancellation_reason and cancellation_notes) - unless overridden
    if (!overrideSMS) {
      try {
        await fetch('/api/jobs/queue-status-sms', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jobId: job.id,
            status: 'CANCELLED',
            sendPriceInSms,
          }),
        })
      } catch (error) {
        console.error('Failed to queue cancellation SMS:', error)
      }
    }

    // Send email notification (unless overridden)
    if (!overrideEmail) {
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
          console.error('Failed to send cancellation email:', error)
        }
      }
    }

    await loadJobData()
    setActionLoading(false)
    setPendingCancellationReason('')
    setPendingCancellationNotes('')
  }

  const confirmStatusChange = async (overrideSMSParam: boolean, overrideEmailParam: boolean) => {
    if (!job || !newStatus) return
    
    setActionLoading(true)
    setShowStatusModal(false)

    const message = `Status changed to ${JOB_STATUS_LABELS[newStatus]}`

    // Prepare update object with status and device_in_shop
    const updateData: any = { status: newStatus, status_changed_at: new Date().toISOString() }
    
    // Set device_in_shop based on status transition
    if (newStatus === 'RECEIVED') {
      updateData.device_in_shop = true  // Device now in shop
    } else if (newStatus === 'COLLECTED') {
      updateData.device_in_shop = false  // Device no longer in shop
      updateData.customer_arrived_at = null  // Clear arrival indicator
    }

    await supabase
      .from('jobs')
      .update(updateData)
      .eq('id', job.id)

    // Optimistic update - update local state immediately
    setJob({ ...job, ...updateData } as Job)

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

    // Queue SMS for status change (unless overridden) - use parameter directly
    if (!overrideSMSParam) {
      try {
        const response = await fetch('/api/jobs/queue-status-sms', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jobId: job.id,
            status: newStatus,
            sendPriceInSms,
          }),
        })
        if (!response.ok) {
          const error = await response.text()
          console.error('SMS queue failed:', error)
        }
      } catch (error) {
        console.error('Failed to queue status SMS:', error)
      }
    }

    // Send email notification (unless overridden) - use parameter directly
    if (!overrideEmailParam) {
      if (job.customer_email) {
        try {
          const emailResponse = await fetch('/api/email/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              jobId: job.id,
              type: 'STATUS_UPDATE',
            }),
          })
          await emailResponse.json()
        } catch (error) {
          console.error('Failed to send email:', error)
        }
      }
    }

    await loadJobData()
    setActionLoading(false)
    setNewStatus(null)
  }

  const markDepositReceived = async () => {
    if (!job) return
    setActionLoading(true)

    const depositAmount = parseFloat(depositAmountInput) || 20.00

    await supabase
      .from('jobs')
      .update({ 
        deposit_received: true,
        deposit_amount: depositAmount,
        status: 'PARTS_ORDERED'
      } as any)
      .eq('id', job.id)

    await supabase.from('job_events').insert({
      job_id: job.id,
      type: 'STATUS_CHANGE',
      message: `Deposit of £${depositAmount.toFixed(2)} received`,
    } as any)

    await loadJobData()
    setActionLoading(false)
  }

  const [depositSending, setDepositSending] = useState(false)
  const sendDepositRequest = async () => {
    if (!job) return
    setDepositSending(true)

    try {
      const response = await fetch(`/api/jobs/${job.id}/request-deposit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
      const data = await response.json()

      if (data.success) {
        await supabase.from('job_events').insert({
          job_id: job.id,
          type: 'SYSTEM',
          message: 'Deposit request SMS sent to customer',
        } as any)
        await loadJobData()
      }
    } catch (error) {
      console.error('Failed to send deposit request:', error)
    }

    setDepositSending(false)
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

  const handleCustomerArrivedConfirm = () => {
    setShowCustomerArrivedPrompt(false)
    setPendingWorkflowStatus('COLLECTED')
    setShowStatusModal(true)
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-primary/5 to-white dark:from-gray-900 dark:to-gray-800">
      <header className="bg-white dark:bg-gray-800 shadow-sm sticky top-0 z-10">
        <div className="px-4 py-4">
          <div className="flex items-center gap-2 mb-3">
            <Link href="/app/jobs" className="inline-flex items-center justify-center w-10 h-10 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors" title="Home">
              <Home className="h-5 w-5 text-primary" />
            </Link>
            <Link href="/app/jobs/create" className="inline-flex items-center justify-center w-10 h-10 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors" title="Create New Job">
              <Plus className="h-5 w-5 text-primary" />
            </Link>
          </div>
        </div>
      </header>

      <main className="p-4 space-y-3 max-w-2xl mx-auto">
        {/* Customer Arrived Prompt - inline banner */}
        {showCustomerArrivedPrompt && job && (
          <CustomerArrivedPrompt
            jobRef={job.job_ref}
            onConfirm={handleCustomerArrivedConfirm}
            onDismiss={() => setShowCustomerArrivedPrompt(false)}
          />
        )}

        {/* Device Info Card */}
        <div className="bg-gradient-to-br from-gray-50 to-white dark:from-gray-800 dark:to-gray-900 rounded-2xl shadow-lg p-5 border-2 border-gray-100 dark:border-gray-700">
          <div className="flex items-start gap-4 mb-3">
            <div className="flex-shrink-0 w-14 h-14 bg-primary/10 rounded-xl flex items-center justify-center">
              {getDeviceIcon(job.device_make || '', job.device_model || '')}
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="text-lg font-black text-gray-900 dark:text-white leading-tight">{job.device_make} {job.device_model}</h1>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-0.5">{job.issue}</p>
              <p className="text-sm font-semibold text-gray-700 dark:text-gray-300 mt-1">{job.customer_name}</p>
            </div>
            {job.is_warranty ? (
              <div className="text-right flex-shrink-0">
                <div className="flex items-center gap-1.5 bg-green-100 dark:bg-green-900/30 px-3 py-1.5 rounded-lg">
                  <Shield className="h-5 w-5 text-green-600 dark:text-green-400" />
                  <span className="text-sm font-black text-green-700 dark:text-green-300 uppercase">Warranty</span>
                </div>
                <p className="text-xs text-green-600 font-bold mt-1">No charge</p>
              </div>
            ) : (
              <button
                onClick={() => setShowPriceModal(true)}
                className="text-right flex-shrink-0 active:scale-95 transition-transform"
              >
                <p className="text-2xl font-black text-primary">£{job.price_total.toFixed(2)}</p>
                {job.payment_received && (
                  <p className="text-xs text-green-600 font-bold">Paid in full</p>
                )}
                {job.deposit_required && !job.deposit_received && (
                  <p className="text-xs text-yellow-600 font-bold">Deposit needed</p>
                )}
                {job.deposit_required && job.deposit_received && !job.payment_received && (
                  <p className="text-xs text-green-600 font-bold">
                    Deposit paid · £{(job.price_total - (job.deposit_amount || 0)).toFixed(2)} due
                  </p>
                )}
                {!job.payment_received && !job.deposit_required && job.price_total > 0 && (
                  <p className="text-xs text-orange-600 font-bold">Payment due</p>
                )}
              </button>
            )}
          </div>

          <div className="flex items-center justify-between gap-2 mt-3 pt-3 border-t border-gray-100 dark:border-gray-700">
            <span className={`inline-block px-3 py-1 rounded-lg font-bold text-sm ${JOB_STATUS_COLORS[job.status]}`}>
              {JOB_STATUS_SHORT_LABELS[job.status]}
            </span>
            {job.repair_outcome && (
              <span className={`text-xs px-2.5 py-1 rounded-lg font-bold ${
                job.repair_outcome === 'repaired' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
              }`}>
                {job.repair_outcome === 'repaired' ? 'Fixed' : 'Not Fixed'}
              </span>
            )}
            <div className="flex items-center gap-2 flex-wrap">
              {job.device_in_shop && (
                <span className="text-xs px-2.5 py-1 bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300 rounded-lg font-bold flex items-center gap-1">
                  <CheckCircle className="h-3.5 w-3.5" />
                  In Shop
                </span>
              )}
              {job.onboarding_completed && (
                <span className="text-xs px-2.5 py-1 bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 rounded-lg font-bold flex items-center gap-1" title="Onboarding completed">
                  <CheckCircle className="h-3.5 w-3.5" />
                  Onboarded
                </span>
              )}
              {job.terms_accepted && (
                <span className="text-xs px-2.5 py-1 bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 rounded-lg font-bold flex items-center gap-1" title="Terms accepted">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  Terms
                </span>
              )}
              {job.diagnostic_report && (
                <button
                  onClick={() => setActivePanel('diagnostic')}
                  className="text-xs px-2.5 py-1 bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300 rounded-lg font-bold flex items-center gap-1 hover:bg-purple-200 dark:hover:bg-purple-900/60 transition-colors"
                >
                  <FileText className="h-3.5 w-3.5" />
                  Diagnostic
                </button>
              )}
              {job.is_warranty && (
                <span className="text-xs px-2.5 py-1 bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300 rounded-lg font-bold flex items-center gap-1">
                  <Shield className="h-3.5 w-3.5" />
                  Warranty
                </span>
              )}
              {job.message_preference === 'whatsapp' && (
                <span className="text-xs px-2.5 py-1 bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 rounded-lg font-bold flex items-center gap-1" title="Customer prefers WhatsApp">
                  <MessageCircle className="h-3.5 w-3.5" />
                  WhatsApp
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Mini Action Buttons Row 1 - info panels (square) */}
        <div className="grid grid-cols-5 gap-2">
          <button
            onClick={() => setActivePanel('device')}
            className="aspect-square flex flex-col items-center justify-center gap-1 bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-xl hover:border-primary transition-colors active:scale-95"
          >
            <Smartphone className="h-5 w-5 text-primary" />
            <span className="text-[10px] font-medium text-gray-700 dark:text-gray-300">Device</span>
          </button>
          <button
            onClick={() => setActivePanel('customer')}
            className="aspect-square flex flex-col items-center justify-center gap-1 bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-xl hover:border-primary transition-colors active:scale-95"
          >
            <User className="h-5 w-5 text-primary" />
            <span className="text-[10px] font-medium text-gray-700 dark:text-gray-300">Customer</span>
          </button>
          <button
            onClick={() => setActivePanel('diagnostic')}
            className="aspect-square flex flex-col items-center justify-center gap-1 bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-xl hover:border-primary transition-colors active:scale-95"
          >
            <FileText className="h-5 w-5 text-primary" />
            <span className="text-[10px] font-medium text-gray-700 dark:text-gray-300">Diagnostic</span>
          </button>
          <button
            onClick={() => setActivePanel('history')}
            className="aspect-square flex flex-col items-center justify-center gap-1 bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-xl hover:border-primary transition-colors active:scale-95"
          >
            <Clock className="h-5 w-5 text-primary" />
            <span className="text-[10px] font-medium text-gray-700 dark:text-gray-300">History</span>
          </button>
          {job.device_password && !job.password_not_applicable ? (
            <button
              onClick={async () => {
                if (job.device_password?.startsWith('ENCRYPTED:') && !decryptedPassword) {
                  try {
                    const res = await fetch('/api/password/decrypt', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ jobId: job.id }),
                    })
                    const data = await res.json()
                    if (data.password) setDecryptedPassword(data.password)
                    else if (data.notApplicable) setDecryptedPassword('N/A')
                  } catch (e) { console.error('Decrypt failed:', e) }
                }
                setShowPassword(!showPassword)
              }}
              onContextMenu={(e) => { e.preventDefault(); setShowBigPassword(true) }}
              onTouchStart={(e) => {
                const timer = setTimeout(() => setShowBigPassword(true), 500)
                ;(e.currentTarget as HTMLElement).dataset.longPressTimer = String(timer)
              }}
              onTouchEnd={(e) => {
                const timer = (e.currentTarget as HTMLElement).dataset.longPressTimer
                if (timer) clearTimeout(Number(timer))
              }}
              onTouchMove={(e) => {
                const timer = (e.currentTarget as HTMLElement).dataset.longPressTimer
                if (timer) clearTimeout(Number(timer))
              }}
              className="aspect-square flex flex-col items-center justify-center gap-1 bg-blue-50 dark:bg-blue-900/30 border-2 border-blue-200 dark:border-blue-700 rounded-xl hover:border-blue-400 transition-colors active:scale-95 select-none"
            >
              <Lock className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              <span className="text-[10px] font-medium text-blue-700 dark:text-blue-300 truncate max-w-full px-1">{showPassword ? (decryptedPassword || (job.device_password?.startsWith('ENCRYPTED:') ? 'Loading...' : job.device_password)) : 'Password'}</span>
            </button>
          ) : (
            <div className="aspect-square flex flex-col items-center justify-center gap-1 bg-gray-50 dark:bg-gray-800/50 border-2 border-gray-100 dark:border-gray-700/50 rounded-xl opacity-50">
              <Lock className="h-5 w-5 text-gray-400" />
              <span className="text-[10px] font-medium text-gray-400">N/A</span>
            </div>
          )}
        </div>

        {/* Mini Action Buttons Row 2 - quick actions (square) */}
        <div className="grid grid-cols-5 gap-2">
          <button
            onClick={() => setShowSmsComposer(true)}
            className="aspect-square flex flex-col items-center justify-center gap-1 bg-primary text-white font-bold rounded-xl hover:bg-primary-dark transition-colors active:scale-95"
          >
            <Send className="h-5 w-5" />
            <span className="text-[10px]">Message</span>
          </button>
          {job.is_warranty ? (
            <div className="aspect-square flex flex-col items-center justify-center gap-1 bg-green-50 dark:bg-green-900/20 border-2 border-green-200 dark:border-green-800 rounded-xl">
              <Shield className="h-5 w-5 text-green-600 dark:text-green-400" />
              <span className="text-[10px] text-green-700 dark:text-green-300 font-bold">Warranty</span>
            </div>
          ) : (
            <button
              onClick={() => setShowPriceModal(true)}
              className="aspect-square flex flex-col items-center justify-center gap-1 bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white font-bold rounded-xl hover:border-primary transition-colors active:scale-95"
            >
              <PoundSterling className="h-5 w-5 text-primary" />
              <span className="text-[10px] text-gray-700 dark:text-gray-300">Price</span>
            </button>
          )}
          <button
            onClick={() => setActivePanel('notes')}
            className="aspect-square flex flex-col items-center justify-center gap-1 bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white font-bold rounded-xl hover:border-primary transition-colors active:scale-95"
          >
            <StickyNote className="h-5 w-5 text-primary" />
            <span className="text-[10px] text-gray-700 dark:text-gray-300">Notes</span>
          </button>
          <button
            onClick={() => setShowTrackingLinkModal(true)}
            className="aspect-square flex flex-col items-center justify-center gap-1 bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white font-bold rounded-xl hover:border-primary transition-colors active:scale-95"
          >
            <Link2 className="h-5 w-5 text-primary" />
            <span className="text-[10px] text-gray-700 dark:text-gray-300">Tracking</span>
          </button>
          <button
            onClick={() => setShowReviewPlatforms(true)}
            onContextMenu={(e) => { e.preventDefault(); setShowReviewReason(true) }}
            className={`aspect-square flex flex-col items-center justify-center gap-1 border-2 font-bold rounded-xl transition-colors active:scale-95 ${
              job.skip_review_request
                ? 'bg-red-50 dark:bg-red-900/30 border-red-200 dark:border-red-700 text-red-700 dark:text-red-300'
                : 'bg-green-50 dark:bg-green-900/30 border-green-200 dark:border-green-700 text-green-700 dark:text-green-300'
            }`}
            title="Tap for review platforms · Long-press for customer settings"
          >
            <Star className="h-5 w-5" />
            <span className="text-[10px]">Reviews</span>
          </button>
        </div>

        {/* Onboarding Gate - shows if customer hasn't completed onboarding */}
        {!job.onboarding_completed && (
          <div className="card bg-yellow-50 border-2 border-yellow-300">
            <OnboardingGate 
              onboardingCompleted={false}
              jobRef={job.job_ref}
            />
            <Link
              href={`/app/jobs/create?jobId=${job.id}`}
              className="block w-full mt-4 bg-primary hover:bg-primary-dark text-white font-bold py-3 px-6 rounded-xl transition-all text-center"
            >
              Complete Onboarding In-Shop
            </Link>
          </div>
        )}

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

        {job.deposit_required && !job.deposit_received && !job.is_warranty && (
          <div className="card bg-yellow-50 border-2 border-yellow-300">
            <div className="flex items-start space-x-3 mb-4">
              <AlertCircle className="h-6 w-6 text-yellow-600 flex-shrink-0 mt-1" />
              <div className="flex-1">
                <p className="font-bold text-yellow-900 text-lg mb-1">
                  Deposit Required
                </p>
                <p className="text-yellow-800 text-sm mb-3">
                  Deposit needed before ordering parts
                </p>
                <div>
                  <label className="block text-sm font-semibold text-yellow-900 mb-1">
                    Deposit Amount (£)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={depositAmountInput}
                    onChange={(e) => setDepositAmountInput(e.target.value)}
                    className="w-full px-4 py-3 text-2xl font-bold border-2 border-yellow-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-yellow-500 bg-white text-yellow-900"
                    placeholder="20.00"
                  />
                  {job.price_total > 0 && (
                    <p className="text-xs text-yellow-700 mt-1">
                      Balance after deposit: £{(job.price_total - (parseFloat(depositAmountInput) || 0)).toFixed(2)}
                    </p>
                  )}
                </div>
              </div>
            </div>
            <div className="space-y-3">
              <button
                onClick={sendDepositRequest}
                disabled={depositSending || actionLoading}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-4 px-6 rounded-2xl text-lg disabled:opacity-50 transition-all shadow-lg active:scale-95 flex items-center justify-center space-x-3"
              >
                {depositSending ? (
                  <><RefreshCw className="h-6 w-6 animate-spin" /><span>Sending...</span></>
                ) : (
                  <><Send className="h-6 w-6" /><span>Send Deposit Request SMS</span></>
                )}
              </button>
              <button
                onClick={markDepositReceived}
                disabled={actionLoading || depositSending}
                className="w-full bg-yellow-600 hover:bg-yellow-700 text-white font-black py-6 px-6 rounded-2xl text-xl disabled:opacity-50 transition-all shadow-lg active:scale-95 flex items-center justify-center space-x-3"
              >
                {actionLoading ? (
                  <span>Processing...</span>
                ) : (
                  <>
                    <CheckCircle className="h-8 w-8" />
                    <span>Mark Deposit Received (£{(parseFloat(depositAmountInput) || 20).toFixed(2)})</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {job.deposit_required && job.deposit_received && !job.is_warranty && (
          <div className="card bg-green-50 border-2 border-green-300">
            <div className="flex items-start space-x-3">
              <CheckCircle className="h-6 w-6 text-green-600 flex-shrink-0 mt-1" />
              <div className="flex-1">
                <p className="font-bold text-green-900 text-lg mb-1">
                  Deposit Paid
                </p>
                <p className="text-green-800 text-sm">
                  £{job.deposit_amount?.toFixed(2) || '20.00'} deposit received
                </p>
                {job.price_total > 0 && (
                  <p className="text-green-700 text-sm font-semibold mt-1">
                    Balance remaining: £{(job.price_total - (job.deposit_amount || 0)).toFixed(2)}
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Payment Status Toggle — moved to header under price button */}

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
            {job.status === 'QUOTE_REQUESTED' && (
              <div className="bg-blue-50 border-2 border-blue-200 rounded-xl p-4">
                <h3 className="font-bold text-blue-900 mb-3 flex items-center gap-2">
                  <DollarSign className="h-5 w-5" />
                  Add Quote Price
                </h3>
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1">
                      Quote Price (£)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      id="quotePrice"
                      className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="0.00"
                    />
                  </div>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      id="requiresParts"
                      className="w-5 h-5 text-blue-600 rounded"
                    />
                    <span className="text-sm font-semibold text-gray-700">
                      Parts Required
                    </span>
                  </label>
                  <button
                    onClick={async () => {
                      const priceInput = document.getElementById('quotePrice') as HTMLInputElement
                      const partsCheckbox = document.getElementById('requiresParts') as HTMLInputElement
                      const price = parseFloat(priceInput.value)
                      
                      if (!price || price <= 0) {
                        alert('Please enter a valid quote price')
                        return
                      }
                      
                      setActionLoading(true)
                      try {
                        const response = await fetch(`/api/jobs/${params.id}/send-quote`, {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            quoted_price: price,
                            requires_parts_order: partsCheckbox.checked,
                          }),
                        })
                        
                        if (!response.ok) {
                          const data = await response.json()
                          throw new Error(data.error || 'Failed to send quote')
                        }
                        
                        loadJobData()
                      } catch (err: any) {
                        alert(err.message || 'Failed to send quote')
                      } finally {
                        setActionLoading(false)
                      }
                    }}
                    disabled={actionLoading}
                    className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold py-3 px-4 rounded-lg transition-all flex items-center justify-center gap-2"
                  >
                    {actionLoading ? (
                      <RefreshCw className="h-5 w-5 animate-spin" />
                    ) : (
                      <MessageSquare className="h-5 w-5" />
                    )}
                    <span>Send Quote to Customer</span>
                  </button>
                </div>
              </div>
            )}

            {job.status === 'QUOTE_APPROVED' && (
              <>
                <button
                  onClick={() => handleWorkflowStatusChange('RECEIVED')}
                  disabled={actionLoading}
                  className="w-full bg-primary hover:bg-primary-dark text-white font-black py-6 px-6 rounded-2xl text-xl disabled:opacity-50 transition-all shadow-lg active:scale-95 flex items-center justify-center space-x-3"
                >
                  <CheckCircle className="h-7 w-7" />
                  <span>Mark as Received</span>
                </button>
                {job.requires_parts_order && (
                  <>
                    <button
                      onClick={async () => {
                        setActionLoading(true)
                        const response = await fetch(`/api/jobs/${params.id}/request-deposit`, { method: 'POST' })
                        if (response.ok) loadJobData()
                        else alert('Failed to request deposit')
                        setActionLoading(false)
                      }}
                      disabled={actionLoading}
                      className="w-full bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white font-bold py-4 px-6 rounded-xl transition-all flex items-center justify-center gap-2"
                    >
                      <Coins className="h-5 w-5" />
                      <span>Request Deposit</span>
                    </button>
                    <button
                      onClick={async () => {
                        setActionLoading(true)
                        const response = await fetch(`/api/jobs/${params.id}/notify-parts`, { method: 'POST' })
                        if (response.ok) alert('Parts notification sent')
                        else alert('Failed to send notification')
                        setActionLoading(false)
                      }}
                      disabled={actionLoading}
                      className="w-full bg-purple-500 hover:bg-purple-600 disabled:opacity-50 text-white font-bold py-3 px-6 rounded-xl transition-all flex items-center justify-center gap-2"
                    >
                      <MessageSquare className="h-5 w-5" />
                      <span>Notify About Parts</span>
                    </button>
                  </>
                )}
              </>
            )}
            
            {job.status === 'RECEIVED' && !job.parts_required && (
              <>
                <button
                  onClick={() => handleWorkflowStatusChange('DIAGNOSTIC')}
                  disabled={actionLoading}
                  className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-black py-6 px-6 rounded-2xl text-xl disabled:opacity-50 transition-all shadow-lg active:scale-95 flex items-center justify-center space-x-3"
                >
                  <Stethoscope className="h-7 w-7" />
                  <span>Start Diagnostic</span>
                </button>
                <button
                  onClick={() => handleWorkflowStatusChange('IN_REPAIR')}
                  disabled={actionLoading}
                  className="w-full bg-primary hover:bg-primary-dark text-white font-black py-4 px-6 rounded-2xl text-lg disabled:opacity-50 transition-all shadow-lg active:scale-95 flex items-center justify-center space-x-3"
                >
                  <Wrench className="h-6 w-6" />
                  <span>Skip to Repair</span>
                </button>
              </>
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
              <>
                {/* Parts Tracking Info Entry */}
                <div className="bg-purple-50 dark:bg-purple-900/20 border-2 border-purple-200 dark:border-purple-800 rounded-xl p-4 space-y-3">
                  <h3 className="font-bold text-purple-900 dark:text-purple-200 text-sm flex items-center gap-2">
                    <Package className="h-4 w-4" />
                    Parts Tracking Details
                  </h3>
                  <p className="text-xs text-purple-700 dark:text-purple-300">Enter tracking info so customers can see it on their tracking page.</p>
                  <div className="space-y-2">
                    <input
                      type="text"
                      placeholder="Supplier (e.g. iParts, eBay, AliExpress)"
                      value={partsSupplier}
                      onChange={(e) => setPartsSupplier(e.target.value)}
                      className="w-full px-3 py-2 text-sm border-2 border-purple-200 dark:border-purple-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                    />
                    <input
                      type="text"
                      placeholder="Tracking number (e.g. RM123456789GB)"
                      value={partsTrackingNumber}
                      onChange={(e) => setPartsTrackingNumber(e.target.value)}
                      className="w-full px-3 py-2 text-sm border-2 border-purple-200 dark:border-purple-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                    />
                    <input
                      type="url"
                      placeholder="Tracking URL (optional, e.g. https://royalmail.com/track/RM123)"
                      value={partsTrackingUrl}
                      onChange={(e) => setPartsTrackingUrl(e.target.value)}
                      className="w-full px-3 py-2 text-sm border-2 border-purple-200 dark:border-purple-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                    />
                    <input
                      type="datetime-local"
                      value={partsExpectedAt}
                      onChange={(e) => setPartsExpectedAt(e.target.value)}
                      className="w-full px-3 py-2 text-sm border-2 border-purple-200 dark:border-purple-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                    />
                    <button
                      onClick={handleSavePartsInfo}
                      disabled={savingPartsInfo}
                      className="w-full bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white font-bold py-2 px-4 rounded-lg text-sm transition-all flex items-center justify-center gap-2"
                    >
                      {savingPartsInfo ? (
                        <><RefreshCw className="h-4 w-4 animate-spin" /> Saving...</>
                      ) : (
                        <><Package className="h-4 w-4" /> Save Parts Info</>
                      )}
                    </button>
                  </div>
                </div>

                {/* Tracking Toggle Button - shows whenever job has a tracking number */}
                {job.parts_tracking_number && (
                  <>
                    <button
                      onClick={() => setShowTrackingPanel(!showTrackingPanel)}
                      className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-4 rounded-xl text-sm transition-all flex items-center justify-center gap-2"
                    >
                      <Truck className="h-5 w-5" />
                      {showTrackingPanel ? 'Hide Tracking' : 'Show Tracking'}
                      {job.parts_tracking_status && (
                        <span className={`ml-2 px-2 py-0.5 rounded-full text-xs font-bold ${
                          job.parts_tracking_status === 'Delivered'
                            ? 'bg-green-200 text-green-900'
                            : job.parts_tracking_status === 'OutForDelivery'
                            ? 'bg-blue-200 text-blue-900'
                            : job.parts_tracking_status === 'InTransit'
                            ? 'bg-yellow-200 text-yellow-900'
                            : 'bg-white/20 text-white'
                        }`}>
                          {job.parts_tracking_status === 'InfoReceived' ? 'Label Created' :
                           job.parts_tracking_status === 'InTransit' ? 'In Transit' :
                           job.parts_tracking_status === 'OutForDelivery' ? 'Out for Delivery' :
                           job.parts_tracking_status === 'Delivered' ? 'Delivered' :
                           job.parts_tracking_status === 'AvailableForPickup' ? 'Ready for Pickup' :
                           job.parts_tracking_status === 'Exception' ? 'Exception' :
                           job.parts_tracking_status === 'Expired' ? 'Expired' :
                           job.parts_tracking_status === 'Stopped' ? 'Stopped' :
                           job.parts_tracking_status}
                        </span>
                      )}
                    </button>

                    {showTrackingPanel && (
                      <div className="bg-blue-50 dark:bg-blue-900/20 border-2 border-blue-200 dark:border-blue-800 rounded-xl p-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <h4 className="font-bold text-blue-900 dark:text-blue-200 text-sm flex items-center gap-2">
                            <Truck className="h-4 w-4" />
                            Live Tracking
                          </h4>
                          <button
                            onClick={handleCheckTracking}
                            disabled={checkingTracking}
                            className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold py-1.5 px-3 rounded-lg text-xs transition-all flex items-center gap-1.5"
                          >
                            {checkingTracking ? (
                              <><RefreshCw className="h-3 w-3 animate-spin" /> Checking...</>
                            ) : (
                              <><RefreshCw className="h-3 w-3" /> Check Again</>
                            )}
                          </button>
                        </div>

                        {job.parts_tracking_number && (
                          <div className="text-sm">
                            <span className="text-blue-700 dark:text-blue-300 font-medium">Tracking #: </span>
                            <span className="text-gray-900 dark:text-white font-semibold">{job.parts_tracking_number}</span>
                          </div>
                        )}

                        {job.parts_tracking_status ? (
                          <>
                            <div className="flex items-center gap-2">
                              <span className="text-blue-700 dark:text-blue-300 font-medium text-sm">Status:</span>
                              <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                                job.parts_tracking_status === 'Delivered'
                                  ? 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300'
                                  : job.parts_tracking_status === 'OutForDelivery'
                                  ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300'
                                  : job.parts_tracking_status === 'InTransit'
                                  ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300'
                                  : 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300'
                              }`}>
                                {job.parts_tracking_status === 'InfoReceived' ? 'Label Created' :
                                 job.parts_tracking_status === 'InTransit' ? 'In Transit' :
                                 job.parts_tracking_status === 'OutForDelivery' ? 'Out for Delivery' :
                                 job.parts_tracking_status === 'Delivered' ? 'Delivered' :
                                 job.parts_tracking_status === 'AvailableForPickup' ? 'Available for Pickup' :
                                 job.parts_tracking_status === 'Exception' ? 'Delivery Exception' :
                                 job.parts_tracking_status === 'Expired' ? 'Tracking Expired' :
                                 job.parts_tracking_status === 'Stopped' ? 'Tracking Stopped' :
                                 job.parts_tracking_status}
                              </span>
                            </div>

                            {job.parts_tracking_last_event && (
                              <p className="text-sm text-gray-700 dark:text-gray-300">
                                {job.parts_tracking_last_event}
                                {job.parts_tracking_last_location && ` - ${job.parts_tracking_last_location}`}
                              </p>
                            )}

                            {job.parts_tracking_eta && job.parts_tracking_status !== 'Delivered' && (
                              <p className="text-sm text-blue-600 dark:text-blue-400">
                                Est. delivery: {new Date(job.parts_tracking_eta).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}
                              </p>
                            )}

                            {job.parts_tracking_updated_at && (
                              <p className="text-xs text-gray-400 dark:text-gray-500">
                                Last checked: {new Date(job.parts_tracking_updated_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                              </p>
                            )}
                          </>
                        ) : (
                          <p className="text-sm text-gray-500 dark:text-gray-400 italic">
                            No tracking data yet. Click "Check Again" to fetch live tracking.
                          </p>
                        )}

                        {job.parts_tracking_url && (
                          <a
                            href={job.parts_tracking_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="block bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg text-center text-sm transition-all"
                          >
                            Open Carrier Tracking Page
                          </a>
                        )}
                      </div>
                    )}
                  </>
                )}

                <button
                  onClick={() => handleWorkflowStatusChange('PARTS_ARRIVED')}
                  disabled={actionLoading}
                  className="w-full bg-primary hover:bg-primary-dark text-white font-black py-6 px-6 rounded-2xl text-xl disabled:opacity-50 transition-all shadow-lg active:scale-95 flex items-center justify-center space-x-3"
                >
                  <Package className="h-8 w-8" />
                  <span>Parts Arrived</span>
                </button>
              </>
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

            {job.status === 'DIAGNOSTIC' && (
              <>
                <button
                  onClick={() => handleWorkflowStatusChange('IN_REPAIR')}
                  disabled={actionLoading}
                  className="w-full bg-primary hover:bg-primary-dark text-white font-black py-6 px-6 rounded-2xl text-xl disabled:opacity-50 transition-all shadow-lg active:scale-95 flex items-center justify-center space-x-3"
                >
                  <Wrench className="h-7 w-7" />
                  <span>Start Repair</span>
                </button>
                <button
                  onClick={() => setActivePanel('diagnostic')}
                  disabled={actionLoading}
                  className="w-full bg-indigo-500 hover:bg-indigo-600 text-white font-bold py-4 px-6 rounded-xl transition-all flex items-center justify-center gap-2"
                >
                  <FileText className="h-5 w-5" />
                  <span>Write Diagnostic Report</span>
                </button>
              </>
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
            <div className="pt-4 border-t-2 border-gray-300 dark:border-gray-600">
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-3 font-bold">Need to change status manually?</p>
              <div className="grid grid-cols-2 gap-4">
                <button
                  onClick={() => setShowQuickActions(true)}
                  disabled={actionLoading}
                  className="bg-primary hover:bg-primary-dark text-white font-black py-6 px-6 rounded-2xl text-lg disabled:opacity-50 transition-all shadow-lg active:scale-95"
                >
                  Change Status
                </button>
                <button
                  onClick={() => router.push('/app/jobs')}
                  className="bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-900 dark:text-white font-black py-6 px-6 rounded-2xl text-lg transition-all shadow-lg active:scale-95"
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
            <div className="bg-white dark:bg-gray-800 rounded-2xl max-w-md w-full p-6 shadow-2xl">
              <h2 className="text-2xl font-black text-gray-900 dark:text-white mb-4">Confirm Status Change</h2>
              <p className="text-gray-700 dark:text-gray-300 mb-4">
                Change status to <span className="font-bold text-primary">{JOB_STATUS_LABELS[pendingWorkflowStatus]}</span>?
              </p>
              
              {/* Notification Warning */}
              {(willSendSMS || willSendEmail) && (
                <div className="bg-blue-50 dark:bg-blue-900/20 border-2 border-blue-200 dark:border-blue-800 rounded-xl p-4 mb-4">
                  <div className="flex items-start space-x-3">
                    <MessageSquare className="h-5 w-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <p className="text-sm font-bold text-blue-900 dark:text-blue-200 mb-2">Notifications Will Be Sent</p>
                      <div className="space-y-2">
                        {willSendSMS && (
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={!overrideSMS}
                              onChange={(e) => setOverrideSMS(!e.target.checked)}
                              className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                            />
                            <span className="text-xs text-blue-900 dark:text-blue-200">
                              <span className="font-semibold">SMS</span> - Customer will receive a text message
                            </span>
                          </label>
                        )}
                        {willSendEmail && (
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={!overrideEmail}
                              onChange={(e) => setOverrideEmail(!e.target.checked)}
                              className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                            />
                            <span className="text-xs text-blue-900 dark:text-blue-200">
                              <span className="font-semibold">Email</span> - Customer will receive an email
                            </span>
                          </label>
                        )}
                      </div>
                      <p className="text-xs text-blue-600 dark:text-blue-400 mt-2">Uncheck to skip sending that notification</p>

                      {willSendSMS && !overrideSMS && (pendingWorkflowStatus === 'READY_TO_COLLECT' || pendingWorkflowStatus === 'QUOTE_REMINDER') && job.price_total > 0 && (
                        <label className="flex items-center gap-2 cursor-pointer mt-3 pt-3 border-t border-blue-200 dark:border-blue-800">
                          <input
                            type="checkbox"
                            checked={sendPriceInSms}
                            onChange={(e) => setSendPriceInSms(e.target.checked)}
                            className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                          />
                          <span className="text-xs text-blue-900 dark:text-blue-200">
                            <span className="font-semibold">Include price (£{job.price_total.toFixed(2)})</span> in SMS
                          </span>
                        </label>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {pendingWorkflowStatus === 'COLLECTED' && (
                <RepairOutcomeSelector value={repairOutcome} onChange={setRepairOutcome} />
              )}

              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setShowSimpleConfirm(false)
                    setPendingWorkflowStatus(null)
                  }}
                  className="flex-1 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-900 dark:text-white font-bold py-4 px-6 rounded-xl transition-colors"
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
                      <p className="text-sm font-bold text-blue-900 mb-2">Notifications Will Be Sent</p>
                      <div className="space-y-2">
                        {willSendSMS && (
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={!overrideSMS}
                              onChange={(e) => setOverrideSMS(!e.target.checked)}
                              className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                            />
                            <span className="text-xs text-blue-900">
                              <span className="font-semibold">SMS</span> - Customer will receive delay reason and notes
                            </span>
                          </label>
                        )}
                        {willSendEmail && (
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={!overrideEmail}
                              onChange={(e) => setOverrideEmail(!e.target.checked)}
                              className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                            />
                            <span className="text-xs text-blue-900">
                              <span className="font-semibold">Email</span> - Customer will receive an email
                            </span>
                          </label>
                        )}
                      </div>
                      <p className="text-xs text-blue-600 mt-2">To: {job.customer_phone}{job.customer_email ? ` / ${job.customer_email}` : ''}</p>
                      <p className="text-xs text-blue-600 mt-1">Uncheck to skip sending that notification</p>
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

        {/* Cancellation Reason Modal */}
        {showCancellationModal && job && (
          <CancellationReasonModal
            deviceInfo={`${job.device_make} ${job.device_model}`}
            onConfirm={handleCancellationReasonSubmit}
            onCancel={() => setShowCancellationModal(false)}
          />
        )}

        {/* Cancellation Confirmation Modal (shows SMS/Email notification info) */}
        {showCancellationConfirm && job && (
          <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4 overflow-y-auto">
            <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl">
              <h2 className="text-2xl font-black text-gray-900 mb-4">Confirm Cancellation</h2>
              <p className="text-gray-700 mb-2">
                Cancel job for <span className="font-bold">{job.device_make} {job.device_model}</span>?
              </p>
              <p className="text-sm text-gray-600 mb-4">
                Reason: <span className="font-semibold">{pendingCancellationReason.replace(/_/g, ' ')}</span>
              </p>
              
              {/* Notification Warning */}
              {(willSendSMS || willSendEmail) && (
                <div className="bg-blue-50 border-2 border-blue-200 rounded-xl p-4 mb-4">
                  <div className="flex items-start space-x-3">
                    <MessageSquare className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <p className="text-sm font-bold text-blue-900 mb-2">Notifications Will Be Sent</p>
                      <div className="space-y-2">
                        {willSendSMS && (
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={!overrideSMS}
                              onChange={(e) => setOverrideSMS(!e.target.checked)}
                              className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                            />
                            <span className="text-xs text-blue-900">
                              <span className="font-semibold">SMS</span> - Customer will receive cancellation reason and notes
                            </span>
                          </label>
                        )}
                        {willSendEmail && (
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={!overrideEmail}
                              onChange={(e) => setOverrideEmail(!e.target.checked)}
                              className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                            />
                            <span className="text-xs text-blue-900">
                              <span className="font-semibold">Email</span> - Customer will receive an email
                            </span>
                          </label>
                        )}
                      </div>
                      <p className="text-xs text-blue-600 mt-2">To: {job.customer_phone}{job.customer_email ? ` / ${job.customer_email}` : ''}</p>
                      <p className="text-xs text-blue-600 mt-1">Uncheck to skip sending that notification</p>
                    </div>
                  </div>
                </div>
              )}
              
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setShowCancellationConfirm(false)
                    setPendingCancellationReason('')
                    setPendingCancellationNotes('')
                  }}
                  className="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-900 font-bold py-4 px-6 rounded-xl transition-colors"
                >
                  Go Back
                </button>
                <button
                  onClick={confirmCancellationStatusChange}
                  className="flex-1 bg-gray-800 hover:bg-gray-900 text-white font-bold py-4 px-6 rounded-xl transition-colors"
                >
                  Confirm Cancellation
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
            showPriceOption={newStatus === 'READY_TO_COLLECT' || newStatus === 'QUOTE_REMINDER'}
            priceValue={job.price_total}
            sendPriceInSms={sendPriceInSms}
            onSendPriceInSmsChange={setSendPriceInSms}
          />
        )}

        {/* Big Password Overlay (long press) */}
        {showBigPassword && job.device_password && (
          <div
            className="fixed inset-0 bg-black/80 z-[60] flex items-center justify-center p-4"
            onClick={() => setShowBigPassword(false)}
          >
            <div className="bg-white dark:bg-gray-800 rounded-2xl p-8 max-w-lg w-full shadow-2xl text-center">
              <div className="flex items-center justify-center gap-2 mb-4">
                <Lock className="h-6 w-6 text-blue-600 dark:text-blue-400" />
                <span className="text-xs font-bold text-blue-600 dark:text-blue-400 uppercase">Device Password</span>
              </div>
              <p className="text-4xl font-mono font-black text-gray-900 dark:text-white break-all tracking-wider">
                {decryptedPassword || (job.device_password?.startsWith('ENCRYPTED:') ? 'Loading...' : job.device_password)}
              </p>
              <p className="text-sm text-gray-400 mt-6">Tap anywhere to close</p>
            </div>
          </div>
        )}

        {/* Tracking Link Modal */}
        {showTrackingLinkModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
            <div className="bg-white dark:bg-gray-800 rounded-lg max-w-md w-full p-6 shadow-xl">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Customer Tracking Link</h3>
              
              <div className="bg-gray-50 dark:bg-gray-700 p-3 rounded text-xs break-all text-gray-900 dark:text-white mb-4 border border-gray-200 dark:border-gray-600">
                https://nfd-repairs-app.vercel.app/t/{job.tracking_token}
              </div>

              <div className="space-y-2 mb-4">
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(`https://nfd-repairs-app.vercel.app/t/${job.tracking_token}`)
                    setLinkCopied(true)
                    setTimeout(() => setLinkCopied(false), 2000)
                  }}
                  className="w-full bg-primary hover:bg-primary-dark text-white font-semibold py-3 px-4 rounded transition-colors"
                >
                  {linkCopied ? 'Copied!' : 'Copy to Clipboard'}
                </button>
                
                <button
                  onClick={() => {
                    window.open(`https://nfd-repairs-app.vercel.app/t/${job.tracking_token}`, '_blank')
                    setShowTrackingLinkModal(false)
                  }}
                  className="w-full bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-900 dark:text-white font-semibold py-3 px-4 rounded transition-colors"
                >
                  Open in New Tab
                </button>
              </div>

              <button
                onClick={() => {
                  setShowTrackingLinkModal(false)
                  setLinkCopied(false)
                }}
                className="w-full text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white text-sm py-2"
              >
                Close
              </button>
            </div>
          </div>
        )}
      </main>

      {/* Slide-Up Panel: Device Details */}
      <SlideUpPanel
        isOpen={activePanel === 'device'}
        onClose={() => setActivePanel(null)}
        title="Device Details"
        icon={<Smartphone className="h-5 w-5 text-primary" />}
        minHeight="60vh"
      >
        <div className="space-y-4">
          <div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-1 font-semibold">Device</p>
            <p className="text-base text-gray-900 dark:text-white break-words">{job.device_make} {job.device_model}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-1 font-semibold">Issue</p>
            <p className="text-base text-gray-900 dark:text-white break-words">{job.issue}</p>
          </div>

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
                      {showPassword ? (decryptedPassword || (job.device_password?.startsWith('ENCRYPTED:') ? 'Loading...' : job.device_password)) : '\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022'}
                    </p>
                  </div>
                  <button
                    onClick={async () => {
                      if (job.device_password?.startsWith('ENCRYPTED:') && !decryptedPassword) {
                        try {
                          const res = await fetch('/api/password/decrypt', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ jobId: job.id }),
                          })
                          const data = await res.json()
                          if (data.password) setDecryptedPassword(data.password)
                          else if (data.notApplicable) setDecryptedPassword('N/A')
                        } catch (e) { console.error('Decrypt failed:', e) }
                      }
                      setShowPassword(!showPassword)
                    }}
                    className="flex-shrink-0 p-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors active:scale-95"
                    title={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
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

          {/* Device Location */}
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
                  <span className="text-sm text-gray-600 dark:text-gray-300">Device not yet received</span>
                </>
              )}
            </div>
          </div>

          {(job.source || job.page) && (
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-1 font-semibold">Job Source</p>
              <div className="bg-gray-50 dark:bg-gray-700 p-3 rounded-lg">
                {job.source && <p className="text-sm text-gray-900 dark:text-white"><span className="font-semibold">Source:</span> {job.source}</p>}
                {job.page && <p className="text-sm text-gray-900 dark:text-white"><span className="font-semibold">Page:</span> {job.page}</p>}
              </div>
            </div>
          )}

          {/* Edit button */}
          <Link
            href={`/app/jobs/${job.id}/edit`}
            className="flex items-center justify-center gap-2 w-full px-4 py-2.5 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-900 dark:text-white rounded-xl transition-colors font-medium"
          >
            <Edit className="h-4 w-4" />
            <span>Edit Job Details</span>
          </Link>
        </div>
      </SlideUpPanel>

      {/* Slide-Up Panel: Customer */}
      <SlideUpPanel
        isOpen={activePanel === 'customer'}
        onClose={() => setActivePanel(null)}
        title="Customer"
        icon={<User className="h-5 w-5 text-primary" />}
        minHeight="60vh"
      >
        <div className="space-y-4">
          {/* Inline editable name */}
          <div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-1 font-semibold">Name</p>
            {editingName ? (
              <div className="flex gap-2">
                <input
                  type="text"
                  value={nameValue}
                  onChange={(e) => setNameValue(e.target.value)}
                  className="flex-1 px-3 py-2 border-2 border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  autoFocus
                  onKeyDown={(e) => { if (e.key === 'Enter') handleSaveName(); if (e.key === 'Escape') setEditingName(false) }}
                />
                <button
                  onClick={handleSaveName}
                  disabled={actionLoading}
                  className="px-4 py-2 bg-primary text-white font-bold rounded-lg hover:bg-primary-dark disabled:opacity-50"
                >
                  Save
                </button>
                <button
                  onClick={() => setEditingName(false)}
                  className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white font-bold rounded-lg"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                onClick={() => { setNameValue(job.customer_name); setEditingName(true) }}
                className="text-base text-gray-900 dark:text-white font-medium hover:text-primary transition-colors text-left"
              >
                {job.customer_name}
                <Edit className="h-3 w-3 inline ml-2 text-gray-400" />
              </button>
            )}
          </div>
          {/* Phone - clickable to open SMS app, with inline edit */}
          <div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-1 font-semibold">Phone</p>
            {editingPhone ? (
              <div className="flex gap-2">
                <input
                  type="tel"
                  value={phoneValue}
                  onChange={(e) => setPhoneValue(e.target.value)}
                  className="flex-1 px-3 py-2 border-2 border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  autoFocus
                  onKeyDown={(e) => { if (e.key === 'Enter') handleSavePhone(); if (e.key === 'Escape') setEditingPhone(false) }}
                />
                <button
                  onClick={handleSavePhone}
                  disabled={actionLoading}
                  className="px-4 py-2 bg-primary text-white font-bold rounded-lg hover:bg-primary-dark disabled:opacity-50"
                >
                  Save
                </button>
                <button
                  onClick={() => setEditingPhone(false)}
                  className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white font-bold rounded-lg"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <a
                  href={`sms:${job.customer_phone}`}
                  className="text-base text-gray-900 dark:text-white font-medium hover:text-primary transition-colors"
                >
                  {job.customer_phone}
                </a>
                <button
                  onClick={() => { setPhoneValue(job.customer_phone); setEditingPhone(true) }}
                  className="p-1 text-gray-400 hover:text-primary transition-colors"
                  title="Edit phone number"
                >
                  <Edit className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
          </div>
          {/* Email - with inline edit */}
          <div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-1 font-semibold">Email</p>
            {editingEmail ? (
              <div className="flex gap-2">
                <input
                  type="email"
                  value={emailValue}
                  onChange={(e) => setEmailValue(e.target.value)}
                  className="flex-1 px-3 py-2 border-2 border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  autoFocus
                  placeholder="(optional)"
                  onKeyDown={(e) => { if (e.key === 'Enter') handleSaveEmail(); if (e.key === 'Escape') setEditingEmail(false) }}
                />
                <button
                  onClick={handleSaveEmail}
                  disabled={actionLoading}
                  className="px-4 py-2 bg-primary text-white font-bold rounded-lg hover:bg-primary-dark disabled:opacity-50"
                >
                  Save
                </button>
                <button
                  onClick={() => setEditingEmail(false)}
                  className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white font-bold rounded-lg"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                {job.customer_email ? (
                  <>
                    <a
                      href={`mailto:${job.customer_email}`}
                      className="text-base text-gray-900 dark:text-white font-medium hover:text-primary transition-colors break-all"
                    >
                      {job.customer_email}
                    </a>
                    <button
                      onClick={() => { setEmailValue(job.customer_email || ''); setEditingEmail(true) }}
                      className="p-1 text-gray-400 hover:text-primary transition-colors flex-shrink-0"
                      title="Edit email"
                    >
                      <Edit className="h-3.5 w-3.5" />
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => { setEmailValue(''); setEditingEmail(true) }}
                    className="text-sm text-gray-400 hover:text-primary transition-colors flex items-center gap-1"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Add email
                  </button>
                )}
              </div>
            )}
          </div>

          <p className="text-sm text-gray-600 dark:text-gray-400">Tap to call, text, or message</p>
          <ContactActions
            phone={job.customer_phone}
            name={job.customer_name}
            job={job}
            onMessageSent={loadJobData}
          />
        </div>
      </SlideUpPanel>

      {/* Slide-Up Panel: Customer Notes */}
      <SlideUpPanel
        isOpen={activePanel === 'notes'}
        onClose={() => setActivePanel(null)}
        title="Customer Notes"
        icon={<StickyNote className="h-5 w-5 text-primary" />}
        minHeight="60vh"
      >
        <CustomerNotesEditor job={job} onUpdate={loadJobData} />
      </SlideUpPanel>

      {/* Slide-Up Panel: Diagnostic Report */}
      <SlideUpPanel
        isOpen={activePanel === 'diagnostic'}
        onClose={() => setActivePanel(null)}
        title="Diagnostic Report"
        icon={<FileText className="h-5 w-5 text-primary" />}
        minHeight="60vh"
      >
        <DiagnosticReportEditor 
          job={job} 
          onUpdate={loadJobData} 
          onSendMessage={(report) => {
            setDiagnosticSmsMessage(report)
            setActivePanel(null)
          }}
        />
      </SlideUpPanel>

      {/* Slide-Up Panel: History */}
      <SlideUpPanel
        isOpen={activePanel === 'history'}
        onClose={() => { setActivePanel(null); setHistoryTab('all') }}
        title="Job History"
        icon={<Clock className="h-5 w-5 text-primary" />}
        minHeight="60vh"
      >
        <HistoryTabs
          events={events}
          smsLogs={smsLogs}
          emailLogs={emailLogs}
          actionLoading={actionLoading}
          activeTab={historyTab}
          onTabChange={setHistoryTab}
          onRetrySms={async () => {
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
        />
      </SlideUpPanel>

      {/* Direct SMS Composer (from Message Customer button) */}
      {showSmsComposer && (
        <CustomSmsComposer
          job={job}
          onClose={() => setShowSmsComposer(false)}
          onSent={loadJobData}
        />
      )}

      {/* Diagnostic Report SMS Composer */}
      {diagnosticSmsMessage && (
        <CustomSmsComposer
          job={job}
          initialMessage={diagnosticSmsMessage}
          onClose={() => setDiagnosticSmsMessage(null)}
          onSent={loadJobData}
        />
      )}

      {/* Price Setter Modal */}
      {showPriceModal && (
        <PriceSetterModal
          jobId={job.id}
          currentPrice={job.price_total}
          paymentReceived={job.payment_received}
          depositRequired={job.deposit_required}
          depositReceived={job.deposit_received}
          depositAmount={job.deposit_amount}
          onClose={() => setShowPriceModal(false)}
          onSaved={loadJobData}
        />
      )}

      {/* Quick Actions Modal (status changes) */}
      {showQuickActions && (
        <QuickActionsModal
          jobRef={job.job_ref}
          deviceInfo={`${job.device_make} ${job.device_model}`}
          currentStatus={job.status}
          onSelectStatus={(status) => {
            setShowQuickActions(false)
            handleWorkflowStatusChange(status)
          }}
          onDelete={async () => {
            setShowQuickActions(false)
            setActionLoading(true)
            await supabase.from('job_events').delete().eq('job_id', job.id)
            await supabase.from('sms_logs').delete().eq('job_id', job.id)
            await supabase.from('email_logs').delete().eq('job_id', job.id)
            await supabase.from('notifications').delete().eq('job_id', job.id)
            await supabase.from('jobs').delete().eq('id', job.id)
            router.push('/app/jobs')
          }}
          onClose={() => setShowQuickActions(false)}
        />
      )}

      {/* Customer Management Slide-Up (long-press on review button) */}
      {showReviewReason && (
        <SlideUpPanel
          isOpen={showReviewReason}
          onClose={() => setShowReviewReason(false)}
          title="Customer Management"
          icon={<Star className="h-5 w-5 text-primary" />}
        >
          <CustomerFlagControls job={job} onUpdate={() => { loadJobData(); setShowReviewReason(false) }} />
        </SlideUpPanel>
      )}

      {/* Review Platforms Slide-Up */}
      <ReviewPlatformControls
        job={job}
        isOpen={showReviewPlatforms}
        onClose={() => setShowReviewPlatforms(false)}
        onUpdate={loadJobData}
      />
    </div>
  )
}
