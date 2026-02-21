'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { Job, JobStatus } from '@/lib/types-v3'
import { JOB_STATUS_LABELS, JOB_STATUS_COLORS, JOB_STATUS_BORDER_COLORS } from '@/lib/constants'
import { Search, Filter, Bell, Settings, MessageSquare, QrCode, LogOut } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import NotificationSetup from '@/components/NotificationSetup'
import QRScanner from '@/components/QRScanner'

export default function JobsListPage() {
  const [jobs, setJobs] = useState<Job[]>([])
  const [filteredJobs, setFilteredJobs] = useState<Job[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState<JobStatus | 'ALL'>('ALL')
  const [unreadCount, setUnreadCount] = useState(0)
  const [showScanner, setShowScanner] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  const handleQRScan = (jobRef: string) => {
    setSearchTerm(jobRef)
    setShowScanner(false)
  }

  useEffect(() => {
    loadJobs()
    loadUnreadNotifications()
    
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

    return () => {
      jobsSubscription.unsubscribe()
      notificationsSubscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    let filtered = jobs

    if (statusFilter !== 'ALL') {
      filtered = filtered.filter(job => job.status === statusFilter)
    }

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

    setFilteredJobs(filtered)
  }, [jobs, statusFilter, searchTerm])

  const loadJobs = async () => {
    const { data, error } = await supabase
      .from('jobs')
      .select('*')
      .order('created_at', { ascending: false })

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

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  const statusOptions: (JobStatus | 'ALL')[] = [
    'ALL',
    'RECEIVED',
    'AWAITING_DEPOSIT',
    'PARTS_ORDERED',
    'READY_TO_BOOK_IN',
    'IN_REPAIR',
    'READY_TO_COLLECT',
    'COMPLETED',
    'CANCELLED',
  ]

  return (
    <div className="min-h-screen bg-gray-50">
      <NotificationSetup />
      {showScanner && (
        <QRScanner 
          onClose={() => setShowScanner(false)}
          onScan={handleQRScan}
        />
      )}
      <header className="bg-white shadow-sm sticky top-0 z-10">
        <div className="px-4 py-3">
          <div className="flex items-center justify-between mb-3">
            <h1 className="text-xl font-bold text-gray-900">Repair Jobs</h1>
            <div className="flex items-center space-x-3">
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

          <div className="flex gap-2 mb-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
              <input
                type="text"
                placeholder="Search by job ref, name, phone..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-4 border-2 border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary text-base font-medium"
              />
            </div>
            <button
              onClick={() => setShowScanner(!showScanner)}
              className="flex-shrink-0 w-14 h-14 bg-primary hover:bg-primary-dark text-white rounded-xl flex items-center justify-center transition-colors"
              title="Scan QR Code"
            >
              <QrCode className="h-6 w-6" />
            </button>
          </div>

          <div className="flex items-center gap-2 overflow-x-auto pb-2 -mx-4 px-4">
            {statusOptions.map((status) => {
              const isActive = statusFilter === status
              const statusColor = status === 'ALL' ? 'bg-gray-800 text-white' : JOB_STATUS_COLORS[status]
              
              return (
                <button
                  key={status}
                  onClick={() => setStatusFilter(status)}
                  className={`px-5 py-3 rounded-xl text-base font-semibold whitespace-nowrap transition-all min-w-[100px] ${
                    isActive
                      ? `${statusColor} shadow-lg scale-105`
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {status === 'ALL' ? 'All Jobs' : JOB_STATUS_LABELS[status]}
                </button>
              )
            })}
          </div>
        </div>
      </header>

      <main className="p-4">
        {loading ? (
          <div className="text-center py-12">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        ) : filteredJobs.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-500">No jobs found</p>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-3">
            {filteredJobs.map((job) => (
              <Link
                key={job.id}
                href={`/app/jobs/${job.id}`}
                className={`relative block rounded-xl shadow-lg overflow-hidden active:scale-95 transition-all aspect-square ${JOB_STATUS_COLORS[job.status]}`}
              >
                {/* Status fills entire tile background */}
                <div className="p-3 h-full flex flex-col relative text-white">
                  {/* Status Label - Large and Prominent */}
                  <div className="text-center mb-3">
                    <p className="font-black text-sm leading-tight">
                      {JOB_STATUS_LABELS[job.status]}
                    </p>
                  </div>

                  {/* Price - Large */}
                  <div className="text-center mb-3">
                    <p className="text-2xl font-black">£{job.price_total.toFixed(2)}</p>
                  </div>

                  {/* Device - Compact */}
                  <div className="flex-1 flex flex-col justify-center text-center mb-2">
                    <p className="text-xs font-bold leading-tight mb-1">
                      {job.device_make}
                    </p>
                    <p className="text-xs leading-tight mb-1">
                      {job.device_model}
                    </p>
                    <p className="text-xs leading-tight truncate">
                      {job.issue}
                    </p>
                  </div>

                  {/* Customer - Bottom */}
                  <div className="border-t border-white border-opacity-30 pt-2">
                    <p className="text-xs font-bold truncate text-center">{job.customer_name}</p>
                  </div>

                  {/* Deposit Indicator */}
                  {job.deposit_required && !job.deposit_received && (
                    <div className="absolute top-2 right-2 w-4 h-4 bg-white rounded-full shadow-md flex items-center justify-center">
                      <span className="text-xs font-black text-yellow-600">£</span>
                    </div>
                  )}
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>

    </div>
  )
}
