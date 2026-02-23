'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { ArrowLeft, Save, Loader2 } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

export default function EditJobPage({ params }: { params: { id: string } }) {
  const router = useRouter()
  const supabase = createClient()
  
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [showMakeOther, setShowMakeOther] = useState(false)
  const [showIssueOther, setShowIssueOther] = useState(false)
  
  const [formData, setFormData] = useState({
    device_type: '',
    device_make: '',
    device_model: '',
    issue: '',
    description: '',
    price_total: '',
  })

  const deviceTypes = [
    { value: 'phone', label: 'Mobile Phone' },
    { value: 'tablet', label: 'Tablet' },
    { value: 'laptop', label: 'Laptop' },
    { value: 'desktop', label: 'Desktop PC' },
    { value: 'console', label: 'Gaming Console' },
    { value: 'other', label: 'Other' },
  ]

  const makesByType: Record<string, string[]> = {
    phone: ['Apple', 'Samsung', 'Google', 'OnePlus', 'Huawei', 'Motorola', 'Nokia', 'Sony', 'Other'],
    tablet: ['Apple', 'Samsung', 'Amazon', 'Lenovo', 'Microsoft', 'Huawei', 'Other'],
    laptop: ['Apple', 'Dell', 'HP', 'Lenovo', 'Asus', 'Acer', 'Microsoft', 'MSI', 'Razer', 'Other'],
    desktop: ['Dell', 'HP', 'Lenovo', 'Asus', 'Acer', 'Custom Build', 'Other'],
    console: ['Sony PlayStation', 'Microsoft Xbox', 'Nintendo Switch', 'Nintendo', 'Other'],
    other: ['Other'],
  }

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

  useEffect(() => {
    loadJob()
  }, [params.id])

  const loadJob = async () => {
    const { data: job, error } = await supabase
      .from('jobs')
      .select('*')
      .eq('id', params.id)
      .single()

    if (job && !error) {
      setFormData({
        device_type: job.device_type || '',
        device_make: job.device_make || '',
        device_model: job.device_model || '',
        issue: job.issue || '',
        description: job.description || '',
        price_total: job.price_total?.toString() || '',
      })
      
      if (job.device_make && !makesByType[job.device_type || 'other']?.includes(job.device_make)) {
        setShowMakeOther(true)
      }
      
      if (job.issue && !commonIssues.includes(job.issue)) {
        setShowIssueOther(true)
      }
    }
    setLoading(false)
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target
    
    if (name === 'device_type') {
      setFormData(prev => ({
        ...prev,
        device_type: value,
        device_make: '',
      }))
      setShowMakeOther(false)
      return
    }

    if (name === 'device_make') {
      setShowMakeOther(value === 'Other')
    }

    if (name === 'issue') {
      setShowIssueOther(value === 'Other')
    }
    
    setFormData(prev => ({
      ...prev,
      [name]: value
    }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)

    try {
      const { error } = await supabase
        .from('jobs')
        .update({
          device_type: formData.device_type,
          device_make: formData.device_make,
          device_model: formData.device_model,
          issue: formData.issue,
          description: formData.description,
          price_total: parseFloat(formData.price_total),
        })
        .eq('id', params.id)

      if (error) {
        alert('Failed to update job: ' + error.message)
      } else {
        await supabase.from('job_events').insert({
          job_id: params.id,
          type: 'SYSTEM',
          message: 'Job details updated by staff',
        })
        
        router.push(`/app/jobs/${params.id}`)
      }
    } catch (error) {
      console.error('Failed to update job:', error)
      alert('Failed to update job. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <header className="bg-white dark:bg-gray-800 shadow-sm sticky top-0 z-10">
        <div className="px-4 py-4">
          <Link href={`/app/jobs/${params.id}`} className="inline-flex items-center text-primary mb-3">
            <ArrowLeft className="h-6 w-6 mr-2" />
            <span className="font-bold">Back to Job</span>
          </Link>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Edit Job Details</h1>
        </div>
      </header>

      <main className="p-4 max-w-2xl mx-auto">
        <form onSubmit={handleSubmit} className="space-y-6">
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
                  placeholder="Additional details..."
                />
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-6">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">Pricing</h2>
            
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
          </div>

          <div className="flex gap-3">
            <Link
              href={`/app/jobs/${params.id}`}
              className="flex-1 px-6 py-3 border-2 border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors text-center font-bold"
            >
              Cancel
            </Link>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 flex items-center justify-center space-x-2 px-6 py-3 bg-primary text-white rounded-xl hover:bg-primary-dark transition-colors disabled:opacity-50 font-bold"
            >
              {saving ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  <span>Saving...</span>
                </>
              ) : (
                <>
                  <Save className="h-5 w-5" />
                  <span>Save Changes</span>
                </>
              )}
            </button>
          </div>
        </form>
      </main>
    </div>
  )
}
