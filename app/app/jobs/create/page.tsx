'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { ArrowLeft, Plus, Loader2, FileJson, CheckCircle, Search, Zap, Smartphone, Tablet, Laptop, Monitor, Wrench, Battery, Zap as Lightning, Droplet, Power, Circle } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import ImportJobDataModal from '@/components/ImportJobDataModal'
import QuoteLookupModal from '@/components/QuoteLookupModal'

export default function CreateJobPage() {
  const router = useRouter()
  const supabase = createClient()
  
  const [loading, setLoading] = useState(false)
  const [showMakeOther, setShowMakeOther] = useState(false)
  const [showIssueOther, setShowIssueOther] = useState(false)
  const [showImportModal, setShowImportModal] = useState(false)
  const [showQuoteLookup, setShowQuoteLookup] = useState(false)
  const [quickWalkInMode, setQuickWalkInMode] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('quickWalkInMode')
      return saved === 'true'
    }
    return false
  })
  
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
    passcode_requirement: 'not_required' as 'not_required' | 'recommended' | 'required',
    linked_quote_id: null as string | null,
  })

  // Save quick mode state to localStorage whenever it changes
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('quickWalkInMode', String(quickWalkInMode))
    }
  }, [quickWalkInMode])

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

  // Quick device presets for fast intake
  const quickDevicePresets = [
    { label: 'iPhone', icon: Smartphone, device_type: 'phone', device_make: 'Apple', device_model: 'iPhone ', color: 'bg-blue-600 hover:bg-blue-700' },
    { label: 'Android', icon: Smartphone, device_type: 'phone', device_make: 'Android', device_model: 'Smartphone ', color: 'bg-green-600 hover:bg-green-700' },
    { label: 'Samsung', icon: Smartphone, device_type: 'phone', device_make: 'Samsung', device_model: 'Galaxy ', color: 'bg-purple-600 hover:bg-purple-700' },
    { label: 'iPad', icon: Tablet, device_type: 'tablet', device_make: 'Apple', device_model: 'iPad ', color: 'bg-indigo-600 hover:bg-indigo-700' },
    { label: 'MacBook', icon: Laptop, device_type: 'laptop', device_make: 'Apple', device_model: 'MacBook ', color: 'bg-gray-700 hover:bg-gray-800' },
    { label: 'Laptop', icon: Monitor, device_type: 'laptop', device_make: 'Generic', device_model: 'Laptop ', color: 'bg-cyan-600 hover:bg-cyan-700' },
  ]

  // Common issue presets with colors
  const commonIssuePresets = [
    { label: 'Screen', icon: Smartphone, value: 'Screen Replacement', color: 'bg-red-600 hover:bg-red-700' },
    { label: 'Battery', icon: Battery, value: 'Battery Replacement', color: 'bg-green-600 hover:bg-green-700' },
    { label: 'Charging Port', icon: Lightning, value: 'Charging Port Replacement', color: 'bg-yellow-600 hover:bg-yellow-700' },
    { label: 'Water Damage', icon: Droplet, value: 'Water Damage', color: 'bg-blue-600 hover:bg-blue-700' },
    { label: 'Not Charging', icon: Power, value: 'Not Charging', color: 'bg-orange-600 hover:bg-orange-700' },
    { label: 'Black Screen', icon: Circle, value: 'Black Screen', color: 'bg-gray-700 hover:bg-gray-800' },
  ]

  // Common issues - prioritized for quick walk-in (most common first)
  const commonIssues = [
    'Screen Replacement',
    'Battery Replacement',
    'Charging Port Replacement',
    'Not Charging',
    'Water Damage',
    'No Power',
    'Black Screen',
    'Data Recovery',
    'Software Glitches',
    'Overheating',
    'Not Loading',
    'Blue Screen of Death',
    'Windows 10 Installation',
    'Windows 11 Installation',
    'SSD Upgrade',
    'Hard Drive Replacement',
    'RAM Upgrade',
    'HDMI Port Repair',
    'Software Malfunction',
    'Virus Removal',
    'Other',
  ]

  const handleQuickPreset = (preset: typeof quickDevicePresets[0]) => {
    setFormData({
      ...formData,
      device_type: preset.device_type,
      device_make: preset.device_make,
      device_model: preset.device_model,
    })
  }

  const handleIssuePreset = (issueValue: string) => {
    setFormData({
      ...formData,
      issue: issueValue,
    })
    setShowIssueOther(false)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    // Navigate to customer confirmation page with job data
    const params = new URLSearchParams({
      device_make: formData.device_make,
      device_model: formData.device_model,
      device_type: formData.device_type,
      issue: formData.issue,
      description: formData.description || '',
      price_total: formData.price_total || '0',
      requires_parts_order: String(formData.requires_parts_order),
      device_left_with_us: String(formData.device_left_with_us),
      passcode_requirement: formData.passcode_requirement,
      linked_quote_id: formData.linked_quote_id || '',
    })
    
    router.push(`/app/jobs/create/customer-confirm?${params.toString()}`)
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
          {/* Quick Walk-In Mode Toggle */}
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-4 border-2 border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-bold text-gray-900 dark:text-white flex items-center gap-2">
                  <Zap className="h-5 w-5 text-orange-500" />
                  Quick Walk-In Mode
                </h3>
                <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                  Ultra-fast intake for busy periods - minimal fields, generic device info
                </p>
              </div>
              <button
                type="button"
                onClick={() => setQuickWalkInMode(!quickWalkInMode)}
                className={`relative inline-flex h-8 w-14 items-center rounded-full transition-colors ${
                  quickWalkInMode ? 'bg-orange-500' : 'bg-gray-300 dark:bg-gray-600'
                }`}
              >
                <span
                  className={`inline-block h-6 w-6 transform rounded-full bg-white transition-transform ${
                    quickWalkInMode ? 'translate-x-7' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>
          </div>

          {/* Device Quick Presets - Only visible in Quick Walk-In Mode */}
          {quickWalkInMode && (
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-6">
              <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">Quick Device Selection</h2>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {quickDevicePresets.map((preset) => {
                  const Icon = preset.icon
                  return (
                    <button
                      key={preset.label}
                      type="button"
                      onClick={() => handleQuickPreset(preset)}
                      className={`${preset.color} text-white rounded-xl font-bold shadow-md transition-all h-20 flex items-center justify-center gap-3`}
                    >
                      <Icon className="h-6 w-6" />
                      <span>{preset.label}</span>
                    </button>
                  )
                })}
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-3 text-center">
                Or use the detailed form below for specific devices
              </p>
            </div>
          )}

          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-6">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">Device Details (Optional - if not using presets)</h2>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Device Type {!formData.device_type && '*'}
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
                  Model {!quickWalkInMode && '*'}
                </label>
                <input
                  type="text"
                  name="device_model"
                  value={formData.device_model}
                  onChange={handleChange}
                  required={!quickWalkInMode}
                  className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  placeholder={quickWalkInMode ? "Optional - or use preset above" : "e.g. iPhone 14 Pro, Galaxy S23, ThinkPad X1"}
                />
              </div>

              {/* Common Issue Presets - Only in Quick Mode */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                  Issue *{quickWalkInMode ? ' - Quick Select' : ''}
                </label>
                {quickWalkInMode && (
                  <>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-3">
                      {commonIssuePresets.map((preset) => {
                        const Icon = preset.icon
                        return (
                          <button
                            key={preset.value}
                            type="button"
                            onClick={() => handleIssuePreset(preset.value)}
                            className={`${preset.color} text-white rounded-xl font-bold shadow-md transition-all h-20 flex items-center justify-center gap-3 ${
                              formData.issue === preset.value ? 'ring-4 ring-primary ring-opacity-50' : ''
                            }`}
                          >
                            <Icon className="h-6 w-6" />
                            <span>{preset.label}</span>
                          </button>
                        )
                      })}
                    </div>
                    <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">
                      Or select from full list:
                    </label>
                  </>
                )}
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

              {!quickWalkInMode && (
                <>
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
                </>
              )}
            </div>
          </div>

          {quickWalkInMode ? (
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-6">
              <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">Price & Quick Options</h2>
              
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Price (£)
                    </label>
                    <input
                      type="number"
                      name="price_total"
                      value={formData.price_total}
                      onChange={handleChange}
                      required={false}
                      step="0.01"
                      min="0"
                      className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-lg font-semibold"
                      placeholder="Optional - add later if needed"
                    />
                  </div>
                  <div className="flex items-center">
                    <label className="flex items-center space-x-2 cursor-pointer">
                      <input
                        type="checkbox"
                        name="requires_parts_order"
                        checked={formData.requires_parts_order}
                        onChange={handleChange}
                        className="w-5 h-5 text-primary focus:ring-primary border-gray-300 rounded"
                      />
                      <span className="text-sm font-medium text-gray-900 dark:text-white">Parts needed?</span>
                    </label>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-6">
              <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">Pricing & Parts</h2>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Total Price (£)
                  </label>
                  <input
                    type="number"
                    name="price_total"
                    value={formData.price_total}
                    onChange={handleChange}
                    required={false}
                    step="0.01"
                    min="0"
                    className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    placeholder="Optional - can be added later"
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
          )}

          {/* Passcode Requirement Section */}
          {!quickWalkInMode ? (
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
          ) : (
            <div className="bg-blue-50 dark:bg-blue-900/20 border-2 border-blue-300 dark:border-blue-700 rounded-xl p-4">
              <p className="text-sm text-blue-900 dark:text-blue-100 flex items-center gap-2">
                <Zap className="h-4 w-4" />
                <strong>Quick Mode:</strong> Passcode set to "Not Required" by default - Customer can provide if needed on their screen
              </p>
            </div>
          )}

          {!quickWalkInMode && (
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
          )}

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
    </div>
  )
}
