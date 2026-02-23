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
  const [formData, setFormData] = useState({
    customer_name: '',
    customer_phone: '',
    customer_email: '',
    device_make: '',
    device_model: '',
    issue: '',
    description: '',
    price_total: '',
    requires_parts_order: false,
  })

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
          device_make: formData.device_make,
          device_model: formData.device_model,
          issue: formData.issue,
          description: formData.description || null,
          price_total: parseFloat(formData.price_total),
          quoted_price: parseFloat(formData.price_total),
          requires_parts_order: formData.requires_parts_order,
          source: 'staff_manual',
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

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target
    const checked = (e.target as HTMLInputElement).checked
    
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
                  Device Make *
                </label>
                <input
                  type="text"
                  name="device_make"
                  value={formData.device_make}
                  onChange={handleChange}
                  required
                  className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  placeholder="Apple, Samsung, etc."
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Device Model *
                </label>
                <input
                  type="text"
                  name="device_model"
                  value={formData.device_model}
                  onChange={handleChange}
                  required
                  className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  placeholder="iPhone 12 Pro, Galaxy S21, etc."
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Issue *
                </label>
                <input
                  type="text"
                  name="issue"
                  value={formData.issue}
                  onChange={handleChange}
                  required
                  className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  placeholder="Cracked screen, battery replacement, etc."
                />
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
