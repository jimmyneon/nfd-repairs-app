'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { Job } from '@/lib/types'
import { JOB_STATUS_LABELS, JOB_STATUS_COLORS, SHOP_INFO } from '@/lib/constants'
import { Package, Clock, CheckCircle, MapPin, Phone, Mail, QrCode, ChevronDown, ChevronUp, Smartphone, Laptop, Tablet, Monitor, Gamepad2, Watch, AlertCircle } from 'lucide-react'
import QRCodeDisplay from '@/components/QRCodeDisplay'

export default function TrackingPage({ params }: { params: { token: string } }) {
  const [job, setJob] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [showQRCode, setShowQRCode] = useState(false)
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date())
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [showStatusInfo, setShowStatusInfo] = useState(false)
  const [statusChangedAt, setStatusChangedAt] = useState<Date | null>(null)
  const supabase = createClient()

  const getDeviceIcon = (deviceMake: string, deviceModel: string) => {
    const combined = `${deviceMake} ${deviceModel}`.toLowerCase()
    
    // Mobile phones
    if (combined.includes('iphone') || combined.includes('samsung') || 
        combined.includes('pixel') || combined.includes('oneplus') ||
        combined.includes('huawei') || combined.includes('xiaomi') ||
        combined.includes('motorola') || combined.includes('nokia') ||
        combined.includes('phone')) {
      return <Smartphone className="h-20 w-20 md:h-24 md:w-24 text-primary" />
    }
    
    // Tablets
    if (combined.includes('ipad') || combined.includes('tablet') ||
        combined.includes('tab ')) {
      return <Tablet className="h-20 w-20 md:h-24 md:w-24 text-primary" />
    }
    
    // Laptops
    if (combined.includes('macbook') || combined.includes('laptop') ||
        combined.includes('notebook') || combined.includes('chromebook')) {
      return <Laptop className="h-20 w-20 md:h-24 md:w-24 text-primary" />
    }
    
    // Gaming consoles
    if (combined.includes('playstation') || combined.includes('xbox') ||
        combined.includes('nintendo') || combined.includes('switch') ||
        combined.includes('ps4') || combined.includes('ps5')) {
      return <Gamepad2 className="h-20 w-20 md:h-24 md:w-24 text-primary" />
    }
    
    // Watches
    if (combined.includes('watch') || combined.includes('fitbit')) {
      return <Watch className="h-20 w-20 md:h-24 md:w-24 text-primary" />
    }
    
    // Desktop/Monitor
    if (combined.includes('imac') || combined.includes('desktop') ||
        combined.includes('monitor')) {
      return <Monitor className="h-20 w-20 md:h-24 md:w-24 text-primary" />
    }
    
    // Default to smartphone
    return <Smartphone className="h-20 w-20 md:h-24 md:w-24 text-primary" />
  }

  useEffect(() => {
    loadJob()

    // Set up real-time subscription for job updates
    const channel = supabase
      .channel('job-tracking')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'jobs',
          filter: `tracking_token=eq.${params.token}`
        },
        (payload) => {
          console.log('Job updated in real-time:', payload)
          setJob(payload.new)
          setLastUpdated(new Date())
        }
      )
      .subscribe()

    // Also poll every 30 seconds as backup
    const pollInterval = setInterval(() => {
      loadJob()
    }, 30000)

    // Re-render every second to update "Last Updated" timestamp
    const renderInterval = setInterval(() => {
      setLastUpdated(prev => prev) // Trigger re-render
    }, 1000)

    return () => {
      supabase.removeChannel(channel)
      clearInterval(pollInterval)
      clearInterval(renderInterval)
    }
  }, [params.token])

  const loadJob = async (showSpinner = false) => {
    if (showSpinner) setIsRefreshing(true)
    
    const { data } = await supabase
      .from('jobs')
      .select('id, job_ref, status, device_make, device_model, issue, description, created_at, parts_required, deposit_required, source, delay_reason, delay_notes, cancellation_reason, cancellation_notes')
      .eq('tracking_token', params.token)
      .single()

    if (data) {
      setJob(data)
      setLastUpdated(new Date())
      
      // Get most recent status change event
      const { data: events } = await supabase
        .from('job_events')
        .select('created_at')
        .eq('job_id', data.id)
        .eq('type', 'STATUS_CHANGE')
        .order('created_at', { ascending: false })
        .limit(1)
      
      if (events && events.length > 0) {
        setStatusChangedAt(new Date(events[0].created_at))
      } else {
        // If no status change events, use job creation date
        setStatusChangedAt(new Date(data.created_at))
      }
    }
    setLoading(false)
    
    if (showSpinner) {
      // Keep spinner visible for at least 800ms for visual feedback
      setTimeout(() => setIsRefreshing(false), 800)
    }
  }

  const handleManualRefresh = () => {
    loadJob(true)
  }

  const formatLastUpdated = () => {
    const now = new Date()
    const diffMs = now.getTime() - lastUpdated.getTime()
    const diffSecs = Math.floor(diffMs / 1000)
    const diffMins = Math.floor(diffSecs / 60)
    
    if (diffSecs < 10) return 'Just now'
    if (diffSecs < 60) return `${diffSecs} seconds ago`
    if (diffMins === 1) return '1 minute ago'
    if (diffMins < 60) return `${diffMins} minutes ago`
    
    return lastUpdated.toLocaleTimeString('en-GB', { 
      hour: '2-digit', 
      minute: '2-digit'
    })
  }

  const formatTimeSince = (date: Date | null) => {
    if (!date) return 'Unknown'
    
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 1000 / 60)
    const diffHours = Math.floor(diffMins / 60)
    const diffDays = Math.floor(diffHours / 24)
    
    if (diffMins < 60) return `${diffMins} minute${diffMins !== 1 ? 's' : ''} ago`
    if (diffHours < 24) return `${diffHours} hour${diffHours !== 1 ? 's' : ''} ago`
    if (diffDays === 1) return '1 day ago'
    return `${diffDays} days ago`
  }

  const getDeviceType = (deviceMake: string, deviceModel: string): 'phone' | 'tablet' | 'laptop' | 'console' | 'watch' | 'desktop' => {
    const combined = `${deviceMake} ${deviceModel}`.toLowerCase()
    
    if (combined.includes('iphone') || combined.includes('samsung') || combined.includes('pixel') || 
        combined.includes('oneplus') || combined.includes('huawei') || combined.includes('xiaomi') || 
        combined.includes('motorola') || combined.includes('nokia') || combined.includes('phone')) {
      return 'phone'
    }
    if (combined.includes('ipad') || combined.includes('tablet') || combined.includes('tab ')) {
      return 'tablet'
    }
    if (combined.includes('macbook') || combined.includes('laptop') || combined.includes('notebook') || combined.includes('chromebook')) {
      return 'laptop'
    }
    if (combined.includes('playstation') || combined.includes('xbox') || combined.includes('nintendo') || 
        combined.includes('switch') || combined.includes('ps4') || combined.includes('ps5')) {
      return 'console'
    }
    if (combined.includes('watch') || combined.includes('fitbit')) {
      return 'watch'
    }
    return 'desktop'
  }

  const getDynamicMessage = (status: string, deviceType: 'phone' | 'tablet' | 'laptop' | 'console' | 'watch' | 'desktop', hoursInStatus: number): string => {
    // RECEIVED status - device-aware and time-sensitive
    if (status === 'RECEIVED') {
      if (deviceType === 'phone' || deviceType === 'watch') {
        if (hoursInStatus < 2) return "Quick assessment in progress. Most phone/watch repairs are assessed within a few hours."
        if (hoursInStatus < 4) return "We're assessing your device. Update coming soon."
        if (hoursInStatus < 8) return "Assessment still in progress. We're working through our queue."
        if (hoursInStatus < 12) return "We're still working on your assessment. Complex issues sometimes need more time."
        return "We haven't forgotten about you! Detailed diagnostics in progress - update coming soon."
      }
      if (deviceType === 'tablet') {
        if (hoursInStatus < 4) return "Assessment in progress. Tablets typically assessed within 4-6 hours."
        if (hoursInStatus < 8) return "We're working on your assessment. Update coming soon."
        if (hoursInStatus < 12) return "Assessment still in progress. We're working through our queue."
        return "Detailed diagnostics needed. Update coming soon."
      }
      if (deviceType === 'laptop' || deviceType === 'desktop') {
        if (hoursInStatus < 6) return "Thorough assessment in progress. Laptops need detailed diagnostics."
        if (hoursInStatus < 12) return "We're working on your assessment. Complex devices take longer to diagnose."
        if (hoursInStatus < 24) return "Detailed diagnostics still in progress. Update coming soon."
        return "Complex assessment in progress. We'll update you as soon as we have more information."
      }
      if (deviceType === 'console') {
        if (hoursInStatus < 8) return "Detailed diagnostics in progress. Consoles require thorough testing."
        if (hoursInStatus < 16) return "We're working on your assessment. Complex devices need more detailed testing."
        if (hoursInStatus < 24) return "Thorough diagnostics still in progress. Update coming soon."
        return "Complex assessment in progress. We'll update you as soon as we have more information."
      }
    }

    // IN_REPAIR status - device-aware and time-sensitive
    if (status === 'IN_REPAIR') {
      if (deviceType === 'phone' || deviceType === 'watch') {
        if (hoursInStatus < 4) return "Repair in progress. Most phone/watch repairs completed within a few hours."
        if (hoursInStatus < 12) return "We're working on your repair. Should be ready soon."
        if (hoursInStatus < 24) return "Repair still in progress. Some issues take longer than expected."
        if (hoursInStatus < 48) return "Complex repair in progress. We'll notify you when it's ready."
        return "Your repair is taking longer than usual. We're working on it and will update you soon."
      }
      if (deviceType === 'tablet') {
        if (hoursInStatus < 8) return "Repair in progress. Tablet repairs typically take 6-12 hours."
        if (hoursInStatus < 24) return "We're working on your repair. Should be ready within a day."
        if (hoursInStatus < 48) return "Repair still in progress. Complex issues sometimes take longer."
        return "Complex repair in progress. We'll notify you when it's ready."
      }
      if (deviceType === 'laptop' || deviceType === 'desktop') {
        if (hoursInStatus < 12) return "Repair in progress. Laptop repairs typically take 1-2 days."
        if (hoursInStatus < 48) return "We're working on your repair. Complex devices need more time."
        if (hoursInStatus < 72) return "Repair still in progress. We'll notify you when it's ready."
        return "Complex repair in progress. We'll update you as soon as we have more information."
      }
      if (deviceType === 'console') {
        if (hoursInStatus < 24) return "Repair in progress. Console repairs typically take 1-3 days."
        if (hoursInStatus < 72) return "We're working on your repair. Complex devices need thorough work."
        return "Complex repair in progress. We'll notify you when it's ready."
      }
    }

    // Other statuses - time-sensitive only
    const statusMessages: Record<string, (hours: number) => string> = {
      QUOTE_APPROVED: (h) => h < 24 ? "Waiting for you to drop off your device. Bring it in when convenient." : h < 48 ? "We're ready for your device whenever you can drop it off." : "Still waiting for your device. Drop off at your convenience - we're ready!",
      AWAITING_DEPOSIT: (h) => h < 12 ? "We need a deposit to order parts for your repair. Check your messages for payment details." : h < 24 ? "Still waiting for deposit payment. We can order parts as soon as we receive it." : h < 48 ? "Deposit payment pending. We're ready to order parts once payment is received." : "We're still waiting for your deposit payment to proceed with ordering parts.",
      PARTS_ORDERED: (h) => h < 24 ? "Parts ordered! Delivery typically takes 2-3 days." : h < 48 ? "Parts are on their way. Should arrive within 1-2 days." : h < 72 ? "Parts should arrive soon. We'll notify you when they're here." : h < 96 ? "Parts delivery taking a bit longer than usual. We'll update you when they arrive." : "Parts are delayed but on their way. We'll start your repair as soon as they arrive.",
      PARTS_ARRIVED: (h) => h < 6 ? "Good news! Parts have arrived and we're ready to start your repair." : h < 12 ? "Parts are here. Your repair will begin shortly." : "Parts arrived. We're working through our queue - your repair will start soon.",
      READY_TO_COLLECT: (h) => h < 24 ? "Your device is ready! Collect at your convenience during opening hours." : h < 72 ? "Your device is still ready for collection whenever you're free." : h < 168 ? "We're holding your device ready for collection. Pick up when convenient." : "Your device is ready for collection. We'll hold it safely until you can pick it up.",
      COLLECTED: () => "Thanks for collecting your device! Hope everything's working perfectly.",
      COMPLETED: () => "Your repair is complete! Thanks for choosing New Forest Device Repairs.",
      DELAYED: () => job.delay_notes || "Your repair is experiencing a delay. We'll update you as soon as possible.",
      CANCELLED: () => job.cancellation_notes || "This repair has been cancelled. Contact us if you have any questions."
    }

    const messageFn = statusMessages[status]
    return messageFn ? messageFn(hoursInStatus) : "We're working on your repair and will keep you updated."
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    )
  }

  if (!job) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Job Not Found</h1>
          <p className="text-gray-600">This tracking link is invalid or has expired.</p>
        </div>
      </div>
    )
  }

  const getNextStepMessage = (status: string): string => {
    const messages: Record<string, string> = {
      QUOTE_APPROVED: 'Great! Your quote has been approved. Please bring your device in when it\'s convenient.',
      RECEIVED: 'We\'ve got your device and will take a look shortly.',
      AWAITING_DEPOSIT: 'We need a small deposit to order the parts. Check your messages for payment details.',
      PARTS_ORDERED: 'Parts are on order — we\'ll let you know as soon as they arrive.',
      PARTS_ARRIVED: 'Good news! The parts have arrived and we\'re ready to get started.',
      IN_REPAIR: 'Your device is being repaired right now. We\'ll message you when it\'s ready.',
      READY_TO_COLLECT: 'All done! Your device is ready to collect whenever you\'re free.',
      COLLECTED: 'Thanks for collecting your device. Hope everything\'s working perfectly!',
      COMPLETED: 'All finished! Thanks for trusting us with your repair.',
      DELAYED: job.delay_notes || 'There\'s a slight delay with your repair. We\'ll be in touch with more details soon.',
      CANCELLED: job.cancellation_notes || 'This repair has been cancelled. If you have any questions, just give us a shout.',
    }
    return messages[status] || 'We\'ll keep you updated every step of the way.'
  }

  // Determine status flow based on job source and parts requirement
  // Build dynamic status progression based on actual job data
  const buildStatusSteps = () => {
    const steps: string[] = []
    
    // API/Responder jobs start with QUOTE_APPROVED (customer needs to drop off)
    // Manual jobs start with RECEIVED (device already in shop)
    if (job.source !== 'staff_manual') {
      steps.push('QUOTE_APPROVED')
    }
    
    // All jobs go through RECEIVED when device is in shop
    steps.push('RECEIVED')
    
    // Only show parts-related steps if parts are actually required
    if (job.parts_required || job.deposit_required) {
      steps.push('AWAITING_DEPOSIT')
      steps.push('PARTS_ORDERED')
      steps.push('PARTS_ARRIVED')
    }
    
    // All jobs go through these final steps
    steps.push('IN_REPAIR')
    steps.push('READY_TO_COLLECT')
    steps.push('COLLECTED')
    // COMPLETED is admin-only, not shown to customers
    
    return steps
  }
  
  const statusSteps = buildStatusSteps()

  // If status is DELAYED, show IN_REPAIR as current step (DELAYED is a modifier, not a separate step)
  const displayStatus = job.status === 'DELAYED' ? 'IN_REPAIR' : job.status
  const currentStepIndex = statusSteps.indexOf(displayStatus)

  return (
    <div className="min-h-screen bg-gradient-to-b from-primary/5 to-white dark:from-gray-900 dark:to-gray-800">
      <header className="bg-white dark:bg-gray-800 shadow-sm">
        <div className="max-w-2xl mx-auto px-4 py-6 text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-primary/10 rounded-full mb-3">
            <Package className="h-8 w-8 text-primary" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">{SHOP_INFO.name}</h1>
          <p className="text-gray-600">Repair Tracking</p>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-4">
        {/* PRIMARY: Device Info - Most Important */}
        <div className="bg-gradient-to-br from-gray-50 to-white rounded-2xl shadow-lg p-5 md:p-6 border-2 border-gray-100">
          <div className="flex items-center gap-4 md:gap-5">
            <div className="flex-shrink-0 w-24 h-24 md:w-28 md:h-28 bg-primary/10 rounded-2xl flex items-center justify-center">
              {getDeviceIcon(job.device_make, job.device_model)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs md:text-sm text-gray-500 dark:text-gray-400 mb-1 md:mb-2">Your Device</p>
              <h1 className="text-2xl md:text-3xl font-black text-gray-900 dark:text-white">Track Your Repair</h1>
              <h2 className="text-2xl md:text-3xl font-black text-gray-900 dark:text-white mb-1 md:mb-2 leading-tight">
                {job.device_make} {job.device_model}
              </h2>
              <p className="text-base md:text-lg text-gray-700 dark:text-gray-400 font-medium">{job.issue}</p>
            </div>
          </div>
        </div>

        {/* PRIMARY: Current Status - Clean and Simple */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg border-2 border-gray-100 dark:border-gray-700">
          <button
            onClick={handleManualRefresh}
            disabled={isRefreshing}
            className="w-full p-5 md:p-6 text-left hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors disabled:cursor-wait"
          >
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs md:text-sm text-gray-500 dark:text-gray-400">Current Status</p>
              <svg 
                className={`h-4 w-4 text-gray-500 dark:text-gray-400 ${isRefreshing ? 'animate-spin' : ''}`}
                fill="none" 
                stroke="currentColor" 
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </div>
            
            {isRefreshing && (
              <div className="mb-3 flex items-center justify-center gap-2 text-primary animate-pulse">
                <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <span className="text-sm font-medium">Checking for updates...</span>
              </div>
            )}
            
            <div className="mb-4">
              <div className={`w-full py-3 md:py-4 rounded-xl font-black text-lg md:text-xl text-center ${JOB_STATUS_COLORS[job.status as keyof typeof JOB_STATUS_COLORS]} shadow-md transition-all ${isRefreshing ? 'opacity-50 scale-95' : 'opacity-100 scale-100'}`}>
                {JOB_STATUS_LABELS[job.status as keyof typeof JOB_STATUS_LABELS]}
              </div>
            </div>
            
            <div className="bg-gradient-to-br from-primary/5 to-primary/10 border-2 border-primary/20 rounded-xl p-4 text-center">
              <p className="text-sm md:text-base text-gray-800 dark:text-gray-200 font-medium leading-relaxed">{getNextStepMessage(job.status)}</p>
            </div>
          </button>
          
          {/* Show directions link for READY_TO_COLLECT status */}
          {job.status === 'READY_TO_COLLECT' && (
            <a
              href={SHOP_INFO.google_maps_link}
              target="_blank"
              rel="noopener noreferrer"
              className="block bg-primary hover:bg-primary-dark text-white font-bold py-4 px-6 rounded-xl text-center transition-all shadow-md active:scale-95 mt-4"
            >
              <div className="flex items-center justify-center space-x-2">
                <MapPin className="h-5 w-5" />
                <span>Get Directions & Opening Hours</span>
              </div>
            </a>
          )}
        </div>

        {/* PRIMARY: Repair Progress with Timeline & Info */}
        <div className="bg-gradient-to-br from-white to-gray-50 dark:from-gray-800 dark:to-gray-900 rounded-2xl shadow-lg border-2 border-gray-100 dark:border-gray-700 overflow-hidden">
          <div className="p-5 md:p-6">
            <h2 className="font-black text-lg md:text-xl text-gray-900 dark:text-white mb-4 md:mb-5 flex items-center">
              <Clock className="h-5 w-5 md:h-6 md:w-6 mr-2 text-primary" />
              Repair Progress
            </h2>
            <div className="space-y-4">
              {statusSteps.map((step, index) => {
                const isCurrent = step === displayStatus
                const isCompleted = index < currentStepIndex
                const isDelayed = job.status === 'DELAYED' && step === 'IN_REPAIR'

                return (
                  <div key={step} className="relative">
                    <div className="flex items-center">
                      <div className={`flex-shrink-0 w-12 h-12 rounded-full flex items-center justify-center transition-all ${
                        isCompleted ? 'bg-white border-2 border-green-500 text-green-600' :
                        isCurrent ? (isDelayed ? 'bg-red-600 text-white shadow-xl ring-4 ring-red-600/30 scale-110' : 'bg-primary text-white shadow-xl ring-4 ring-primary/30 scale-110') :
                        'bg-gray-200 text-gray-500 border-2 border-gray-300'
                      }`}>
                        {isCompleted ? (
                          <CheckCircle className="h-7 w-7" />
                        ) : (
                          <span className="text-base font-black">{index + 1}</span>
                        )}
                      </div>
                      <div className="ml-4 flex-1">
                        <p className={`text-sm font-semibold ${
                          isCurrent ? (isDelayed ? 'text-red-600' : 'text-primary') :
                          isCompleted ? 'text-green-600' :
                          'text-gray-400'
                        }`}>
                          {JOB_STATUS_LABELS[step as keyof typeof JOB_STATUS_LABELS]}
                          {isDelayed && (
                            <span className="ml-2 text-xs bg-red-100 text-red-800 px-2 py-1 rounded-full">Delayed</span>
                          )}
                        </p>
                      </div>
                    </div>
                    {index < statusSteps.length - 1 && (
                      <div className={`absolute left-6 top-12 w-0.5 h-4 ${
                        isCompleted ? 'bg-green-400' : 'bg-gray-300'
                      }`} />
                    )}
                  </div>
                )
              })}
            </div>
          </div>
          
          {/* Timeline Info & Expandable Section */}
          <button
            onClick={() => setShowStatusInfo(!showStatusInfo)}
            className="w-full px-5 md:px-6 py-3 border-t-2 border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
                <span className="flex items-center gap-1">
                  <Package className="h-3 w-3" />
                  Received {formatTimeSince(job.created_at ? new Date(job.created_at) : null)}
                </span>
                <span className="text-gray-300 dark:text-gray-600">•</span>
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  In status {formatTimeSince(statusChangedAt)}
                </span>
                <span className="text-gray-300 dark:text-gray-600">•</span>
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  Updated {formatLastUpdated()}
                </span>
              </div>
              {showStatusInfo ? (
                <ChevronUp className="h-4 w-4 text-primary" />
              ) : (
                <ChevronDown className="h-4 w-4 text-primary" />
              )}
            </div>
          </button>
          
          {showStatusInfo && (
            <div className="px-5 md:px-6 pb-5 pt-3 border-t border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/30">
              <h4 className="text-sm font-bold text-gray-900 dark:text-white mb-3">What does this mean?</h4>
              <div className="space-y-3 text-sm text-gray-700 dark:text-gray-300">
                {(() => {
                  const hoursInStatus = statusChangedAt 
                    ? (new Date().getTime() - statusChangedAt.getTime()) / (1000 * 60 * 60)
                    : 0
                  const deviceType = getDeviceType(job.device_make, job.device_model)
                  const dynamicMessage = getDynamicMessage(job.status, deviceType, hoursInStatus)
                  
                  return (
                    <>
                      <div className="flex items-start gap-2">
                        <CheckCircle className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                        <p>{dynamicMessage}</p>
                      </div>
                      
                      {job.status === 'DELAYED' && (job.delay_reason || job.delay_notes) && (
                        <div className="flex items-start gap-2 mt-3 p-3 bg-red-50 dark:bg-red-900/20 border-l-4 border-red-500 rounded">
                          <AlertCircle className="h-4 w-4 text-red-600 mt-0.5 flex-shrink-0" />
                          <div>
                            {job.delay_reason && (
                              <p className="font-semibold text-red-900 dark:text-red-200 text-sm mb-1">
                                Delay Reason: {job.delay_reason.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (l: string) => l.toUpperCase())}
                              </p>
                            )}
                            {job.delay_notes && (
                              <p className="text-red-800 dark:text-red-300 text-sm">{job.delay_notes}</p>
                            )}
                          </div>
                        </div>
                      )}
                      
                      {job.status === 'CANCELLED' && (job.cancellation_reason || job.cancellation_notes) && (
                        <div className="flex items-start gap-2 mt-3 p-3 bg-gray-50 dark:bg-gray-800/50 border-l-4 border-gray-500 rounded">
                          <AlertCircle className="h-4 w-4 text-gray-600 mt-0.5 flex-shrink-0" />
                          <div>
                            {job.cancellation_reason && (
                              <p className="font-semibold text-gray-900 dark:text-gray-200 text-sm mb-1">
                                Cancellation Reason: {job.cancellation_reason.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (l: string) => l.toUpperCase())}
                              </p>
                            )}
                            {job.cancellation_notes && (
                              <p className="text-gray-800 dark:text-gray-300 text-sm">{job.cancellation_notes}</p>
                            )}
                          </div>
                        </div>
                      )}
                      
                      {job.status === 'READY_TO_COLLECT' && (
                        <div className="flex items-start gap-2">
                          <MapPin className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                          <p>Check Google Maps for live opening times.</p>
                        </div>
                      )}
                      
                      <div className="pt-2 border-t border-gray-200 dark:border-gray-600">
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          <strong>Tip:</strong> This page updates automatically. Click the status area above to refresh manually.
                        </p>
                      </div>
                    </>
                  )
                })()}
              </div>
            </div>
          )}
        </div>

        {/* SECONDARY: QR Code - Expandable */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-md overflow-hidden">
          <button
            onClick={() => setShowQRCode(!showQRCode)}
            className="w-full p-5 flex items-center justify-between hover:bg-gray-50 transition-colors"
          >
            <div className="flex items-center">
              <QrCode className="h-6 w-6 text-primary mr-3" />
              <span className="font-bold text-gray-900">Collection QR Code</span>
            </div>
            {showQRCode ? (
              <ChevronUp className="h-5 w-5 text-gray-400" />
            ) : (
              <ChevronDown className="h-5 w-5 text-gray-400" />
            )}
          </button>
          {showQRCode && (
            <div className="px-6 pb-6 text-center border-t border-gray-100">
              <p className="text-sm text-gray-600 mb-4 mt-4">Show this code when collecting your device</p>
              <div className="flex justify-center mb-4">
                <div className="bg-white p-4 rounded-xl shadow-inner border-2 border-gray-100">
                  <QRCodeDisplay 
                    value={`${process.env.NEXT_PUBLIC_APP_URL}/t/${params.token}`} 
                    size={200} 
                  />
                </div>
              </div>
              <p className="text-xs text-gray-500">Save this page or take a screenshot for easy access</p>
            </div>
          )}
        </div>

        {/* SECONDARY: Website Link */}
        <a 
          href="https://www.newforestdevicerepairs.co.uk/start"
          target="_blank"
          rel="noopener noreferrer"
          className="block bg-gradient-to-r from-primary to-primary/90 hover:from-primary/90 hover:to-primary rounded-2xl shadow-lg p-6 text-center transition-all active:scale-95"
        >
          <p className="text-white font-black text-xl mb-2">Need Help?</p>
          <p className="text-white/90 text-sm mb-3">Visit our website for more information</p>
          <div className="inline-flex items-center text-white font-bold">
            <span>www.newforestdevicerepairs.co.uk/start</span>
          </div>
        </a>
      </main>

      <footer className="bg-gray-900 text-white mt-12">
        <div className="max-w-2xl mx-auto px-4 py-6 text-center text-sm text-gray-400">
          <p>© {new Date().getFullYear()} {SHOP_INFO.name}. All rights reserved.</p>
        </div>
      </footer>
    </div>
  )
}
