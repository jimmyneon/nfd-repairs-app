'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { JOB_STATUS_LABELS, JOB_STATUS_COLORS, SHOP_INFO } from '@/lib/constants'
import { Package, Clock, CheckCircle, MapPin, MessageSquare, ChevronDown, ChevronUp, Smartphone, Laptop, Tablet, Monitor, Gamepad2, Watch, AlertCircle, QrCode } from 'lucide-react'
import QRCodeDisplay from '@/components/QRCodeDisplay'
import ImHereButton from '@/components/ImHereButton'
import { isTrackingLinkExpired } from '@/lib/job-utils'
import { shortTrackingLink } from '@/lib/utils'
import {
  getDeviceType,
  getTurnaroundEstimate,
  calculateProgressPercent,
  calculateVisitFrequency,
  getReassuranceMessage,
  getDeviceDescription,
  generateActivityLog,
  type ActivityEntry,
} from '@/lib/tracking-utils'

export default function TrackingPage({ params }: { params: { token: string } }) {
  const [job, setJob] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [showQRCode, setShowQRCode] = useState(false)
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date())
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [showActivityLog, setShowActivityLog] = useState(false)
  const [statusChangedAt, setStatusChangedAt] = useState<Date | null>(null)
  const [previousStatus, setPreviousStatus] = useState<string | null>(null)
  const [isExpired, setIsExpired] = useState(false)
  const [shopCoordinates, setShopCoordinates] = useState({ latitude: 55.7558, longitude: -3.9626, radius: 100 })
  const [pageViews, setPageViews] = useState<{ viewed_at: string }[]>([])
  const [visitFrequency, setVisitFrequency] = useState<{ totalVisits: number; visitsLastHour: number; visitsLast24h: number; tier: string }>({
    totalVisits: 0, visitsLastHour: 0, visitsLast24h: 0, tier: 'first',
  })
  const [activityLog, setActivityLog] = useState<ActivityEntry[]>([])
  const [jobEvents, setJobEvents] = useState<{ created_at: string; message: string }[]>([])
  const [statusTimestamps, setStatusTimestamps] = useState<Record<string, string>>({})
  const [expandedStep, setExpandedStep] = useState<number | null>(null)
  const [showDiagnosisResults, setShowDiagnosisResults] = useState(false)
  const supabase = createClient()

  const getDeviceIcon = (deviceMake: string, deviceModel: string) => {
    const combined = `${deviceMake} ${deviceModel}`.toLowerCase()
    if (combined.includes('iphone') || combined.includes('samsung') && !combined.includes('tab') && !combined.includes('book') ||
        combined.includes('pixel') || combined.includes('oneplus') || combined.includes('huawei') ||
        combined.includes('xiaomi') || combined.includes('motorola') || combined.includes('nokia') ||
        combined.includes('phone') || combined.includes('smartphone') || combined.includes('oppo')) {
      return <Smartphone className="h-16 w-16 md:h-20 md:w-20 text-primary" />
    }
    if (combined.includes('ipad') || combined.includes('tablet') || combined.includes('tab ')) {
      return <Tablet className="h-16 w-16 md:h-20 md:w-20 text-primary" />
    }
    if (combined.includes('macbook') || combined.includes('laptop') || combined.includes('notebook') || combined.includes('chromebook')) {
      return <Laptop className="h-16 w-16 md:h-20 md:w-20 text-primary" />
    }
    if (combined.includes('playstation') || combined.includes('xbox') || combined.includes('nintendo') ||
        combined.includes('switch') || combined.includes('ps4') || combined.includes('ps5') || combined.includes('console')) {
      return <Gamepad2 className="h-16 w-16 md:h-20 md:w-20 text-primary" />
    }
    if (combined.includes('watch') || combined.includes('fitbit')) {
      return <Watch className="h-16 w-16 md:h-20 md:w-20 text-primary" />
    }
    if (combined.includes('imac') || combined.includes('desktop') || combined.includes('monitor') || combined.includes('pc')) {
      return <Monitor className="h-16 w-16 md:h-20 md:w-20 text-primary" />
    }
    return <Smartphone className="h-16 w-16 md:h-20 md:w-20 text-primary" />
  }

  const loadJob = useCallback(async (showSpinner = false) => {
    if (showSpinner) setIsRefreshing(true)

    const { data } = await supabase
      .from('jobs')
      .select('id, job_ref, status, device_make, device_model, issue, description, created_at, status_changed_at, parts_required, deposit_required, source, delay_reason, delay_notes, cancellation_reason, cancellation_notes, customer_notes, tracking_link_expires_at, closed_at, show_tracking_to_customer, parts_tracking_status, repair_agreed_at, repair_declined_at, diagnosis_notes, diagnostic_report')
      .eq('tracking_token', params.token)
      .maybeSingle()

    if (data) {
      if (isTrackingLinkExpired(data.tracking_link_expires_at)) {
        setIsExpired(true)
        setLoading(false)
        return
      }

      setJob(data)
      setLastUpdated(new Date())

      // Get status change events
      const { data: events } = await supabase
        .from('job_events')
        .select('created_at, message')
        .eq('job_id', data.id)
        .eq('type', 'STATUS_CHANGE')
        .order('created_at', { ascending: false })
        .limit(10)

      if (events && events.length > 0) {
        setStatusChangedAt(new Date(events[0].created_at))
        setJobEvents(events)

        // Build a map of status -> timestamp from events
        const timestamps: Record<string, string> = {}
        for (const event of events) {
          const match = event.message?.match(/Status changed to (.+?)(?:\s*-|$)/)
          if (match) {
            const label = match[1].trim()
            const statusKey = Object.entries(JOB_STATUS_LABELS).find(
              ([key, l]) => l === label
            )?.[0]
            if (statusKey && !timestamps[statusKey]) {
              timestamps[statusKey] = event.created_at
            }
          }
        }
        // Also add the job creation time as the initial timestamp
        if (!timestamps['QUOTE_APPROVED'] && !timestamps['RECEIVED']) {
          timestamps['RECEIVED'] = data.created_at
        }
        setStatusTimestamps(timestamps)

        if (data.status === 'DELAYED' && events.length > 1) {
          for (let i = 0; i < events.length; i++) {
            const message = events[i].message
            if (message && !message.includes('Delayed')) {
              const statusMatch = message.match(/Status changed to (.+?)(?:\s*-|$)/)
              if (statusMatch) {
                const statusLabel = statusMatch[1].trim()
                const statusKey = Object.entries(JOB_STATUS_LABELS).find(
                  ([key, label]) => label === statusLabel
                )?.[0]
                if (statusKey && statusKey !== 'DELAYED') {
                  setPreviousStatus(statusKey)
                  break
                }
              }
            }
          }
        } else {
          setPreviousStatus(null)
        }
      } else {
        setStatusChangedAt(new Date(data.status_changed_at || data.created_at))
        setPreviousStatus(null)
      }

      // Load page views
      const { data: views } = await supabase
        .from('tracking_page_views')
        .select('viewed_at')
        .eq('job_id', data.id)
        .order('viewed_at', { ascending: false })
        .limit(50)

      if (views) {
        setPageViews(views)
        const freq = calculateVisitFrequency(views)
        setVisitFrequency(freq)
      }
    }
    setLoading(false)

    if (showSpinner) {
      setTimeout(() => setIsRefreshing(false), 800)
    }
  }, [params.token, supabase])

  // Log page view on mount
  useEffect(() => {
    fetch('/api/tracking/view', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ trackingToken: params.token }),
    }).catch(() => {})
  }, [params.token])

  useEffect(() => {
    loadJob()
    // Load shop coordinates
    supabase
      .from('admin_settings')
      .select('shop_latitude, shop_longitude, gps_radius_meters')
      .limit(1)
      .single()
      .then(({ data }) => {
        if (data) {
          setShopCoordinates({
            latitude: data.shop_latitude || 55.7558,
            longitude: data.shop_longitude || -3.9626,
            radius: data.gps_radius_meters || 100,
          })
        }
      })

    // Real-time subscription
    const channel = supabase
      .channel('job-tracking')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'jobs',
          filter: `tracking_token=eq.${params.token}`,
        },
        (payload) => {
          setJob(payload.new)
          setLastUpdated(new Date())
          if (payload.new.status_changed_at) {
            setStatusChangedAt(new Date(payload.new.status_changed_at))
          }
        }
      )
      .subscribe()

    // Poll every 30 seconds
    const pollInterval = setInterval(() => loadJob(), 30000)

    return () => {
      supabase.removeChannel(channel)
      clearInterval(pollInterval)
    }
  }, [params.token, loadJob, supabase])

  // Generate activity log when data changes
  useEffect(() => {
    if (job && jobEvents) {
      setActivityLog(generateActivityLog(
        job.status_changed_at,
        pageViews,
        jobEvents
      ))
    }
  }, [job, jobEvents, pageViews])

  const handleManualRefresh = () => loadJob(true)

  const formatLastUpdated = () => {
    const now = new Date()
    const diffMs = now.getTime() - lastUpdated.getTime()
    const diffSecs = Math.floor(diffMs / 1000)
    if (diffSecs < 10) return 'Just now'
    if (diffSecs < 60) return `${diffSecs} seconds ago`
    const diffMins = Math.floor(diffSecs / 60)
    if (diffMins === 1) return '1 minute ago'
    if (diffMins < 60) return `${diffMins} minutes ago`
    return lastUpdated.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
  }

  const formatTimeSince = (date: Date | null) => {
    if (!date) return 'Unknown'
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 1000 / 60)
    const diffHours = Math.floor(diffMins / 60)
    const diffDays = Math.floor(diffHours / 24)
    if (diffMins < 1) return 'Just now'
    if (diffMins === 1) return '1 minute ago'
    if (diffMins < 60) return `${diffMins} minutes ago`
    if (diffHours === 1) return '1 hour ago'
    if (diffHours < 24) return `${diffHours} hours ago`
    if (diffDays === 1) return '1 day ago'
    return `${diffDays} days ago`
  }

  const formatActivityTime = (timestamp: string) => {
    const d = new Date(timestamp)
    const now = new Date()
    const isToday = d.toDateString() === now.toDateString()
    const yesterday = new Date(now)
    yesterday.setDate(yesterday.getDate() - 1)
    const isYesterday = d.toDateString() === yesterday.toDateString()

    const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
    if (isToday) return `${time} — Today`
    if (isYesterday) return `${time} — Yesterday`
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) + ` — ${time}`
  }

  const formatStageTimestamp = (timestamp: string | undefined) => {
    if (!timestamp) return null
    const d = new Date(timestamp)
    const now = new Date()
    const isToday = d.toDateString() === now.toDateString()
    const yesterday = new Date(now)
    yesterday.setDate(yesterday.getDate() - 1)
    const isYesterday = d.toDateString() === yesterday.toDateString()

    const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
    if (isToday) return `Today at ${time}`
    if (isYesterday) return `Yesterday at ${time}`
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) + ` at ${time}`
  }

  // Get a short description for each status step
  const getStatusDescription = (step: string): string => {
    const descriptions: Record<string, string> = {
      QUOTE_APPROVED: 'Your quote was approved and we booked your device in.',
      RECEIVED: 'We received your device and added it to our workshop queue.',
      DIAGNOSTIC: 'We examined your device to identify exactly what needs fixing.',
      AWAITING_DEPOSIT: 'We need a deposit to order the parts for your repair.',
      PARTS_ORDERED: 'Parts have been ordered and are on their way to us.',
      PARTS_ARRIVED: 'Parts have arrived and we are ready to start the repair.',
      IN_REPAIR: 'Your device is being repaired by our technician.',
      READY_TO_COLLECT: 'Your device is fully repaired and ready for collection.',
      COLLECTED: 'You collected your device. Thank you for choosing us!',
    }
    return descriptions[step] || ''
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    )
  }

  if (isExpired) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-primary/5 to-white dark:from-gray-900 dark:to-gray-800 flex items-center justify-center p-4">
        <div className="max-w-md mx-auto">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-8 text-center">
            <div className="w-16 h-16 bg-gray-100 dark:bg-gray-700 rounded-full flex items-center justify-center mx-auto mb-4">
              <Package className="h-8 w-8 text-gray-400" />
            </div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Tracking Link Expired</h1>
            <p className="text-gray-600 dark:text-gray-400 mb-6">
              This repair has been completed and the tracking link has expired for privacy and security.
            </p>
          </div>
          <a href="https://nfdr.uk/start-repair/" target="_blank" rel="noopener noreferrer"
            className="block mt-4 bg-gradient-to-r from-primary to-primary/90 hover:from-primary/90 hover:to-primary rounded-2xl shadow-lg p-6 text-center transition-all active:scale-95">
            <p className="text-white font-black text-xl mb-2">Need a Repair?</p>
            <p className="text-white/90 text-sm mb-3">Start a new repair request online</p>
            <span className="text-white font-bold">nfdr.uk</span>
          </a>
        </div>
      </div>
    )
  }

  if (!job) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-primary/5 to-white dark:from-gray-900 dark:to-gray-800 flex items-center justify-center p-4">
        <div className="max-w-md mx-auto">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-8 text-center">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Job Not Found</h1>
            <p className="text-gray-600 dark:text-gray-400">This tracking link is invalid or has expired.</p>
          </div>
          <a href="https://nfdr.uk/start-repair/" target="_blank" rel="noopener noreferrer"
            className="block mt-4 bg-gradient-to-r from-primary to-primary/90 hover:from-primary/90 hover:to-primary rounded-2xl shadow-lg p-6 text-center transition-all active:scale-95">
            <p className="text-white font-black text-xl mb-2">Need a Repair?</p>
            <p className="text-white/90 text-sm">Start a new repair request online</p>
          </a>
        </div>
      </div>
    )
  }

  // Calculate all the dynamic values
  const deviceType = getDeviceType(job.device_make, job.device_model)
  const estimate = getTurnaroundEstimate(job.device_make, job.device_model, job.issue, job.status)
  const hoursInStatus = statusChangedAt
    ? (new Date().getTime() - statusChangedAt.getTime()) / (1000 * 60 * 60)
    : 0
  const progressPercent = calculateProgressPercent(hoursInStatus, estimate)
  const repairAgreed = !!job.repair_agreed_at
  const reassuranceMessage = getReassuranceMessage(
    job.status,
    visitFrequency.tier as any,
    hoursInStatus,
    estimate,
    repairAgreed
  )
  const deviceDesc = getDeviceDescription(job.device_make, job.device_model)

  // Build status steps
  const buildStatusSteps = () => {
    const steps: string[] = []
    if (job.source !== 'staff_manual') steps.push('QUOTE_APPROVED')
    steps.push('RECEIVED')
    // Show DIAGNOSTIC step if the job has been through it or is currently in it
    if (job.status === 'DIAGNOSTIC' || job.diagnosis_notes || job.diagnostic_report) {
      steps.push('DIAGNOSTIC')
    }
    const needsDepositStep = job.deposit_required || ['AWAITING_DEPOSIT'].includes(job.status) ||
      (job.status === 'DELAYED' && previousStatus && ['AWAITING_DEPOSIT'].includes(previousStatus))
    const needsPartsSteps = job.parts_required || ['PARTS_ORDERED', 'PARTS_ARRIVED'].includes(job.status) ||
      (job.status === 'DELAYED' && previousStatus && ['PARTS_ORDERED', 'PARTS_ARRIVED'].includes(previousStatus))
    if (needsDepositStep) steps.push('AWAITING_DEPOSIT')
    if (needsPartsSteps) { steps.push('PARTS_ORDERED'); steps.push('PARTS_ARRIVED') }
    steps.push('IN_REPAIR')
    steps.push('READY_TO_COLLECT')
    steps.push('COLLECTED')
    return steps
  }

  const statusSteps = buildStatusSteps()
  const getActualStepForDelayed = (): string => {
    if (previousStatus && statusSteps.includes(previousStatus)) return previousStatus
    if (job.parts_required || job.deposit_required) return 'PARTS_ORDERED'
    return 'IN_REPAIR'
  }
  const displayStatus = job.status === 'DELAYED' ? getActualStepForDelayed() : job.status
  const currentStepIndex = statusSteps.indexOf(displayStatus)

  // Show progress bar only for active repair stages
  const showProgressBar = ['IN_REPAIR', 'PARTS_ARRIVED', 'DIAGNOSTIC'].includes(job.status) ||
    (job.status === 'DIAGNOSTIC' && repairAgreed)

  // Show turnaround time for active stages
  const showTurnaround = ['RECEIVED', 'IN_REPAIR', 'PARTS_ARRIVED', 'DIAGNOSTIC'].includes(job.status)

  return (
    <div className="min-h-screen bg-gradient-to-b from-primary/5 to-white dark:from-gray-900 dark:to-gray-800">
      <header className="bg-white dark:bg-gray-800 shadow-sm">
        <div className="max-w-2xl mx-auto px-4 py-4 text-center">
          <h1 className="text-lg font-bold text-gray-900 dark:text-white">{SHOP_INFO.name}</h1>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-4">
        {/* Device Info */}
        <div className="bg-gradient-to-br from-gray-50 to-white rounded-2xl shadow-lg p-5 md:p-6 border-2 border-gray-100">
          <div className="flex items-center gap-4 md:gap-5">
            <div className="flex-shrink-0 w-16 h-16 md:w-20 md:h-20 bg-primary/10 rounded-2xl flex items-center justify-center">
              {getDeviceIcon(job.device_make, job.device_model)}
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="text-xl md:text-2xl font-black text-gray-900 dark:text-white leading-tight mb-1">
                {job.device_make || job.device_model ? `${job.device_make || ''} ${job.device_model || ''}`.trim() : 'Your Device'}
              </h1>
              <p className="text-base md:text-lg text-gray-700 dark:text-gray-400 font-medium">{job.issue || 'Your repair'}</p>
            </div>
          </div>
        </div>

        {/* Current Status — Clean and Scannable */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg border-2 border-gray-100 dark:border-gray-700">
          <button
            onClick={handleManualRefresh}
            disabled={isRefreshing}
            className="w-full p-5 md:p-6 text-left hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors disabled:cursor-wait"
          >
            {/* Status badge */}
            <div className="mb-3">
              <div className={`w-full py-3 md:py-4 rounded-xl font-black text-lg md:text-xl text-center ${JOB_STATUS_COLORS[job.status as keyof typeof JOB_STATUS_COLORS]} shadow-md`}>
                {JOB_STATUS_LABELS[job.status as keyof typeof JOB_STATUS_LABELS]}
                {repairAgreed && job.status === 'DIAGNOSTIC' && (
                  <span className="ml-2 text-sm font-bold bg-green-100 text-green-800 px-2 py-1 rounded-full">Agreed</span>
                )}
              </div>
            </div>

            {/* Turnaround time */}
            {showTurnaround && (
              <p className="text-sm text-gray-600 dark:text-gray-400 text-center mb-2">
                {estimate.display}
              </p>
            )}

            {/* Last checked */}
            <p className="text-xs text-gray-500 dark:text-gray-400 text-center mb-3">
              Last checked: {formatLastUpdated()}
            </p>

            {/* Progress bar */}
            {showProgressBar && (
              <div className="mb-4">
                <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2 overflow-hidden">
                  <div
                    className="bg-gradient-to-r from-primary to-primary/80 h-2 rounded-full transition-all duration-1000 ease-out"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
              </div>
            )}

            {/* Reassurance message — short, one or two lines */}
            <div className="bg-gradient-to-br from-primary/5 to-primary/10 border-2 border-primary/20 rounded-xl p-4 text-center">
              <p className="text-sm md:text-base text-gray-800 dark:text-gray-200 font-medium leading-relaxed">
                {reassuranceMessage}
              </p>
            </div>

            {/* Customer notes */}
            {job.customer_notes && (
              <div className="mt-4 p-4 bg-blue-50 dark:bg-blue-900/20 border-2 border-blue-200 dark:border-blue-800 rounded-xl">
                <div className="flex items-start gap-2">
                  <MessageSquare className="h-5 w-5 text-blue-600 mt-0.5 flex-shrink-0" />
                  <div className="flex-1">
                    <p className="font-semibold text-blue-900 dark:text-blue-200 text-sm mb-1">Update from us:</p>
                    <p className="text-blue-800 dark:text-blue-300 text-sm whitespace-pre-wrap">{job.customer_notes}</p>
                  </div>
                </div>
              </div>
            )}

            {/* Diagnosis results — toggle to show/hide */}
            {job.status === 'DIAGNOSTIC' && (job.diagnosis_notes || job.diagnostic_report) && (
              <div className="mt-3">
                <button
                  onClick={() => setShowDiagnosisResults(!showDiagnosisResults)}
                  className="w-full bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 rounded-xl p-3 flex items-center justify-between hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                >
                  <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">Diagnostic results</span>
                  {showDiagnosisResults ? <ChevronUp className="h-4 w-4 text-gray-500" /> : <ChevronDown className="h-4 w-4 text-gray-500" />}
                </button>
                {showDiagnosisResults && (
                  <div className="mt-2 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-xl border border-gray-200 dark:border-gray-600">
                    <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                      {job.diagnosis_notes || job.diagnostic_report}
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Parts tracking */}
            {job.status === 'PARTS_ORDERED' && job.show_tracking_to_customer && job.parts_tracking_status && (
              <div className="mt-4 bg-purple-50 dark:bg-purple-900/20 border-2 border-purple-200 dark:border-purple-800 rounded-xl p-3 text-center">
                <p className="text-sm text-purple-800 dark:text-purple-200 font-medium">
                  {job.parts_tracking_status === 'Delivered' ? 'Parts delivered' :
                   job.parts_tracking_status === 'OutForDelivery' ? 'Parts out for delivery today' :
                   job.parts_tracking_status === 'InTransit' ? 'Parts on the way' :
                   job.parts_tracking_status === 'InfoReceived' ? 'Parts order placed' :
                   `Parts status: ${job.parts_tracking_status}`}
                </p>
              </div>
            )}
          </button>

          {/* READY_TO_COLLECT — directions and I'm Here button */}
          {job.status === 'READY_TO_COLLECT' && (
            <div className="px-5 md:px-6 pb-5 space-y-3">
              <ImHereButton
                jobId={job.id}
                jobRef={job.job_ref}
                shopLatitude={shopCoordinates.latitude}
                shopLongitude={shopCoordinates.longitude}
                radiusMeters={shopCoordinates.radius}
              />
              <a href={SHOP_INFO.google_maps_link} target="_blank" rel="noopener noreferrer"
                className="block bg-gray-100 hover:bg-gray-200 text-gray-900 font-bold py-4 px-6 rounded-xl text-center transition-all shadow-md active:scale-95">
                <div className="flex items-center justify-center space-x-2">
                  <MapPin className="h-5 w-5" />
                  <span>Directions & Opening Hours</span>
                </div>
              </a>
            </div>
          )}
        </div>

        {/* Activity Log — Expandable */}
        {activityLog.length > 0 && (
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-md overflow-hidden">
            <button
              onClick={() => setShowActivityLog(!showActivityLog)}
              className="w-full p-5 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
            >
              <div className="flex items-center gap-3">
                <Clock className="h-5 w-5 text-primary flex-shrink-0" />
                <span className="font-bold text-gray-900 dark:text-white text-sm">Recent activity</span>
              </div>
              {showActivityLog ? <ChevronUp className="h-5 w-5 text-gray-400" /> : <ChevronDown className="h-5 w-5 text-gray-400" />}
            </button>
            {showActivityLog && (
              <div className="px-5 pb-5 space-y-2 border-t border-gray-100 dark:border-gray-700 pt-4">
                {activityLog.map((entry, i) => (
                  <div key={i} className="flex items-start gap-3">
                    <div className={`flex-shrink-0 w-2 h-2 rounded-full mt-1.5 ${entry.isStatusChange ? 'bg-green-500' : 'bg-gray-300'}`} />
                    <div className="flex-1">
                      <p className={`text-sm ${entry.isStatusChange ? 'font-semibold text-gray-900 dark:text-white' : 'text-gray-600 dark:text-gray-400'}`}>
                        {entry.label}
                      </p>
                      <p className="text-xs text-gray-400 dark:text-gray-500">{formatActivityTime(entry.timestamp)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Repair Journey — simple, clear, mobile-first */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg border-2 border-gray-100 dark:border-gray-700 overflow-hidden">
          <div className="p-5">
            <h2 className="font-bold text-base text-gray-900 dark:text-white mb-4">
              Your Repair Journey
            </h2>

            {/* Simple timeline */}
            <div className="space-y-0">
              {statusSteps.map((step, index) => {
                const isCurrent = step === displayStatus
                const isCompleted = currentStepIndex >= 0 ? index < currentStepIndex : false
                const isDelayed = job.status === 'DELAYED' && step === displayStatus
                const stageTimestamp = statusTimestamps[step]
                const isLast = index === statusSteps.length - 1
                const hasContent = isCompleted || isCurrent
                const isExpanded = expandedStep === index

                return (
                  <div key={step} className="flex items-stretch">
                    {/* Left: circle + line */}
                    <div className="flex flex-col items-center mr-3">
                      <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${
                        isCompleted ? 'bg-green-500' :
                        isCurrent ? (isDelayed ? 'bg-red-500' : 'bg-primary') :
                        'bg-gray-200 dark:bg-gray-600'
                      }`}>
                        {isCompleted ? (
                          <CheckCircle className="h-4 w-4 text-white" />
                        ) : isCurrent ? (
                          <div className="w-2.5 h-2.5 bg-white rounded-full animate-pulse" />
                        ) : (
                          <div className="w-2 h-2 bg-gray-400 dark:bg-gray-500 rounded-full" />
                        )}
                      </div>
                      {!isLast && (
                        <div className={`w-0.5 flex-1 my-1 ${isCompleted ? 'bg-green-400' : 'bg-gray-200 dark:bg-gray-700'}`} />
                      )}
                    </div>

                    {/* Right: label + time — clickable if has content */}
                    <button
                      onClick={() => hasContent ? setExpandedStep(isExpanded ? null : index) : undefined}
                      className={`flex-1 pb-4 pt-0.5 text-left ${hasContent ? 'cursor-pointer' : 'cursor-default'}`}
                    >
                      <p className={`text-sm font-semibold ${
                        isCurrent ? (isDelayed ? 'text-red-600' : 'text-primary') :
                        isCompleted ? 'text-green-600 dark:text-green-400' :
                        'text-gray-400 dark:text-gray-500'
                      }`}>
                        {JOB_STATUS_LABELS[step as keyof typeof JOB_STATUS_LABELS]}
                        {hasContent && (
                          <span className="ml-1 inline-block">
                            {isExpanded ? <ChevronUp className="h-3 w-3 inline" /> : <ChevronDown className="h-3 w-3 inline" />}
                          </span>
                        )}
                      </p>
                      {isCurrent && (
                        <p className="text-xs text-primary font-medium mt-0.5">
                          {formatTimeSince(statusChangedAt)}
                        </p>
                      )}
                      {isCompleted && stageTimestamp && !isExpanded && (
                        <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                          {formatStageTimestamp(stageTimestamp)}
                        </p>
                      )}
                      {repairAgreed && step === 'DIAGNOSTIC' && isCurrent && (
                        <p className="text-xs text-green-600 dark:text-green-400 mt-0.5">
                          ✓ You agreed to go ahead
                        </p>
                      )}
                      {/* Expanded content — just a one-line description */}
                      {isExpanded && hasContent && (
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                          {getStatusDescription(step)}
                        </p>
                      )}
                    </button>
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        {/* QR Code — Expandable */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-md overflow-hidden">
          <button onClick={() => setShowQRCode(!showQRCode)}
            className="w-full p-5 flex items-center justify-between hover:bg-gray-50 transition-colors">
            <div className="flex items-center">
              <QrCode className="h-6 w-6 text-primary mr-3" />
              <span className="font-bold text-gray-900">Collection QR Code</span>
            </div>
            {showQRCode ? <ChevronUp className="h-5 w-5 text-gray-400" /> : <ChevronDown className="h-5 w-5 text-gray-400" />}
          </button>
          {showQRCode && (
            <div className="px-6 pb-6 text-center border-t border-gray-100">
              <p className="text-sm text-gray-600 mb-4 mt-4">Show this code when collecting your device</p>
              <div className="flex justify-center mb-4">
                <div className="bg-white p-4 rounded-xl shadow-inner border-2 border-gray-100">
                  <QRCodeDisplay value={shortTrackingLink(params.token)} size={200} />
                </div>
              </div>
              <p className="text-xs text-gray-500">Save this page or take a screenshot for easy access</p>
            </div>
          )}
        </div>

        {/* Bottom section — Your repair is in safe hands */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg overflow-hidden">
          <div className="p-5 md:p-6">
            <h2 className="font-bold text-lg text-gray-900 dark:text-white mb-3 text-center">
              Your repair is in safe hands
            </h2>
            <p className="text-sm text-gray-600 dark:text-gray-400 text-center mb-2">
              This page is always updated first — the moment anything changes, it shows here.
            </p>
            <p className="text-sm text-gray-600 dark:text-gray-400 text-center mb-4">
              We&apos;ll text you when your device is ready to collect.
            </p>
            <div className="flex flex-col gap-2">
              <a href={SHOP_INFO.google_maps_link} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-3 bg-gray-50 dark:bg-gray-700 rounded-xl p-4 transition-all active:scale-95 hover:bg-gray-100 dark:hover:bg-gray-600">
                <MapPin className="h-5 w-5 text-primary flex-shrink-0" />
                <div>
                  <p className="font-bold text-gray-900 dark:text-white text-sm">Directions & Opening Hours</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">View on Google Maps</p>
                </div>
              </a>
              <a href={`sms:${SHOP_INFO.phone}`}
                className="flex items-center gap-3 bg-gray-50 dark:bg-gray-700 rounded-xl p-4 transition-all active:scale-95 hover:bg-gray-100 dark:hover:bg-gray-600">
                <MessageSquare className="h-5 w-5 text-primary flex-shrink-0" />
                <div>
                  <p className="font-bold text-gray-900 dark:text-white text-sm">Have a question? Text us</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">We&apos;ll check your repair and get back to you</p>
                </div>
              </a>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
