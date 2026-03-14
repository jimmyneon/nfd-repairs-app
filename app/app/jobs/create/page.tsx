'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { ArrowLeft, Plus, Loader2, FileJson, CheckCircle, Search, Zap } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import ImportJobDataModal from '@/components/ImportJobDataModal'
import CustomerConfirmationModal from '@/components/CustomerConfirmationModal'
import QuoteLookupModal from '@/components/QuoteLookupModal'
import BookingConfirmationScreen from '@/components/BookingConfirmationScreen'

export default function CreateJobPage() {
  const router = useRouter()
  const supabase = createClient()
  
  const [loading, setLoading] = useState(false)
  const [showMakeOther, setShowMakeOther] = useState(false)
  const [showIssueOther, setShowIssueOther] = useState(false)
  const [showImportModal, setShowImportModal] = useState(false)
  const [showConfirmationModal, setShowConfirmationModal] = useState(false)
  const [showQuoteLookup, setShowQuoteLookup] = useState(false)
  const [quickWalkInMode, setQuickWalkInMode] = useState(false)
  const [showBookingConfirmation, setShowBookingConfirmation] = useState(false)
  const [createdJobRef, setCreatedJobRef] = useState<string | null>(null)
  
  const [formData, setFormData] = useState({
    device_type: '',
    device_make: '',
    device_model: '',
    issue: '',
    description: '',
    repair_type: '',
    technician_notes: '',
    price_total: '',
    requires_parts_order: false,
    device_left_with_us: true,
    passcode_requirement: 'recommended' as 'not_required' | 'recommended' | 'required',
    linked_quote_id: null as string | null,
  })

  // Device type options
  const deviceTypes = [
    { value: 'phone', label: 'Mobile Phone' },
    { value: 'tablet', label: 'Tablet' },
    { value: 'laptop', label: 'Laptop' },
    { value: 'desktop', label: 'Desktop PC' },
    { value: 'console', label: 'Gaming Console' },
    { value: 'other', label: 'Other' },
  ]

  // Common makes by device type
  const makesByType: Record<string, string[]> = {
    phone: ['Apple', 'Samsung', 'Google', 'OnePlus', 'Huawei', 'Motorola', 'Nokia', 'Sony', 'Other'],
    tablet: ['Apple', 'Samsung', 'Amazon', 'Lenovo', 'Microsoft', 'Huawei', 'Other'],
    laptop: ['Apple', 'Dell', 'HP', 'Lenovo', 'Asus', 'Acer', 'Microsoft', 'MSI', 'Razer', 'Other'],
    desktop: ['Dell', 'HP', 'Lenovo', 'Asus', 'Acer', 'Custom Build', 'Other'],
    console: ['Sony PlayStation', 'Microsoft Xbox', 'Nintendo Switch', 'Nintendo', 'Other'],
    other: ['Other'],
  }

  // Common issues
  const commonIssues = [
    'Screen Replacement',
    'Battery Replacement',
    'Charging Port Replacement',
    'Not Charging',
    'No Power',
    'Water Damage',
    'Data Recovery',
    'Windows 10 Installation',
    'Windows 11 Installation',
    'Software Glitches',
    'Not Loading',
    'Black Screen',
    'Blue Screen of Death',
    'SSD Upgrade',
    'Hard Drive Replacement',
    'RAM Upgrade',
    'HDMI Port Repair',
    'Software Malfunction',
    'Overheating',
    'Virus Removal',
    'Other',
  ]

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    // Switch to customer screen (show confirmation modal)
    setShowConfirmationModal(true)
  }

  const handleQuoteSelect = (quote: any) => {
    setFormData({
      ...formData,
      device_type: quote.device_type || '',
      device_make: quote.device_make,
      device_model: quote.device_model,
      issue: quote.issue,
      description: quote.description || '',
      price_total: quote.quoted_price ? String(quote.quoted_price) : '',
      linked_quote_id: quote.quote_request_id,
    })
    setShowQuoteLookup(false)
  }

  const handleConfirmJob = async (customerData: {
    customer_name: string
    customer_phone: string
    customer_email: string
    device_password: string
    password_na: boolean
    passcode_method: string
    terms_accepted: boolean
  }) => {
    setShowConfirmationModal(false)
    setLoading(true)

    // Check if this is an imported job with custom options
    // @ts-ignore
    const importOptions = window.__importOptions || {}
    
    const payload = {
          customer_name: customerData.customer_name,
          customer_phone: customerData.customer_phone,
          customer_email: customerData.customer_email || null,
          device_type: formData.device_type,
          device_make: formData.device_make,
          device_model: formData.device_model,
          issue: formData.issue,
          description: formData.description || null,
          price_total: parseFloat(formData.price_total),
          quoted_price: parseFloat(formData.price_total),
          requires_parts_order: formData.requires_parts_order,
          source: 'staff_manual',
          device_password: customerData.password_na ? null : customerData.device_password,
          password_not_applicable: customerData.password_na,
          passcode_requirement: formData.passcode_requirement,
          passcode_method: customerData.passcode_method,
          customer_signature: null,
          terms_accepted: true,
          onboarding_completed: true,
          device_in_shop: formData.device_left_with_us,
          linked_quote_id: formData.linked_quote_id,
          // Import options (if from JSON import)
          initial_status: importOptions.initial_status,
          skip_sms: importOptions.skip_sms,
        }
    
    // Clear import options after use
    // @ts-ignore
    delete window.__importOptions

    console.log('Creating job with payload:', payload)

    try {
      const response = await fetch('/api/jobs/create-v3', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      const result = await response.json()

      if (response.ok) {
        // Show confirmation screen instead of redirecting
        setCreatedJobRef(result.job_ref || result.job_id)
        setShowBookingConfirmation(true)
        setLoading(false)
        
        // Reset form for next job
        setFormData({
          device_type: '',
          device_make: '',
          device_model: '',
          issue: '',
          description: '',
          repair_type: '',
          technician_notes: '',
          price_total: '',
          requires_parts_order: false,
          device_left_with_us: true,
          passcode_requirement: 'recommended',
          linked_quote_id: null,
        })
        setQuickWalkInMode(false)
      } else {
        console.error('API Error Response:', result)
        alert(`Error: ${result.error}\n${result.details || ''}`)
        setLoading(false)
      }
    } catch (error) {
      console.error('Error creating job:', error)
      alert(`Failed to create job: ${error instanceof Error ? error.message : 'Unknown error'}`)
      setLoading(false)
    }
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target
    const checked = (e.target as HTMLInputElement).checked
    
    // Reset make when device type changes
    if (name === 'device_type') {
      setFormData(prev => ({
        ...prev,
        device_type: value,
        device_make: '',
      }))
      setShowMakeOther(false)
      return
    }

    // Show "Other" input for make
    if (name === 'device_make') {
      setShowMakeOther(value === 'Other')
    }

    // Show "Other" input for issue
    if (name === 'issue') {
      setShowIssueOther(value === 'Other')
    }
    
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }))
  }

  const handleImportData = (importedData: any) => {
    // Convert price to string for form input
    const priceString = importedData.price_total ? String(importedData.price_total) : ''
    
    // Store import options for later use
    const importOptions = {
      initial_status: importedData.initial_status,
      skip_sms: importedData.skip_sms,
    }
    
    // Update form data with imported values
    setFormData({
      device_type: importedData.device_type || '',
      device_make: importedData.device_make || '',
      device_model: importedData.device_model || '',
      issue: importedData.issue || '',
      description: importedData.description || '',
      repair_type: importedData.repair_type || '',
      technician_notes: importedData.technician_notes || '',
      price_total: priceString,
      requires_parts_order: importedData.requires_parts_order || false,
      device_left_with_us: importedData.device_left_with_us || false,
      passcode_requirement: importedData.passcode_requirement || 'recommended',
      linked_quote_id: null,
    })

    // Handle "Other" selections
    if (importedData.device_make === 'Other') {
      setShowMakeOther(true)
    }
    if (importedData.issue === 'Other') {
      setShowIssueOther(true)
    }
    
    // Store import options in state for use when creating job
    // @ts-ignore - temporary storage
    window.__importOptions = importOptions
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <header className="bg-white dark:bg-gray-800 shadow-sm sticky top-0 z-10">
        <div className="px-4 py-4">
          <Link href="/app/jobs" className="inline-flex items-center text-primary mb-3">
            <ArrowLeft className="h-6 w-6 mr-2" />
            <span className="font-bold">Back to Jobs</span>
          </Link>
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Create New Job</h1>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setShowQuoteLookup(true)}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium text-sm"
              >
                <Search className="h-4 w-4" />
                Search Quotes
              </button>
              <button
                type="button"
                onClick={() => setShowImportModal(true)}
                className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-dark transition-colors font-medium text-sm"
              >
                <FileJson className="h-4 w-4" />
                Import JSON
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="p-4 max-w-2xl mx-auto">
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Quick Walk-In Mode Button */}
          {!quickWalkInMode && (
            <button
              type="button"
              onClick={() => setQuickWalkInMode(true)}
              className="w-full flex items-center justify-center gap-2 px-6 py-4 bg-gradient-to-r from-orange-500 to-orange-600 text-white rounded-xl font-bold shadow-lg hover:from-orange-600 hover:to-orange-700 transition-all"
            >
              <Zap className="h-5 w-5" />
              Quick Walk-In Mode
            </button>
          )}

          {quickWalkInMode && (
            <div className="bg-orange-50 dark:bg-orange-900/20 border-2 border-orange-300 dark:border-orange-700 rounded-xl p-4">
              <p className="text-sm text-orange-900 dark:text-orange-100 font-semibold">
                ⚡ Quick Walk-In Mode Active - Simplified intake for busy periods
              </p>
            </div>
          )}

          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-6">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">Device Details</h2>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Device Type *
                </label>
                <select
                  name="device_type"
                  value={formData.device_type}
                  onChange={handleChange}
                  required
                  className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                >
                  <option value="">Select device type...</option>
                  {deviceTypes.map(type => (
                    <option key={type.value} value={type.value}>{type.label}</option>
                  ))}
                </select>
              </div>

              {formData.device_type && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Make *
                  </label>
                  <select
                    name="device_make"
                    value={formData.device_make}
                    onChange={handleChange}
                    required
                    className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  >
                    <option value="">Select make...</option>
                    {makesByType[formData.device_type]?.map(make => (
                      <option key={make} value={make}>{make}</option>
                    ))}
                  </select>
                  {showMakeOther && (
                    <input
                      type="text"
                      name="device_make"
                      value={formData.device_make === 'Other' ? '' : formData.device_make}
                      onChange={handleChange}
                      placeholder="Enter make..."
                      className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary bg-white dark:bg-gray-700 text-gray-900 dark:text-white mt-2"
                    />
                  )}
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Model *
                </label>
                <input
                  type="text"
                  name="device_model"
                  value={formData.device_model}
                  onChange={handleChange}
                  required
                  className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  placeholder="e.g. iPhone 14 Pro, Galaxy S23, ThinkPad X1"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Issue *
                </label>
                <select
                  name="issue"
                  value={formData.issue}
                  onChange={handleChange}
                  required
                  className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                >
                  <option value="">Select issue...</option>
                  {commonIssues.map(issue => (
                    <option key={issue} value={issue}>{issue}</option>
                  ))}
                </select>
                {showIssueOther && (
                  <input
                    type="text"
                    name="issue"
                    value={formData.issue === 'Other' ? '' : formData.issue}
                    onChange={handleChange}
                    placeholder="Describe the issue..."
                    className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary bg-white dark:bg-gray-700 text-gray-900 dark:text-white mt-2"
                  />
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Fault Description (Optional)
                </label>
                <textarea
                  name="description"
                  value={formData.description}
                  onChange={handleChange}
                  rows={3}
                  className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  placeholder="Additional details about the fault..."
                />
              </div>

              {!quickWalkInMode && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Technician Notes (Optional)
                  </label>
                  <textarea
                    name="technician_notes"
                    value={formData.technician_notes}
                    onChange={handleChange}
                    rows={2}
                    className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    placeholder="Internal notes for staff..."
                  />
                </div>
              )}
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-6">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">Pricing & Parts</h2>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Total Price (£) *
                </label>
                <input
                  type="number"
                  name="price_total"
                  value={formData.price_total}
                  onChange={handleChange}
                  required
                  step="0.01"
                  min="0"
                  className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  placeholder="89.99"
                />
              </div>

              <div className="flex items-center space-x-3 p-4 bg-yellow-50 dark:bg-yellow-900/20 rounded-xl border-2 border-yellow-200 dark:border-yellow-800">
                <input
                  type="checkbox"
                  name="requires_parts_order"
                  checked={formData.requires_parts_order}
                  onChange={handleChange}
                  className="w-5 h-5 text-primary focus:ring-primary border-gray-300 rounded"
                  id="requires_parts"
                />
                <label htmlFor="requires_parts" className="text-sm font-medium text-gray-900 dark:text-white cursor-pointer">
                  Requires parts order (£20 deposit will be requested)
                </label>
              </div>
            </div>
          </div>

          {/* Passcode Requirement Section */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-6">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">Passcode Requirement</h2>
            
            <div className="space-y-3">
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Does this device require a passcode for testing after repair?
              </p>
              
              <div className="space-y-2">
                <label className="flex items-center space-x-3 p-3 border-2 border-gray-200 dark:border-gray-600 rounded-xl cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                  <input
                    type="radio"
                    name="passcode_requirement"
                    value="not_required"
                    checked={formData.passcode_requirement === 'not_required'}
                    onChange={handleChange}
                    className="w-4 h-4 text-primary focus:ring-primary"
                  />
                  <div>
                    <div className="font-medium text-gray-900 dark:text-white">Not Required</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">Device has no passcode or not needed for testing</div>
                  </div>
                </label>
                
                <label className="flex items-center space-x-3 p-3 border-2 border-blue-200 dark:border-blue-700 bg-blue-50 dark:bg-blue-900/20 rounded-xl cursor-pointer hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors">
                  <input
                    type="radio"
                    name="passcode_requirement"
                    value="recommended"
                    checked={formData.passcode_requirement === 'recommended'}
                    onChange={handleChange}
                    className="w-4 h-4 text-primary focus:ring-primary"
                  />
                  <div>
                    <div className="font-medium text-gray-900 dark:text-white">Recommended</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">Customer should provide passcode for best testing</div>
                  </div>
                </label>
                
                <label className="flex items-center space-x-3 p-3 border-2 border-red-200 dark:border-red-700 bg-red-50 dark:bg-red-900/20 rounded-xl cursor-pointer hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors">
                  <input
                    type="radio"
                    name="passcode_requirement"
                    value="required"
                    checked={formData.passcode_requirement === 'required'}
                    onChange={handleChange}
                    className="w-4 h-4 text-primary focus:ring-primary"
                  />
                  <div>
                    <div className="font-medium text-gray-900 dark:text-white">Required</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">Must have passcode to complete repair and testing</div>
                  </div>
                </label>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-6">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">Device Status</h2>
            
            <div className="space-y-4">
              <div className="flex items-start space-x-3 p-4 bg-green-50 dark:bg-green-900/20 rounded-xl border-2 border-green-200 dark:border-green-800">
                <input
                  type="checkbox"
                  name="device_left_with_us"
                  checked={formData.device_left_with_us}
                  onChange={handleChange}
                  className="w-5 h-5 text-green-600 focus:ring-green-500 border-gray-300 rounded mt-0.5"
                  id="device_left_with_us"
                />
                <label htmlFor="device_left_with_us" className="text-sm text-gray-900 dark:text-white cursor-pointer">
                  <strong>Device left with us</strong>
                  <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                    Check this if the customer is leaving their device with us now. Leave unchecked if they're taking it away (e.g., waiting for parts to arrive).
                  </p>
                </label>
              </div>
              
              <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-4 border-2 border-blue-200 dark:border-blue-800">
                <p className="text-sm text-blue-900 dark:text-blue-100">
                  <strong>Next Step:</strong> After clicking "Switch to Customer Screen", hand the tablet/device to the customer to enter their details, passcode, and accept terms.
                </p>
              </div>
            </div>
          </div>

          <div className="flex gap-4">
            <button
              type="submit"
              disabled={loading}
              className="flex-1 bg-primary hover:bg-primary-dark text-white font-bold py-4 px-6 rounded-xl disabled:opacity-50 transition-all shadow-lg active:scale-95 flex items-center justify-center space-x-2"
            >
              {loading ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  <span>Creating...</span>
                </>
              ) : (
                <>
                  <CheckCircle className="h-5 w-5" />
                  <span>Switch to Customer Screen</span>
                </>
              )}
            </button>
            
            <Link
              href="/app/jobs"
              className="flex-1 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-900 dark:text-white font-bold py-4 px-6 rounded-xl transition-all shadow-lg active:scale-95 flex items-center justify-center space-x-2"
            >
              <ArrowLeft className="h-5 w-5" />
              <span>Cancel</span>
            </Link>
          </div>
        </form>
      </main>

      {showImportModal && (
        <ImportJobDataModal 
          onImport={handleImportData}
          onClose={() => setShowImportModal(false)}
        />
      )}

      <QuoteLookupModal
        isOpen={showQuoteLookup}
        onClose={() => setShowQuoteLookup(false)}
        onSelectQuote={handleQuoteSelect}
      />

      {showConfirmationModal && (
        <CustomerConfirmationModal
          isOpen={showConfirmationModal}
          onClose={() => setShowConfirmationModal(false)}
          onConfirm={handleConfirmJob}
          jobData={formData}
          passcodeRequirement={formData.passcode_requirement}
        />
      )}

      <BookingConfirmationScreen
        isOpen={showBookingConfirmation}
        onClose={() => {
          setShowBookingConfirmation(false)
          setCreatedJobRef(null)
        }}
        jobRef={createdJobRef || undefined}
      />
    </div>
  )
}
