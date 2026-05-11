'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { X, Search, User, Phone, Mail, Clock, Package, Loader2 } from 'lucide-react'

interface CustomerJob {
  id: string
  job_ref: string
  customer_name: string
  customer_phone: string
  customer_email: string | null
  device_make: string
  device_model: string
  issue: string
  description: string | null
  price_total: number
  requires_parts_order: boolean
  created_at: string
  status: string
}

interface CustomerSearchModalProps {
  isOpen: boolean
  onClose: () => void
  onSelectCustomer: (customerData: {
    customer_name: string
    customer_phone: string
    customer_email: string
    device_make?: string
    device_model?: string
    issue?: string
    description?: string
    price_total?: string
    requires_parts_order?: boolean
  }) => void
}

export default function CustomerSearchModal({ isOpen, onClose, onSelectCustomer }: CustomerSearchModalProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [customers, setCustomers] = useState<CustomerJob[]>([])
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerJob | null>(null)
  const [customerJobs, setCustomerJobs] = useState<CustomerJob[]>([])
  const supabase = createClient()

  useEffect(() => {
    if (isOpen) {
      setSearchQuery('')
      setCustomers([])
      setSelectedCustomer(null)
      setCustomerJobs([])
    }
  }, [isOpen])

  const handleSearch = async () => {
    if (!searchQuery.trim()) return

    setSearching(true)
    try {
      const { data, error } = await supabase
        .from('jobs')
        .select('*')
        .or(`customer_name.ilike.%${searchQuery}%,customer_phone.ilike.%${searchQuery}%,customer_email.ilike.%${searchQuery}%`)
        .order('created_at', { ascending: false })
        .limit(50)

      if (error) throw error

      // Group by customer (using phone as unique identifier)
      const uniqueCustomers = data.reduce((acc: CustomerJob[], job: CustomerJob) => {
        const exists = acc.find(c => c.customer_phone === job.customer_phone)
        if (!exists) {
          acc.push(job)
        }
        return acc
      }, [])

      setCustomers(uniqueCustomers)
    } catch (error) {
      console.error('Error searching customers:', error)
    } finally {
      setSearching(false)
    }
  }

  const handleSelectCustomer = async (customer: CustomerJob) => {
    setSelectedCustomer(customer)
    
    // Load all jobs for this customer
    try {
      const { data, error } = await supabase
        .from('jobs')
        .select('*')
        .eq('customer_phone', customer.customer_phone)
        .order('created_at', { ascending: false })

      if (error) throw error
      setCustomerJobs(data || [])
    } catch (error) {
      console.error('Error loading customer jobs:', error)
    }
  }

  const handleUseCustomerOnly = () => {
    if (!selectedCustomer) return
    
    onSelectCustomer({
      customer_name: selectedCustomer.customer_name,
      customer_phone: selectedCustomer.customer_phone,
      customer_email: selectedCustomer.customer_email || '',
    })
    onClose()
  }

  const handleUseJobData = (job: CustomerJob) => {
    onSelectCustomer({
      customer_name: job.customer_name,
      customer_phone: job.customer_phone,
      customer_email: job.customer_email || '',
      device_make: job.device_make,
      device_model: job.device_model,
      issue: job.issue,
      description: job.description || '',
      price_total: job.price_total?.toString() || '',
      requires_parts_order: job.requires_parts_order,
    })
    onClose()
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleDateString('en-GB', { 
      day: '2-digit', 
      month: 'short', 
      year: 'numeric' 
    })
  }

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      RECEIVED: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
      IN_REPAIR: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
      READY_TO_COLLECT: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
      COLLECTED: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
      COMPLETED: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200',
      CANCELLED: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
    }
    return colors[status] || 'bg-gray-100 text-gray-800'
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-6 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <Search className="h-6 w-6 text-primary" />
              Search Previous Customers
            </h2>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
              Find repeat customers and reuse their details or previous repair information
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        {/* Search Bar */}
        <div className="p-6 border-b border-gray-200 dark:border-gray-700">
          <div className="flex gap-3">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                placeholder="Search by name, phone, or email..."
                className="w-full pl-10 pr-4 py-3 border border-gray-300 dark:border-gray-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                autoFocus
              />
            </div>
            <button
              onClick={handleSearch}
              disabled={searching || !searchQuery.trim()}
              className="px-6 py-3 bg-primary text-white rounded-xl hover:bg-primary-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium flex items-center gap-2"
            >
              {searching ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Searching...
                </>
              ) : (
                <>
                  <Search className="h-5 w-5" />
                  Search
                </>
              )}
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {!selectedCustomer ? (
            /* Customer List */
            <div className="space-y-3">
              {customers.length === 0 && !searching && (
                <div className="text-center py-12">
                  <Search className="h-16 w-16 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
                  <p className="text-gray-500 dark:text-gray-400">
                    {searchQuery ? 'No customers found. Try a different search.' : 'Enter a name, phone number, or email to search'}
                  </p>
                </div>
              )}

              {customers.map((customer) => (
                <button
                  key={customer.id}
                  onClick={() => handleSelectCustomer(customer)}
                  className="w-full p-4 border-2 border-gray-200 dark:border-gray-600 rounded-xl hover:border-primary hover:bg-gray-50 dark:hover:bg-gray-700 transition-all text-left"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <User className="h-5 w-5 text-primary" />
                        <h3 className="font-bold text-gray-900 dark:text-white text-lg">
                          {customer.customer_name}
                        </h3>
                      </div>
                      <div className="space-y-1 text-sm text-gray-600 dark:text-gray-400">
                        <div className="flex items-center gap-2">
                          <Phone className="h-4 w-4" />
                          {customer.customer_phone}
                        </div>
                        {customer.customer_email && (
                          <div className="flex items-center gap-2">
                            <Mail className="h-4 w-4" />
                            {customer.customer_email}
                          </div>
                        )}
                        <div className="flex items-center gap-2 text-xs">
                          <Clock className="h-4 w-4" />
                          Last job: {formatDate(customer.created_at)}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-medium text-gray-900 dark:text-white">
                        {customer.device_make} {customer.device_model}
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        {customer.issue}
                      </div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            /* Customer Jobs List */
            <div>
              <div className="mb-6 p-4 bg-blue-50 dark:bg-blue-900/20 border-2 border-blue-200 dark:border-blue-700 rounded-xl">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="font-bold text-gray-900 dark:text-white text-lg flex items-center gap-2">
                      <User className="h-5 w-5 text-primary" />
                      {selectedCustomer.customer_name}
                    </h3>
                    <div className="space-y-1 text-sm text-gray-600 dark:text-gray-400 mt-2">
                      <div className="flex items-center gap-2">
                        <Phone className="h-4 w-4" />
                        {selectedCustomer.customer_phone}
                      </div>
                      {selectedCustomer.customer_email && (
                        <div className="flex items-center gap-2">
                          <Mail className="h-4 w-4" />
                          {selectedCustomer.customer_email}
                        </div>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => setSelectedCustomer(null)}
                    className="text-sm text-primary hover:underline"
                  >
                    ← Back to search
                  </button>
                </div>
                <button
                  onClick={handleUseCustomerOnly}
                  className="w-full mt-3 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-dark transition-colors font-medium"
                >
                  Use Customer Details Only (New Device/Repair)
                </button>
              </div>

              <h4 className="font-bold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
                <Package className="h-5 w-5 text-primary" />
                Previous Jobs ({customerJobs.length})
              </h4>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                Click a job to copy its device and repair details
              </p>

              <div className="space-y-3">
                {customerJobs.map((job) => (
                  <button
                    key={job.id}
                    onClick={() => handleUseJobData(job)}
                    className="w-full p-4 border-2 border-gray-200 dark:border-gray-600 rounded-xl hover:border-primary hover:bg-gray-50 dark:hover:bg-gray-700 transition-all text-left"
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <div className="font-bold text-gray-900 dark:text-white">
                          {job.device_make} {job.device_model}
                        </div>
                        <div className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                          {job.issue}
                        </div>
                        {job.description && (
                          <div className="text-xs text-gray-500 dark:text-gray-500 mt-1 line-clamp-2">
                            {job.description}
                          </div>
                        )}
                      </div>
                      <div className="text-right">
                        <div className="font-bold text-primary text-lg">
                          £{job.price_total?.toFixed(2) || '0.00'}
                        </div>
                        {job.requires_parts_order && (
                          <div className="text-xs text-orange-600 dark:text-orange-400 mt-1">
                            Parts Required
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400 pt-2 border-t border-gray-200 dark:border-gray-600">
                      <div className="flex items-center gap-2">
                        <Clock className="h-3 w-3" />
                        {formatDate(job.created_at)}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(job.status)}`}>
                          {job.status.replace(/_/g, ' ')}
                        </span>
                        <span className="text-gray-400">#{job.job_ref}</span>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
