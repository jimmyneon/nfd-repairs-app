'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { ArrowLeft, Plus, Loader2 } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

export default function CreateJobPage() {
  const router = useRouter()
  const supabase = createClient()
  
  const [loading, setLoading] = useState(false)
  const [showMakeOther, setShowMakeOther] = useState(false)
  const [showIssueOther, setShowIssueOther] = useState(false)
  
  const [formData, setFormData] = useState({
    customer_name: '',
    customer_phone: '',
    customer_email: '',
    device_type: '',
    device_make: '',
    device_model: '',
    issue: '',
    description: '',
    price_total: '',
    requires_parts_order: false,
    device_password: '',
    password_na: false,
    terms_accepted: false,
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
    setLoading(true)

    try {
      const response = await fetch('/api/jobs/create-v3', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formData.customer_name,
          phone: formData.customer_phone,
          email: formData.customer_email || null,
          device_type: formData.device_type,
          device_make: formData.device_make,
          device_model: formData.device_model,
          issue: formData.issue,
          description: formData.description || null,
          price_total: parseFloat(formData.price_total),
          quoted_price: parseFloat(formData.price_total),
          requires_parts_order: formData.requires_parts_order,
          source: 'staff_manual',
          device_password: formData.password_na ? null : formData.device_password,
          password_not_applicable: formData.password_na,
          customer_signature: null,
          terms_accepted: formData.terms_accepted,
          onboarding_completed: true,
        }),
      })

      const result = await response.json()

      if (response.ok) {
        router.push(`/app/jobs/${result.job_id}`)
      } else {
        alert(`Error: ${result.error}`)
        setLoading(false)
      }
    } catch (error) {
      console.error('Failed to create job:', error)
      alert('Failed to create job. Please try again.')
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

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <header className="bg-white dark:bg-gray-800 shadow-sm sticky top-0 z-10">
        <div className="px-4 py-4">
          <Link href="/app/jobs" className="inline-flex items-center text-primary mb-3">
            <ArrowLeft className="h-6 w-6 mr-2" />
            <span className="font-bold">Back to Jobs</span>
          </Link>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Create New Job</h1>
        </div>
      </header>

      <main className="p-4 max-w-2xl mx-auto">
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-6">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">Customer Details</h2>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Customer Name *
                </label>
                <input
                  type="text"
                  name="customer_name"
                  value={formData.customer_name}
                  onChange={handleChange}
                  required
                  className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  placeholder="John Smith"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Phone Number *
                </label>
                <input
                  type="tel"
                  name="customer_phone"
                  value={formData.customer_phone}
                  onChange={handleChange}
                  required
                  className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  placeholder="07410 123456"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Email Address (Optional)
                </label>
                <input
                  type="email"
                  name="customer_email"
                  value={formData.customer_email}
                  onChange={handleChange}
                  className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  placeholder="customer@example.com"
                />
              </div>
            </div>
          </div>

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
                  Description (Optional)
                </label>
                <textarea
                  name="description"
                  value={formData.description}
                  onChange={handleChange}
                  rows={3}
                  className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  placeholder="Additional details about the issue..."
                />
              </div>
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

          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-6">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">Onboarding Information</h2>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
              Collect this information while the customer is present
            </p>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Device Password/Passcode
                </label>
                <input
                  type="text"
                  name="device_password"
                  value={formData.device_password}
                  onChange={handleChange}
                  disabled={formData.password_na}
                  className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary bg-white dark:bg-gray-700 text-gray-900 dark:text-white disabled:bg-gray-100 dark:disabled:bg-gray-600"
                  placeholder="Enter device password"
                />
                <div className="mt-2 flex items-center">
                  <input
                    type="checkbox"
                    name="password_na"
                    checked={formData.password_na}
                    onChange={handleChange}
                    className="w-4 h-4 text-primary focus:ring-primary border-gray-300 rounded"
                    id="password_na"
                  />
                  <label htmlFor="password_na" className="ml-2 text-sm text-gray-700 dark:text-gray-300">
                    Device has no password
                  </label>
                </div>
              </div>

              <div className="flex items-start space-x-3 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-xl border-2 border-blue-200 dark:border-blue-800">
                <input
                  type="checkbox"
                  name="terms_accepted"
                  checked={formData.terms_accepted}
                  onChange={handleChange}
                  className="w-5 h-5 text-primary focus:ring-primary border-gray-300 rounded mt-0.5"
                  id="terms_accepted"
                  required
                />
                <label htmlFor="terms_accepted" className="text-sm text-gray-900 dark:text-white cursor-pointer">
                  <strong>Customer accepts terms and conditions *</strong>
                  <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                    By checking this box, the customer agrees to our repair terms and conditions, including warranty coverage and liability limitations.
                  </p>
                </label>
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
                  <Plus className="h-5 w-5" />
                  <span>Create Job</span>
                </>
              )}
            </button>
            
            <Link
              href="/app/jobs"
              className="flex-1 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-900 dark:text-white font-bold py-4 px-6 rounded-xl transition-all shadow-lg active:scale-95 flex items-center justify-center"
            >
              Cancel
            </Link>
          </div>
        </form>
      </main>
    </div>
  )
}
