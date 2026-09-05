'use client'

import { useEffect, useState, useRef } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { Job } from '@/lib/types-v3'
import { Search, QrCode, Plus, ChevronDown, Flame, Zap, Clock, CheckCircle, Package, Wrench, AlertTriangle, Archive, MapPin, BellRing } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import NotificationSetup from '@/components/NotificationSetup'
import QRScanner from '@/components/QRScanner'
import EnhancedJobTile from '@/components/EnhancedJobTile'
import CustomerWaitingBanner from '@/components/CustomerWaitingBanner'
import NavDropdown from '@/components/NavDropdown'
import { groupJobsByAction, JobWithMetrics, ActionGroup, getHoursInStatus } from '@/lib/job-utils'

export const dynamic = 'force-dynamic'

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
  const [activeFilter, setActiveFilter] = useState<string>('all')
  const [sendInCount, setSendInCount] = useState(0)
  const [enquiryCount, setEnquiryCount] = useState(0)
  const [approvedEnquiries, setApprovedEnquiries] = useState<{enquiry_ref: string; customer_name: string; device_make: string | null; device_model: string | null; quoted_price: number | null}[]>([])
  const reloadTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const router = useRouter()
  const supabase = createClient() as any

  const handleQRScan = (jobRef: string) => {
    setSearchTerm(jobRef)
    setShowScanner(false)
  }

  useEffect(() => {
    loadUnreadNotifications()
    loadWarrantyTickets()
    loadSendInCount()
    loadEnquiryCount()

    // Reload on bfcache restoration (back button) - show loading state during reload
    const handlePageShow = (event: PageTransitionEvent) => {
      if (event.persisted) {
        setLoading(true)
      }
      loadJobs()
      loadUnreadNotifications()
      loadWarrantyTickets()
      loadSendInCount()
      loadEnquiryCount()
    }
    window.addEventListener('pageshow', handlePageShow)

    const jobsSubscription = supabase
      .channel('jobs-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'jobs' }, () => {
        // Debounce: multiple changes often arrive in quick succession
        if (reloadTimer.current) clearTimeout(reloadTimer.current)
        reloadTimer.current = setTimeout(() => loadJobs(), 300)
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

    const enquiriesSubscription = supabase
      .channel('enquiries-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'enquiries' }, () => {
        loadEnquiryCount()
      })
      .subscribe()

    return () => {
      jobsSubscription.unsubscribe()
      notificationsSubscription.unsubscribe()
      warrantySubscription.unsubscribe()
      enquiriesSubscription.unsubscribe()
      window.removeEventListener('pageshow', handlePageShow)
    }
  }, [])

  useEffect(() => {
    loadJobs()
  }, [showAllJobs])

  useEffect(() => {
    // Filter jobs by search term and active filter
    let filtered = jobs
    
    if (searchTerm) {
      const search = searchTerm.toLowerCase()
      filtered = filtered.filter(job =>
        job.job_ref.toLowerCase().includes(search) ||
        job.customer_name.toLowerCase().includes(search) ||
        job.customer_phone.toLowerCase().includes(search) ||
        (job.device_make || '').toLowerCase().includes(search) ||
        (job.device_model || '').toLowerCase().includes(search) ||
        (job.issue || '').toLowerCase().includes(search) ||
        (job.description && job.description.toLowerCase().includes(search))
      )
    }

    // Apply quick filter
    if (activeFilter !== 'all') {
      filtered = filtered.filter(job => {
        switch (activeFilter) {
          case 'in_shop': return job.device_in_shop
          case 'needs_parts': return job.parts_required || job.requires_parts_order
          case 'overdue': return getHoursInStatus(job.status_changed_at, job.created_at) > 72
          case 'deposit': return job.deposit_required && !job.deposit_received
          case 'arrived': return job.customer_arrived_at && (new Date().getTime() - new Date(job.customer_arrived_at).getTime()) < 30 * 60 * 1000
          case 'needs_info': {
            const placeholders = ['unknown', 'to be added', 'to be assessed', 'repair needed']
            return !job.terms_accepted || [job.device_make, job.device_model, job.issue].some(value => !value || placeholders.includes(value.trim().toLowerCase()))
          }
          default: return true
        }
      })
    }

    // Group filtered jobs by action
    const grouped = groupJobsByAction(filtered)
    setGroupedJobs(grouped)
  }, [jobs, searchTerm, activeFilter])

  const loadJobs = async () => {
    const query = supabase
      .from('jobs')
      .select('*')
      .order('created_at', { ascending: false })

    if (!showAllJobs) {
      query.not('status', 'in', '("COMPLETED","CANCELLED","IN_STORAGE")')
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

  const loadSendInCount = async () => {
    const { count } = await supabase
      .from('send_in_requests')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending')

    setSendInCount(count || 0)
  }

  const loadEnquiryCount = async () => {
    const { count } = await supabase
      .from('enquiries')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending')

    setEnquiryCount(count || 0)

    // Load approved enquiries for banner
    const { data: approved } = await supabase
      .from('enquiries')
      .select('enquiry_ref, customer_name, device_make, device_model, quoted_price')
      .eq('status', 'approved')
      .order('updated_at', { ascending: false })
    setApprovedEnquiries(approved || [])
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
      
      {/* Approved Quote Banner - Shows when customers have approved quotes */}
      {approvedEnquiries.length > 0 && (
        <div className="bg-green-600 text-white px-4 py-3 shadow-lg">
          <div className="flex items-center gap-3">
            <BellRing className="h-6 w-6 animate-pulse flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="font-black text-sm">
                {approvedEnquiries.length === 1 
                  ? 'QUOTE APPROVED - Action Needed!' 
                  : `${approvedEnquiries.length} QUOTES APPROVED - Action Needed!`}
              </p>
              <div className="flex gap-2 mt-1 overflow-x-auto pb-1">
                {approvedEnquiries.slice(0, 4).map((enq) => (
                  <Link
                    key={enq.enquiry_ref}
                    href={`/app/enquiries?ref=${enq.enquiry_ref}`}
                    className="flex-shrink-0 bg-white/20 hover:bg-white/30 rounded-lg px-3 py-1.5 transition-colors"
                  >
                    <span className="text-xs font-bold">{enq.customer_name}</span>
                    <span className="text-xs ml-2 opacity-90">
                      {enq.device_make} {enq.device_model}
                      {enq.quoted_price && ` - £${enq.quoted_price}`}
                    </span>
                  </Link>
                ))}
                {approvedEnquiries.length > 4 && (
                  <Link
                    href="/app/enquiries"
                    className="flex-shrink-0 bg-white/20 hover:bg-white/30 rounded-lg px-3 py-1.5 transition-colors"
                  >
                    <span className="text-xs font-bold">+{approvedEnquiries.length - 4} more...</span>
                  </Link>
                )}
              </div>
            </div>
            <Link
              href="/app/enquiries"
              className="flex-shrink-0 bg-white text-green-700 font-black text-xs px-4 py-2 rounded-xl hover:bg-green-50 transition-colors active:scale-95"
            >
              View All
            </Link>
          </div>
        </div>
      )}
      
      <header className="bg-white dark:bg-gray-800 shadow-sm sticky top-0 z-10">
        <div className="px-4 py-3">
          <div className="flex items-center justify-between mb-3">
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">Repair Jobs</h1>
            {!loading && (
              <span className="text-xs font-bold text-gray-500 dark:text-gray-400">
                {jobs.length} {showAllJobs ? 'total' : 'active'}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 mb-3">
            <button onClick={() => setShowScanner(!showScanner)} className="w-14 h-14 flex items-center justify-center rounded-xl bg-blue-600 text-white hover:bg-blue-700 transition-colors active:scale-90" title="Scan QR Code">
              <QrCode className="h-6 w-6" />
            </button>
            <button onClick={() => setShowAllJobs(!showAllJobs)} className={`w-14 h-14 flex items-center justify-center rounded-xl transition-colors active:scale-90 ${showAllJobs ? 'bg-primary text-white' : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300'}`} title={showAllJobs ? 'Show active only' : 'Show all jobs'}>
              <Archive className="h-6 w-6" />
            </button>
            <div className="ml-auto">
              <NavDropdown unreadCount={unreadCount} warrantyCount={warrantyCount} sendInCount={sendInCount} enquiryCount={enquiryCount} />
            </div>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
            <input type="text" placeholder="Search by job ref, name, phone..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full h-14 pl-10 pr-4 border border-gray-300 dark:border-gray-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary bg-white dark:bg-gray-700 text-gray-900 dark:text-white" />
          </div>
          <div className="flex gap-2 mt-3 overflow-x-auto pb-1">
            {[
              ['all', 'All'],
              ['needs_info', 'Needs info'],
              ['in_shop', 'In shop'],
              ['needs_parts', 'Parts'],
              ['deposit', 'Deposit'],
            ].map(([value, label]) => (
              <button key={value} type="button" onClick={() => setActiveFilter(value)} className={`flex-shrink-0 px-3 py-2 rounded-lg text-xs font-bold border transition-colors ${activeFilter === value ? 'bg-primary border-primary text-white' : 'bg-white dark:bg-gray-700 border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-200'}`}>
                {label}
              </button>
            ))}
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
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
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
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
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
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
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
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
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
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-3">
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
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  {groupedJobs.OTHER.map(job => (
                    <EnhancedJobTile key={job.id} job={job} />
                  ))}
                </div>
              </section>
            )}

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
