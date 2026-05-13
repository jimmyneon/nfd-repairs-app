'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { Job } from '@/lib/types-v3'
import { Search, Bell, QrCode, MessageSquare, Settings, Plus, Shield, History, ChevronDown, Flame, Zap, Clock, CheckCircle, Package, Mail } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import NotificationSetup from '@/components/NotificationSetup'
import QRScanner from '@/components/QRScanner'
import EnhancedJobTile from '@/components/EnhancedJobTile'
import CustomerWaitingBanner from '@/components/CustomerWaitingBanner'
import { groupJobsByAction, enrichJobWithMetrics, JobWithMetrics, ActionGroup } from '@/lib/job-utils'

export default function JobsListPageV2() {
  const [jobs, setJobs] = useState<Job[]>([])
  const [groupedJobs, setGroupedJobs] = useState<Record<ActionGroup, JobWithMetrics[]>>({
    URGENT: [],
    READY_TO_WORK: [],
    WAITING: [],
    READY_TO_COLLECT: [],
    COLLECTED: [],
    OTHER: []
  })
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [unreadCount, setUnreadCount] = useState(0)
  const [warrantyCount, setWarrantyCount] = useState(0)
  const [showScanner, setShowScanner] = useState(false)
  const [showCollected, setShowCollected] = useState(false)
  const [showAllJobs, setShowAllJobs] = useState(false)
  const [showAllJobsFlat, setShowAllJobsFlat] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  const handleQRScan = (jobRef: string) => {
    setSearchTerm(jobRef)
    setShowScanner(false)
  }

  useEffect(() => {
    loadJobs()
    loadUnreadNotifications()
    loadWarrantyTickets()

    const jobsSubscription = supabase
      .channel('jobs-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'jobs' }, () => {
        loadJobs()
      })
      .subscribe()

    const notificationsSubscription = supabase
      .channel('notifications-changes')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications' }, () => {
        loadUnreadNotifications()
      })
      .subscribe()

    const warrantySubscription = supabase
      .channel('warranty-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'warranty_tickets' }, () => {
        loadWarrantyTickets()
      })
      .subscribe()

    return () => {
      jobsSubscription.unsubscribe()
      notificationsSubscription.unsubscribe()
      warrantySubscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    loadJobs()
  }, [showAllJobs])

  useEffect(() => {
    // Filter jobs by search term
    let filtered = jobs
    
    if (searchTerm) {
      const search = searchTerm.toLowerCase()
      filtered = filtered.filter(job =>
        job.job_ref.toLowerCase().includes(search) ||
        job.customer_name.toLowerCase().includes(search) ||
        job.customer_phone.toLowerCase().includes(search) ||
        job.device_make.toLowerCase().includes(search) ||
        job.device_model.toLowerCase().includes(search) ||
        job.issue.toLowerCase().includes(search) ||
        (job.description && job.description.toLowerCase().includes(search))
      )
    }

    // Group filtered jobs by action
    const grouped = groupJobsByAction(filtered)
    setGroupedJobs(grouped)
  }, [jobs, searchTerm])

  const loadJobs = async () => {
    const query = supabase
      .from('jobs')
      .select('*')

    if (!showAllJobs) {
      query.not('status', 'in', '("COMPLETED","CANCELLED")')
    }

    const { data, error } = await query

    if (!error && data) {
      setJobs(data)
    }
    setLoading(false)
  }

  const loadUnreadNotifications = async () => {
    const { count } = await supabase
      .from('notifications')
      .select('*', { count: 'exact', head: true })
      .eq('is_read', false)

    setUnreadCount(count || 0)
  }

  const loadWarrantyTickets = async () => {
    const { count } = await supabase
      .from('warranty_tickets')
      .select('*', { count: 'exact', head: true })
      .in('status', ['NEW', 'NEEDS_ATTENTION'])

    setWarrantyCount(count || 0)
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  // Action group display configuration
  const actionGroupConfig = {
    URGENT: {
      title: 'Urgent / Today',
      icon: Flame,
      color: 'text-red-600',
      bgColor: 'bg-red-50',
      borderColor: 'border-red-200',
      description: 'Customer arrivals, high priority, or overdue jobs'
    },
    READY_TO_WORK: {
      title: 'Ready to Work',
      icon: Zap,
      color: 'text-orange-600',
      bgColor: 'bg-orange-50',
      borderColor: 'border-orange-200',
      description: 'Can be worked on right now'
    },
    WAITING: {
      title: 'Waiting',
      icon: Clock,
      color: 'text-blue-600',
      bgColor: 'bg-blue-50',
      borderColor: 'border-blue-200',
      description: 'Blocked by parts, deposit, or customer'
    },
    READY_TO_COLLECT: {
      title: 'Ready to Collect',
      icon: CheckCircle,
      color: 'text-green-600',
      bgColor: 'bg-green-50',
      borderColor: 'border-green-200',
      description: 'Waiting for customer pickup'
    },
    COLLECTED: {
      title: 'Collected',
      icon: Package,
      color: 'text-gray-600',
      bgColor: 'bg-gray-50',
      borderColor: 'border-gray-200',
      description: 'Waiting for auto-close'
    },
    OTHER: {
      title: 'Other',
      icon: ChevronDown,
      color: 'text-purple-600',
      bgColor: 'bg-purple-50',
      borderColor: 'border-purple-200',
      description: 'Jobs in other statuses'
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <NotificationSetup />
      {showScanner && (
        <QRScanner 
          onClose={() => setShowScanner(false)}
          onScan={handleQRScan}
        />
      )}
      
      {/* Customer Waiting Banner - Shows when customer has arrived */}
      <CustomerWaitingBanner jobs={jobs} />
      
      <header className="bg-white dark:bg-gray-800 shadow-sm sticky top-0 z-10">
        <div className="px-4 py-3">
          <div className="flex items-center justify-between mb-3">
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">Repair Jobs</h1>
            <div className="flex items-center space-x-3">
              <button
                onClick={() => setShowAllJobs(!showAllJobs)}
                className={`px-3 py-1 rounded-lg text-sm font-semibold transition-colors ${
                  showAllJobs
                    ? 'bg-primary text-white'
                    : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                }`}
                title={showAllJobs ? 'Show active jobs only' : 'Show all jobs including completed/cancelled'}
              >
                {showAllJobs ? 'All Jobs' : 'Active Only'}
              </button>
              <Link href="/app/jobs/create" className="text-gray-600 hover:text-primary" title="Create New Job">
                <Plus className="h-6 w-6" />
              </Link>
              <Link href="/app/history" className="text-gray-600 hover:text-primary" title="Job History">
                <History className="h-6 w-6" />
              </Link>
              <Link href="/app/enquiries" className="text-gray-600 hover:text-primary" title="Enquiries">
                <Mail className="h-6 w-6" />
              </Link>
              <Link href="/app/warranty" className="relative text-gray-600 hover:text-primary" title="Warranty Tickets">
                <Shield className="h-6 w-6" />
                {warrantyCount > 0 && (
                  <span className="absolute -top-1 -right-1 bg-orange-500 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center">
                    {warrantyCount}
                  </span>
                )}
              </Link>
              <Link href="/app/templates" className="text-gray-600 hover:text-primary">
                <MessageSquare className="h-6 w-6" />
              </Link>
              <Link href="/app/notifications" className="relative text-gray-600 hover:text-primary">
                <Bell className="h-6 w-6" />
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center">
                    {unreadCount}
                  </span>
                )}
              </Link>
              <Link href="/app/settings" className="text-gray-600 hover:text-primary">
                <Settings className="h-6 w-6" />
              </Link>
            </div>
          </div>

          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
              <input
                type="text"
                placeholder="Search by job ref, name, phone..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full h-14 pl-10 pr-4 border border-gray-300 dark:border-gray-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              />
            </div>
            <button
              onClick={() => setShowScanner(!showScanner)}
              className="flex-shrink-0 w-14 h-14 bg-primary hover:bg-primary-dark text-white rounded-xl flex items-center justify-center transition-colors shadow-md"
              title="Scan QR Code"
            >
              <QrCode className="h-6 w-6" />
            </button>
          </div>
        </div>
      </header>

      <main className="p-4 space-y-6">
        {loading ? (
          <div className="text-center py-12">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        ) : (
          <>
            {/* URGENT Section */}
            {groupedJobs.URGENT.length > 0 && (
              <section>
                <div className={`flex items-center gap-2 mb-3 p-3 rounded-xl ${actionGroupConfig.URGENT.bgColor} border-2 ${actionGroupConfig.URGENT.borderColor}`}>
                  <actionGroupConfig.URGENT.icon className={`h-6 w-6 ${actionGroupConfig.URGENT.color}`} />
                  <div className="flex-1">
                    <h2 className={`font-black text-lg ${actionGroupConfig.URGENT.color}`}>
                      {actionGroupConfig.URGENT.title} ({groupedJobs.URGENT.length})
                    </h2>
                    <p className="text-xs text-gray-600">{actionGroupConfig.URGENT.description}</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {groupedJobs.URGENT.map(job => (
                    <EnhancedJobTile key={job.id} job={job} />
                  ))}
                </div>
              </section>
            )}

            {/* READY TO WORK Section */}
            {groupedJobs.READY_TO_WORK.length > 0 && (
              <section>
                <div className={`flex items-center gap-2 mb-3 p-3 rounded-xl ${actionGroupConfig.READY_TO_WORK.bgColor} border-2 ${actionGroupConfig.READY_TO_WORK.borderColor}`}>
                  <actionGroupConfig.READY_TO_WORK.icon className={`h-6 w-6 ${actionGroupConfig.READY_TO_WORK.color}`} />
                  <div className="flex-1">
                    <h2 className={`font-black text-lg ${actionGroupConfig.READY_TO_WORK.color}`}>
                      {actionGroupConfig.READY_TO_WORK.title} ({groupedJobs.READY_TO_WORK.length})
                    </h2>
                    <p className="text-xs text-gray-600">{actionGroupConfig.READY_TO_WORK.description}</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {groupedJobs.READY_TO_WORK.map(job => (
                    <EnhancedJobTile key={job.id} job={job} />
                  ))}
                </div>
              </section>
            )}

            {/* WAITING Section */}
            {groupedJobs.WAITING.length > 0 && (
              <section>
                <div className={`flex items-center gap-2 mb-3 p-3 rounded-xl ${actionGroupConfig.WAITING.bgColor} border-2 ${actionGroupConfig.WAITING.borderColor}`}>
                  <actionGroupConfig.WAITING.icon className={`h-6 w-6 ${actionGroupConfig.WAITING.color}`} />
                  <div className="flex-1">
                    <h2 className={`font-black text-lg ${actionGroupConfig.WAITING.color}`}>
                      {actionGroupConfig.WAITING.title} ({groupedJobs.WAITING.length})
                    </h2>
                    <p className="text-xs text-gray-600">{actionGroupConfig.WAITING.description}</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {groupedJobs.WAITING.map(job => (
                    <EnhancedJobTile key={job.id} job={job} />
                  ))}
                </div>
              </section>
            )}

            {/* READY TO COLLECT Section */}
            {groupedJobs.READY_TO_COLLECT.length > 0 && (
              <section>
                <div className={`flex items-center gap-2 mb-3 p-3 rounded-xl ${actionGroupConfig.READY_TO_COLLECT.bgColor} border-2 ${actionGroupConfig.READY_TO_COLLECT.borderColor}`}>
                  <actionGroupConfig.READY_TO_COLLECT.icon className={`h-6 w-6 ${actionGroupConfig.READY_TO_COLLECT.color}`} />
                  <div className="flex-1">
                    <h2 className={`font-black text-lg ${actionGroupConfig.READY_TO_COLLECT.color}`}>
                      {actionGroupConfig.READY_TO_COLLECT.title} ({groupedJobs.READY_TO_COLLECT.length})
                    </h2>
                    <p className="text-xs text-gray-600">{actionGroupConfig.READY_TO_COLLECT.description}</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {groupedJobs.READY_TO_COLLECT.map(job => (
                    <EnhancedJobTile key={job.id} job={job} />
                  ))}
                </div>
              </section>
            )}

            {/* COLLECTED Section - Collapsed by default */}
            {groupedJobs.COLLECTED.length > 0 && (
              <section>
                <button
                  onClick={() => setShowCollected(!showCollected)}
                  className="w-full bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 px-4 py-3 rounded-xl font-bold hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors flex items-center justify-between"
                >
                  <div className="flex items-center gap-2">
                    <Package className="h-5 w-5" />
                    <span>Collected Jobs ({groupedJobs.COLLECTED.length})</span>
                  </div>
                  <ChevronDown className={`h-5 w-5 transition-transform ${showCollected ? 'rotate-180' : ''}`} />
                </button>

                {showCollected && (
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mt-3">
                    {groupedJobs.COLLECTED.map(job => (
                      <EnhancedJobTile key={job.id} job={job} />
                    ))}
                  </div>
                )}
              </section>
            )}

            {/* OTHER Section */}
            {groupedJobs.OTHER.length > 0 && (
              <section>
                <div className={`flex items-center gap-2 mb-3 p-3 rounded-xl ${actionGroupConfig.OTHER.bgColor} border-2 ${actionGroupConfig.OTHER.borderColor}`}>
                  <actionGroupConfig.OTHER.icon className={`h-6 w-6 ${actionGroupConfig.OTHER.color}`} />
                  <div className="flex-1">
                    <h2 className={`font-black text-lg ${actionGroupConfig.OTHER.color}`}>
                      {actionGroupConfig.OTHER.title} ({groupedJobs.OTHER.length})
                    </h2>
                    <p className="text-xs text-gray-600">{actionGroupConfig.OTHER.description}</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {groupedJobs.OTHER.map(job => (
                    <EnhancedJobTile key={job.id} job={job} />
                  ))}
                </div>
              </section>
            )}

            {/* ALL JOBS Fallback - Always available at bottom */}
            <section className="border-t-2 border-gray-300 dark:border-gray-600 pt-6 mt-6">
              <button
                onClick={() => setShowAllJobsFlat(!showAllJobsFlat)}
                className="w-full bg-gray-800 dark:bg-gray-700 text-white px-4 py-3 rounded-xl font-bold hover:bg-gray-700 dark:hover:bg-gray-600 transition-colors flex items-center justify-between"
              >
                <div className="flex items-center gap-2">
                  <History className="h-5 w-5" />
                  <span>All Jobs ({jobs.length}) - Fallback View</span>
                </div>
                <ChevronDown className={`h-5 w-5 transition-transform ${showAllJobsFlat ? 'rotate-180' : ''}`} />
              </button>

              {showAllJobsFlat && (
                <div className="mt-3">
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
                    Shows all jobs regardless of status or grouping
                  </p>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    {jobs.map(job => {
                      const enriched = enrichJobWithMetrics(job)
                      return <EnhancedJobTile key={job.id} job={enriched} />
                    })}
                  </div>
                </div>
              )}
            </section>

            {/* Empty state */}
            {Object.values(groupedJobs).every(group => group.length === 0) && (
              <div className="text-center py-12">
                <p className="text-gray-500">No jobs found</p>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  )
}
