'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { Job, JobStatus } from '@/lib/types-v3'
import { JOB_STATUS_LABELS, JOB_STATUS_COLORS } from '@/lib/constants'
import { Search, ArrowLeft, Calendar, DollarSign, User, Smartphone } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

export default function JobHistoryPage() {
  const [jobs, setJobs] = useState<Job[]>([])
  const [filteredJobs, setFilteredJobs] = useState<Job[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [dateFilter, setDateFilter] = useState<'all' | '7days' | '30days' | '90days' | 'year'>('all')
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    loadClosedJobs()
  }, [])

  useEffect(() => {
    let filtered = jobs

    if (dateFilter !== 'all') {
      const now = new Date()
      let cutoffDate = new Date()
      
      switch (dateFilter) {
        case '7days':
          cutoffDate.setDate(now.getDate() - 7)
          break
        case '30days':
          cutoffDate.setDate(now.getDate() - 30)
          break
        case '90days':
          cutoffDate.setDate(now.getDate() - 90)
          break
        case 'year':
          cutoffDate.setFullYear(now.getFullYear() - 1)
          break
      }
      
      filtered = filtered.filter(job => {
        const jobDate = new Date(job.closed_at || job.updated_at)
        return jobDate >= cutoffDate
      })
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
  }, [jobs, dateFilter, searchTerm])

  const loadClosedJobs = async () => {
    const { data, error } = await supabase
      .from('jobs')
      .select('*')
      .in('status', ['COMPLETED', 'CANCELLED'])
      .order('closed_at', { ascending: false, nullsFirst: false })
      .order('updated_at', { ascending: false })

    if (!error && data) {
      setJobs(data)
    }
    setLoading(false)
  }

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'N/A'
    const date = new Date(dateString)
    return date.toLocaleDateString('en-GB', { 
      day: '2-digit', 
      month: 'short', 
      year: 'numeric' 
    })
  }

  const formatDateTime = (dateString: string | null) => {
    if (!dateString) return 'N/A'
    const date = new Date(dateString)
    return date.toLocaleString('en-GB', { 
      day: '2-digit', 
      month: 'short', 
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <header className="bg-white dark:bg-gray-800 shadow-sm sticky top-0 z-10">
        <div className="px-4 py-3">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <button
                onClick={() => router.back()}
                className="text-gray-600 dark:text-gray-400 hover:text-primary"
              >
                <ArrowLeft className="h-6 w-6" />
              </button>
              <h1 className="text-xl font-bold text-gray-900 dark:text-white">Job History</h1>
            </div>
            <div className="text-sm text-gray-600 dark:text-gray-400">
              {filteredJobs.length} {filteredJobs.length === 1 ? 'job' : 'jobs'}
            </div>
          </div>

          <div className="mb-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
              <input
                type="text"
                placeholder="Search by job ref, name, phone, device..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full h-12 pl-10 pr-4 border border-gray-300 dark:border-gray-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              />
            </div>
          </div>

          <div className="flex gap-2 overflow-x-auto pb-2">
            {[
              { value: 'all', label: 'All Time' },
              { value: '7days', label: 'Last 7 Days' },
              { value: '30days', label: 'Last 30 Days' },
              { value: '90days', label: 'Last 90 Days' },
              { value: 'year', label: 'Last Year' },
            ].map((filter) => (
              <button
                key={filter.value}
                onClick={() => setDateFilter(filter.value as any)}
                className={`px-4 py-2 rounded-lg font-semibold whitespace-nowrap transition-colors ${
                  dateFilter === filter.value
                    ? 'bg-primary text-white'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                }`}
              >
                {filter.label}
              </button>
            ))}
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
            <p className="text-gray-500 dark:text-gray-400">No completed or cancelled jobs found</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredJobs.map((job) => (
              <Link
                key={job.id}
                href={`/app/jobs/${job.id}`}
                className="block bg-white dark:bg-gray-800 rounded-xl shadow-md hover:shadow-lg transition-shadow overflow-hidden"
              >
                <div className="p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-black text-lg text-gray-900 dark:text-white">
                          {job.job_ref}
                        </span>
                        <span className={`px-2 py-1 rounded-lg text-xs font-bold ${JOB_STATUS_COLORS[job.status as JobStatus]}`}>
                          {JOB_STATUS_LABELS[job.status as JobStatus]}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                        <User className="h-4 w-4" />
                        <span className="font-semibold">{job.customer_name}</span>
                      </div>
                    </div>
                    {job.price_total && (
                      <div className="flex items-center gap-1 text-green-600 dark:text-green-400 font-bold">
                        <DollarSign className="h-5 w-5" />
                        <span>£{job.price_total.toFixed(2)}</span>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-2 mb-2 text-gray-700 dark:text-gray-300">
                    <Smartphone className="h-4 w-4 text-gray-400" />
                    <span className="font-semibold text-sm">
                      {job.device_make} {job.device_model}
                    </span>
                    <span className="text-gray-400">•</span>
                    <span className="text-sm">{job.issue}</span>
                  </div>

                  <div className="flex items-center gap-4 text-xs text-gray-500 dark:text-gray-400">
                    <div className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      <span>Created: {formatDate(job.created_at)}</span>
                    </div>
                    {job.collected_at && (
                      <div className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        <span>Collected: {formatDate(job.collected_at)}</span>
                      </div>
                    )}
                    {job.closed_at && (
                      <div className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        <span>Closed: {formatDate(job.closed_at)}</span>
                      </div>
                    )}
                  </div>

                  {job.customer_flag && (
                    <div className="mt-2 inline-flex items-center gap-1 px-2 py-1 bg-yellow-100 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-200 rounded text-xs font-semibold">
                      <span>⚠️</span>
                      <span className="uppercase">{job.customer_flag}</span>
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
