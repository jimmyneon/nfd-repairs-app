'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { Job, JobEvent, SMSLog, JobStatus } from '@/lib/types-v3'
import { JOB_STATUS_LABELS, JOB_STATUS_COLORS } from '@/lib/constants'
import { ArrowLeft, Clock, DollarSign, Package, CheckCircle, Wrench, AlertCircle, RefreshCw, Smartphone, Laptop, Tablet, Monitor, Gamepad2, Watch, Edit } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import ContactActions from '@/components/ContactActions'
import StatusChangeModal from '@/components/StatusChangeModal'
import StatusSelectorModal from '@/components/StatusSelectorModal'
import OnboardingGate from '@/components/OnboardingGate'
import ManualOnboardingModal from '@/components/ManualOnboardingModal'

export default function JobDetailPage({ params }: { params: { id: string } }) {
  const [job, setJob] = useState<Job | null>(null)
  const [events, setEvents] = useState<JobEvent[]>([])
  const [smsLogs, setSmsLogs] = useState<SMSLog[]>([])
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)
  const [showStatusModal, setShowStatusModal] = useState(false)
  const [showStatusSelector, setShowStatusSelector] = useState(false)
  const [showSimpleConfirm, setShowSimpleConfirm] = useState(false)
  const [showManualOnboarding, setShowManualOnboarding] = useState(false)
  const [newStatus, setNewStatus] = useState<JobStatus | null>(null)
  const [pendingWorkflowStatus, setPendingWorkflowStatus] = useState<JobStatus | null>(null)
  const router = useRouter()
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

    if (jobData) setJob(jobData)
    if (eventsData) setEvents(eventsData)
    if (smsData) setSmsLogs(smsData)
    setLoading(false)
  }

  // For manual status changes (from selector modal) - use triple confirmation
  const handleManualStatusChange = (status: JobStatus) => {
    setNewStatus(status)
    setShowStatusModal(true)
  }

  // For workflow status changes - use single confirmation
  const handleWorkflowStatusChange = (status: JobStatus) => {
    setPendingWorkflowStatus(status)
    setShowSimpleConfirm(true)
  }

  const confirmWorkflowStatusChange = async () => {
    if (!job || !pendingWorkflowStatus) return
    setActionLoading(true)
    setShowSimpleConfirm(false)

    const message = `Status changed to ${JOB_STATUS_LABELS[pendingWorkflowStatus]}`

    await supabase
      .from('jobs')
      .update({ status: pendingWorkflowStatus } as any)
      .eq('id', job.id)

    await supabase.from('job_events').insert({
      job_id: job.id,
      type: 'STATUS_CHANGE',
      message,
    })

    await supabase.from('notifications').insert({
      type: 'STATUS_UPDATE',
      title: `Job ${job.job_ref} updated`,
      body: message,
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
        console.error('Failed to send email:', error)
      }
    }

    await loadJobData()
    setActionLoading(false)
    setPendingWorkflowStatus(null)
  }

  const confirmStatusChange = async () => {
    if (!job || !newStatus) return
    setActionLoading(true)
    setShowStatusModal(false)

    const message = `Status changed to ${JOB_STATUS_LABELS[newStatus]}`

    await supabase
      .from('jobs')
      .update({ status: newStatus } as any)
      .eq('id', job.id)

    await supabase.from('job_events').insert({
      job_id: job.id,
      type: 'STATUS_CHANGE',
      message,
    })

    await supabase.from('notifications').insert({
      type: 'STATUS_UPDATE',
      title: `Job ${job.job_ref} updated`,
      body: message,
      job_id: job.id,
    })

    // Queue SMS for status change
    try {
      console.log('🔔 Queueing SMS for status:', newStatus)
      const response = await fetch('/api/jobs/queue-status-sms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jobId: job.id,
          status: newStatus,
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
        console.error('Failed to send email:', error)
      }
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
          <h2 className="text-lg font-bold text-gray-900 mb-4">Customer Contact</h2>
          <p className="text-sm text-gray-600 mb-3">Tap to call, text, or message</p>
          <ContactActions 
            phone={job.customer_phone} 
            name={job.customer_name}
          />
        </div>

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
            {job.status === 'RECEIVED' && (
              <button
                onClick={() => handleWorkflowStatusChange('IN_REPAIR')}
                disabled={actionLoading || !job.onboarding_completed}
                className="w-full bg-primary hover:bg-primary-dark text-white font-black py-6 px-6 rounded-2xl text-xl disabled:opacity-50 transition-all shadow-lg active:scale-95 flex items-center justify-center space-x-3"
              >
                <Wrench className="h-8 w-8" />
                <span>Start Repair</span>
              </button>
            )}
            
            {job.status === 'QUOTE_APPROVED' && (
              <button
                onClick={() => handleWorkflowStatusChange('DROPPED_OFF')}
                disabled={actionLoading}
                className="w-full bg-primary hover:bg-primary-dark text-white font-black py-6 px-6 rounded-2xl text-xl disabled:opacity-50 transition-all shadow-lg active:scale-95 flex items-center justify-center space-x-3"
              >
                <CheckCircle className="h-8 w-8" />
                <span>Device Dropped Off</span>
              </button>
            )}
            
            {job.status === 'DROPPED_OFF' && !job.parts_required && (
              <button
                onClick={() => handleWorkflowStatusChange('IN_REPAIR')}
                disabled={actionLoading}
                className="w-full bg-primary hover:bg-primary-dark text-white font-black py-6 px-6 rounded-2xl text-xl disabled:opacity-50 transition-all shadow-lg active:scale-95 flex items-center justify-center space-x-3"
              >
                <Wrench className="h-8 w-8" />
                <span>Start Repair</span>
              </button>
            )}
            
            {job.status === 'DROPPED_OFF' && job.parts_required && (
              <button
                onClick={() => handleWorkflowStatusChange('AWAITING_DEPOSIT')}
                disabled={actionLoading}
                className="w-full bg-yellow-500 hover:bg-yellow-600 text-white font-black py-6 px-6 rounded-2xl text-xl disabled:opacity-50 transition-all shadow-lg active:scale-95 flex items-center justify-center space-x-3"
              >
                <DollarSign className="h-8 w-8" />
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
              <p className="text-gray-700 mb-6">
                Change status to <span className="font-bold text-primary">{JOB_STATUS_LABELS[pendingWorkflowStatus]}</span>?
              </p>
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
            willSendSMS={true}
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

        {smsLogs.length > 0 && (
          <div className="card">
            <h2 className="font-semibold text-gray-900 mb-3">SMS History</h2>
            <div className="space-y-2">
              {smsLogs.map((sms) => (
                <div key={sms.id} className="bg-gray-50 rounded p-2 text-sm">
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
                  <p className="text-gray-600 text-xs">{sms.body_rendered}</p>
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
          <div className="bg-gray-50 dark:bg-gray-700 p-2 rounded text-xs break-all text-gray-900 dark:text-white">
            https://nfd-repairs-app.vercel.app/t/{job.tracking_token}
          </div>
        </div>
      </main>
    </div>
  )
}
