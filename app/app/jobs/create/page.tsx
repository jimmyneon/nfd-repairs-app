'use client'

import { useState, useEffect, Suspense } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { ArrowLeft, Home, Plus, Loader2, CheckCircle, Search, Zap, Smartphone, Tablet, Laptop, Monitor, Wrench, Battery, Zap as Lightning, Droplet, Power, Circle, AlertCircle, Trash2, UserSearch, X, Shield, Send } from 'lucide-react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import QuoteLookupModal from '@/components/QuoteLookupModal'
import CustomerSearchModal from '@/components/CustomerSearchModal'
import FormErrorToast from '@/components/FormErrorToast'
import { getIssuesForDeviceType, saveCustomIssue, getCustomIssues } from '@/lib/device-issues'

function CreateJobContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = createClient()
  const jobId = searchParams.get('jobId')
  
  const [loading, setLoading] = useState(false)
  const [showMakeOther, setShowMakeOther] = useState(false)
  const [showIssueOther, setShowIssueOther] = useState(false)
  const [showQuoteLookup, setShowQuoteLookup] = useState(false)
  const [showCustomerSearch, setShowCustomerSearch] = useState(false)
  const [quickWalkInMode, setQuickWalkInMode] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('quickWalkInMode')
      return saved === 'true'
    }
    return false
  })
  const [superQuickMode, setSuperQuickMode] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('superQuickMode')
      return saved === 'true'
    }
    return false
  })
  
  const [customerName, setCustomerName] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [isWarranty, setIsWarranty] = useState(false)
  const [sendCompleteLaterSms, setSendCompleteLaterSms] = useState(false)
  
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

  // Restore form state from sessionStorage on mount (survives back navigation)
  useEffect(() => {
    if (typeof window !== 'undefined' && !jobId) {
      // Check for warranty ticket params (from warranty ticket page)
      const warrantyTicketId = searchParams.get('warranty_ticket_id')
      if (warrantyTicketId) {
        setCustomerName(searchParams.get('customer_name') || '')
        setCustomerPhone(searchParams.get('customer_phone') || '')
        setFormData(prev => ({
          ...prev,
          device_model: searchParams.get('device_model') || '',
          issue: searchParams.get('issue') || '',
        }))
        setIsWarranty(true)
        return
      }

      // Check for enquiry params (from enquiries page "Transfer to Job")
      const fromEnquiry = searchParams.get('from_enquiry')
      if (fromEnquiry === '1') {
        setCustomerName(searchParams.get('customer_name') || '')
        setCustomerPhone(searchParams.get('customer_phone') || '')
        setFormData(prev => ({
          ...prev,
          device_make: searchParams.get('device_make') || '',
          device_model: searchParams.get('device_model') || '',
          issue: searchParams.get('issue') || '',
          price_total: searchParams.get('quoted_price') || '',
        }))
        return
      }

      const savedForm = sessionStorage.getItem('job_create_form_state')
      if (savedForm) {
        try {
          const saved = JSON.parse(savedForm)
          if (saved.formData) setFormData(saved.formData)
          if (saved.customerName) setCustomerName(saved.customerName)
          if (saved.customerPhone) setCustomerPhone(saved.customerPhone)
          if (saved.quickWalkInMode !== undefined) setQuickWalkInMode(saved.quickWalkInMode)
          if (saved.superQuickMode !== undefined) setSuperQuickMode(saved.superQuickMode)
        } catch (e) {
          // Ignore parse errors
        }
      }
    }
  }, [])
  
  // Advanced override options for importing old jobs
  const [showAdvancedOptions, setShowAdvancedOptions] = useState(false)
  const [overrideInitialStatus, setOverrideInitialStatus] = useState(false)
  const [initialStatus, setInitialStatus] = useState('RECEIVED')
  const [skipInitialSMS, setSkipInitialSMS] = useState(false)
  
  // Validation errors
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({})
  const [showValidationSummary, setShowValidationSummary] = useState(false)

  // Save quick mode state to localStorage whenever it changes
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('quickWalkInMode', String(quickWalkInMode))
    }
  }, [quickWalkInMode])
  
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('superQuickMode', String(superQuickMode))
    }
  }, [superQuickMode])

  // Load existing job data if jobId is provided (for completing onboarding)
  useEffect(() => {
    if (jobId) {
      loadExistingJob(jobId)
    }
  }, [jobId])

  const loadExistingJob = async (id: string) => {
    setLoading(true)
    const { data: job, error } = await supabase
      .from('jobs')
      .select('*')
      .eq('id', id)
      .single()

    if (!error && job) {
      // Pre-fill form with existing job data
      setFormData({
        device_type: job.device_type || '',
        device_make: job.device_make || '',
        device_model: job.device_model || '',
        issue: job.issue || '',
        description: job.description || '',
        repair_type: job.repair_type || '',
        technician_notes: job.technician_notes || '',
        price_total: job.price_total?.toString() || '',
        requires_parts_order: job.parts_required || false,
        device_left_with_us: true, // They're completing onboarding in-shop
        passcode_requirement: 'not_required',
        linked_quote_id: job.quote_request_id || null,
      })
    }
    setLoading(false)
  }

  // Device type options
  const deviceTypes = [
    { value: 'phone', label: 'Mobile Phone' },
    { value: 'tablet', label: 'Tablet' },
    { value: 'laptop', label: 'Laptop' },
    { value: 'desktop', label: 'Desktop PC' },
    { value: 'console', label: 'Gaming Console' },
    { value: 'watch', label: 'Smartwatch / Wearable' },
    { value: 'other', label: 'Other' },
  ]

  // Common makes by device type
  const makesByType: Record<string, string[]> = {
    phone: ['Apple', 'Samsung', 'Google', 'OnePlus', 'Huawei', 'Motorola', 'Nokia', 'Sony', 'Xiaomi', 'Oppo', 'Other'],
    tablet: ['Apple', 'Samsung', 'Amazon', 'Lenovo', 'Microsoft', 'Huawei', 'Other'],
    laptop: ['Apple', 'Dell', 'HP', 'Lenovo', 'Asus', 'Acer', 'Microsoft', 'MSI', 'Razer', 'Other'],
    desktop: ['Dell', 'HP', 'Lenovo', 'Asus', 'Acer', 'Custom Build', 'Other'],
    console: ['Sony PlayStation', 'Microsoft Xbox', 'Nintendo Switch', 'Nintendo', 'Other'],
    watch: ['Apple', 'Samsung', 'Garmin', 'Fitbit', 'Google', 'Amazfit', 'Other'],
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

  // Common issue presets with colors - used for quick walk-in mode buttons
  const commonIssuePresets = [
    { label: 'Screen', icon: Smartphone, value: 'Screen Replacement', color: 'bg-red-600 hover:bg-red-700' },
    { label: 'Battery', icon: Battery, value: 'Battery Replacement', color: 'bg-green-600 hover:bg-green-700' },
    { label: 'Charging Port', icon: Lightning, value: 'Charging Port Replacement', color: 'bg-yellow-600 hover:bg-yellow-700' },
    { label: 'Water Damage', icon: Droplet, value: 'Water Damage', color: 'bg-blue-600 hover:bg-blue-700' },
    { label: 'Not Charging', icon: Power, value: 'Not Charging', color: 'bg-orange-600 hover:bg-orange-700' },
    { label: 'Black Screen', icon: Circle, value: 'Black Screen', color: 'bg-gray-700 hover:bg-gray-800' },
  ]

  // Dynamic issue list based on selected device type
  // Falls back to default list when no device type selected
  const currentIssues = getIssuesForDeviceType(formData.device_type || 'other')

  const handleQuickPreset = (preset: typeof quickDevicePresets[0]) => {
    setFormData({
      ...formData,
      device_type: preset.device_type,
      device_make: preset.device_make,
      device_model: preset.device_model,
    })
    
    // Auto-scroll to device model input so user can adjust the model name
    setTimeout(() => {
      const modelInput = document.querySelector('input[name="device_model"]')
      if (modelInput) {
        modelInput.scrollIntoView({ behavior: 'smooth', block: 'center' })
        // Focus the input so user can immediately type
        ;(modelInput as HTMLInputElement).focus()
      }
    }, 100)
  }

  const handleIssuePreset = (issueValue: string) => {
    setFormData({
      ...formData,
      issue: issueValue,
    })
    setShowIssueOther(false)
    
    // Auto-scroll to price/next section
    setTimeout(() => {
      const priceSection = document.querySelector('input[name="price_total"]')
      if (priceSection) {
        priceSection.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }
    }, 100)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    // Validate required fields
    const errors: Record<string, string> = {}
    
    // Super Quick Mode: Only validate name and phone
    if (superQuickMode) {
      if (!customerName.trim()) {
        errors.customerName = 'Customer name is required'
      }
      if (!customerPhone.trim()) {
        errors.customerPhone = 'Customer phone is required'
      }
    } else {
      // Normal validation
      if (!formData.device_type) {
        errors.device_type = 'Device type is required'
      }
      
      if (!formData.device_make && formData.device_type !== 'other') {
        errors.device_make = 'Device make is required'
      }
      
      if (!quickWalkInMode && !formData.device_model) {
        errors.device_model = 'Device model is required'
      }
      
      if (!formData.issue) {
        errors.issue = 'Issue is required'
      }
    }
    
    // If there are validation errors, show them and prevent submission
    if (Object.keys(errors).length > 0) {
      setValidationErrors(errors)
      setShowValidationSummary(true)
      
      // Scroll to the first error field
      const firstErrorField = Object.keys(errors)[0]
      const errorElement = document.querySelector(`[name="${firstErrorField}"]`)
      if (errorElement) {
        errorElement.scrollIntoView({ behavior: 'smooth', block: 'center' })
        // Focus the field after scrolling
        setTimeout(() => {
          (errorElement as HTMLElement).focus()
        }, 500)
      }
      
      // Hide validation summary after 10 seconds
      setTimeout(() => {
        setShowValidationSummary(false)
      }, 10000)
      
      return
    }
    
    // Clear any previous validation errors
    setValidationErrors({})
    setShowValidationSummary(false)
    
    // Save custom issue for future suggestions if user typed one under "Other"
    if (showIssueOther && formData.issue && formData.issue !== 'Other') {
      saveCustomIssue(formData.device_type || 'other', formData.issue)
    }
    
    // Super Quick Mode: Create job immediately with minimal data
    if (superQuickMode) {
      setLoading(true)
      try {
        const response = await fetch('/api/jobs/create-v3', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            customer_name: customerName.trim(),
            customer_phone: customerPhone.trim(),
            customer_email: null,
            device_make: 'To be added',
            device_model: 'To be added',
            issue: 'To be assessed',
            description: 'Quick intake - details to be added from job page',
            price_total: 0,
            quoted_price: 0,
            requires_parts_order: false,
            source: 'staff_manual',
            device_password: null,
            password_not_applicable: true,
            passcode_requirement: 'not_required',
            passcode_method: 'not_applicable',
            customer_signature: null,
            terms_accepted: true,
            onboarding_completed: false,
            device_in_shop: true,
            linked_quote_id: null,
            skip_sms: sendCompleteLaterSms,
            quick_intake: true,
          }),
        })

        const result = await response.json()

        if (response.ok) {
          // If sendCompleteLaterSms is on, send custom SMS with completion link
          if (sendCompleteLaterSms && result.tracking_token) {
            const completionUrl = `${window.location.origin}/walk-in/complete/${result.tracking_token}`
            const firstName = customerName.trim().split(' ')[0]
            const smsMessage = `Hi ${firstName}, thanks for bringing your device to New Forest Device Repairs. Please use this link to complete your details when you're ready:\n\n${completionUrl}\n\nMany thanks,\nNew Forest Device Repairs`

            await fetch('/api/sms/send-custom', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                jobId: result.job_id,
                message: smsMessage,
              }),
            })
          }

          // Clear form and session state so next job starts fresh
          setCustomerName('')
          setCustomerPhone('')
          setSendCompleteLaterSms(false)
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
            passcode_requirement: 'not_required',
            linked_quote_id: null,
          })
          if (typeof window !== 'undefined') {
            sessionStorage.removeItem('job_create_form_state')
            sessionStorage.removeItem('quote_customer_data')
            sessionStorage.removeItem('customer_confirm_wizard')
          }
          // Show success and stay on page for next customer
          alert(`Job created! Ref: ${result.job_ref}\n\n${sendCompleteLaterSms ? 'SMS sent to customer with link to complete details.' : 'Customer will receive booking confirmation SMS.'}`)
          setLoading(false)
        } else {
          alert(`Failed to create job: ${result.error}`)
          setLoading(false)
        }
      } catch (error) {
        console.error('Error creating job:', error)
        alert('Failed to create job. Please try again.')
        setLoading(false)
      }
      return
    }
    
    // Store advanced options in sessionStorage for customer-confirm page
    if (overrideInitialStatus || skipInitialSMS) {
      sessionStorage.setItem('job_creation_overrides', JSON.stringify({
        initial_status: overrideInitialStatus ? initialStatus : null,
        skip_initial_sms: skipInitialSMS,
      }))
    } else {
      sessionStorage.removeItem('job_creation_overrides')
    }
    
    // Save form state to sessionStorage so back button doesn't lose data
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('job_create_form_state', JSON.stringify({
        formData,
        customerName,
        customerPhone,
        quickWalkInMode,
        superQuickMode,
      }))
    }

    // Navigate to customer confirmation page with job data
    const params = new URLSearchParams({
      device_type: formData.device_type,
      device_make: formData.device_make,
      device_model: formData.device_model,
      issue: formData.issue,
      description: formData.description || '',
      price_total: isWarranty ? '0' : (formData.price_total || '0'),
      requires_parts_order: String(formData.requires_parts_order),
      device_left_with_us: String(formData.device_left_with_us),
      passcode_requirement: formData.passcode_requirement,
      linked_quote_id: formData.linked_quote_id || '',
      is_warranty: String(isWarranty),
    })

    const warrantyTicketId = searchParams.get('warranty_ticket_id')
    if (warrantyTicketId) {
      params.set('linked_warranty_ticket_id', warrantyTicketId)
    }
    
    // If completing onboarding for existing job, pass jobId
    if (jobId) {
      params.set('jobId', jobId)
    }
    
    router.push(`/app/jobs/create/customer-confirm?${params.toString()}`)
  }

  const inferDeviceType = (make: string, model: string): string => {
    const combined = `${make} ${model}`.toLowerCase().trim()
    if (!combined) return ''
    
    if (combined.includes('iphone') || combined.includes('samsung') || combined.includes('pixel') || 
        combined.includes('huawei') || combined.includes('xiaomi') || combined.includes('motorola') ||
        combined.includes('nokia') || combined.includes('oneplus') || combined.includes('oppo') ||
        combined.includes('phone') || combined.includes('galaxy')) {
      return 'phone'
    } else if (combined.includes('ipad') || combined.includes('tablet') || combined.includes('tab ')) {
      return 'tablet'
    } else if (combined.includes('macbook') || combined.includes('laptop') || combined.includes('notebook') ||
               combined.includes('chromebook') || combined.includes('thinkpad') || combined.includes('dell') ||
               combined.includes('hp ') || combined.includes('lenovo') || combined.includes('asus') ||
               combined.includes('laptop')) {
      return 'laptop'
    } else if (combined.includes('playstation') || combined.includes('xbox') || combined.includes('nintendo') ||
               combined.includes('switch') || combined.includes('ps4') || combined.includes('ps5') ||
               combined.includes('console')) {
      return 'console'
    } else if (combined.includes('watch') || combined.includes('fitbit')) {
      return 'watch'
    } else if (combined.includes('imac') || combined.includes('desktop') || combined.includes('monitor') ||
               combined.includes('pc ')) {
      return 'desktop'
    }
    return ''
  }

  // Infer device make from model name when make is missing
  // e.g. "iPhone 14" -> "Apple", "iPad Pro" -> "Apple", "Galaxy S23" -> "Samsung"
  const inferDeviceMake = (make: string, model: string): string => {
    if (make && make.trim() && make !== 'Unknown') return make
    const modelLower = (model || '').toLowerCase().trim()
    if (!modelLower) return make || ''
    
    if (modelLower.includes('iphone') || modelLower.includes('ipad') || 
        modelLower.includes('macbook') || modelLower.includes('imac') ||
        modelLower.includes('apple watch') || modelLower.includes('airpods')) {
      return 'Apple'
    }
    if (modelLower.includes('galaxy') || modelLower.includes('samsung')) {
      return 'Samsung'
    }
    if (modelLower.includes('pixel')) {
      return 'Google'
    }
    if (modelLower.includes('playstation') || modelLower.includes('ps4') || modelLower.includes('ps5')) {
      return 'Sony PlayStation'
    }
    if (modelLower.includes('xbox')) {
      return 'Microsoft Xbox'
    }
    if (modelLower.includes('nintendo') || modelLower.includes('switch')) {
      return 'Nintendo'
    }
    if (modelLower.includes('thinkpad')) {
      return 'Lenovo'
    }
    if (modelLower.includes('surface')) {
      return 'Microsoft'
    }
    return make || ''
  }

  const handleQuoteSelect = (quote: any) => {
    // Auto-infer device type from device make AND model if not provided
    const inferredDeviceType = quote.device_type || inferDeviceType(quote.device_make || '', quote.device_model || '')
    // Auto-infer device make from model if make is missing (e.g. "iPhone 14" -> "Apple")
    const inferredMake = inferDeviceMake(quote.device_make || '', quote.device_model || '')

    const availableMakes = makesByType[inferredDeviceType] || []
    const matchedMake = availableMakes.find(m => m.toLowerCase() === inferredMake?.toLowerCase())
    if (inferredMake && !matchedMake) setShowMakeOther(true)
    const availableIssues = getIssuesForDeviceType(inferredDeviceType || 'other')
    const quoteIssue = (quote.issue || '').toLowerCase().trim()
    // Try exact match first, then fuzzy match for common variations
    let matchedIssue = availableIssues.find(i => i.toLowerCase() === quoteIssue)
    if (!matchedIssue && quoteIssue) {
      const fuzzyMap: Record<string, string> = {
        'screen': 'Screen Replacement', 'cracked screen': 'Screen Replacement',
        'broken screen': 'Screen Replacement', 'screen repair': 'Screen Repair',
        'battery': 'Battery Replacement', 'battery replacement': 'Battery Replacement',
        'charging': 'Not Charging', 'charging port': 'Charging Port Replacement',
        'not charging': 'Not Charging', 'water': 'Water Damage',
        'no power': 'No Power', 'black screen': 'Black Screen',
        'diagnostic': 'Diagnostics', 'diagnostics': 'Diagnostics',
      }
      const fuzzyMatch = Object.entries(fuzzyMap).find(([key]) => quoteIssue.includes(key))
      if (fuzzyMatch) {
        matchedIssue = availableIssues.find(i => i === fuzzyMatch[1])
      }
    }
    if (quote.issue && !matchedIssue) setShowIssueOther(true)

    setFormData({
      ...formData,
      device_type: inferredDeviceType,
      device_make: matchedMake || inferredMake,
      device_model: quote.device_model || '',
      issue: matchedIssue || quote.issue || '',
      description: quote.description || '',
      price_total: quote.quoted_price ? String(quote.quoted_price) : (quote.price_total ? String(quote.price_total) : ''),
      linked_quote_id: quote.quote_request_id,
    })

    // Set customer name and phone so they're visible on the form
    setCustomerName(quote.customer_name || '')
    setCustomerPhone(quote.customer_phone || '')
    
    // Store customer data for confirmation page
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('quote_customer_data', JSON.stringify({
        customer_name: quote.customer_name,
        customer_phone: quote.customer_phone,
        customer_email: quote.customer_email || '',
      }))
    }
    
    setShowQuoteLookup(false)
  }

  const handleCustomerSelect = (customerData: any) => {
    const inferredDeviceType = customerData.device_type || inferDeviceType(customerData.device_make || '', customerData.device_model || '')
    const inferredMake = inferDeviceMake(customerData.device_make || '', customerData.device_model || '')

    const availableMakes = makesByType[inferredDeviceType] || []
    const matchedMake = availableMakes.find(m => m.toLowerCase() === inferredMake?.toLowerCase())
    if (inferredMake && !matchedMake) setShowMakeOther(true)
    const availableIssues = getIssuesForDeviceType(inferredDeviceType || 'other')
    const matchedIssue = availableIssues.find(i => i.toLowerCase() === (customerData.issue || '').toLowerCase())
    if (customerData.issue && !matchedIssue) setShowIssueOther(true)

    setFormData({
      ...formData,
      device_type: inferredDeviceType || formData.device_type,
      device_make: matchedMake || inferredMake || formData.device_make,
      device_model: customerData.device_model || formData.device_model,
      issue: matchedIssue || customerData.issue || formData.issue,
      description: customerData.description || formData.description,
      price_total: customerData.price_total || formData.price_total,
      requires_parts_order: customerData.requires_parts_order ?? formData.requires_parts_order,
    })

    // Set customer name and phone so they're visible on the form
    setCustomerName(customerData.customer_name || '')
    setCustomerPhone(customerData.customer_phone || '')
    
    // Store customer data for confirmation page
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('quote_customer_data', JSON.stringify({
        customer_name: customerData.customer_name,
        customer_phone: customerData.customer_phone,
        customer_email: customerData.customer_email || '',
      }))
    }
    
    setShowCustomerSearch(false)
  }


  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target
    const checked = (e.target as HTMLInputElement).checked
    
    // Clear validation error for this field when user starts typing
    if (validationErrors[name]) {
      setValidationErrors(prev => {
        const newErrors = { ...prev }
        delete newErrors[name]
        return newErrors
      })
      // Hide summary if no more errors
      if (Object.keys(validationErrors).length === 1) {
        setShowValidationSummary(false)
      }
    }
    
    // Reset make when device type changes
    if (name === 'device_type') {
      setFormData(prev => ({
        ...prev,
        device_type: value,
        // For 'other' device type, auto-set make to N/A since it doesn't matter
        device_make: value === 'other' ? 'N/A' : '',
      }))
      setShowMakeOther(false)
      return
    }

    // Show "Other" input for make
    if (name === 'device_make') {
      // Keep the field visible if 'Other' is selected OR if we're already showing it and user is typing
      if (value === 'Other') {
        setShowMakeOther(true)
      } else if (!showMakeOther) {
        setShowMakeOther(false)
      }
    }

    // Show "Other" input for issue
    if (name === 'issue') {
      // Keep the field visible if 'Other' is selected OR if we're already showing it and user is typing
      if (value === 'Other') {
        setShowIssueOther(true)
      } else if (!showIssueOther) {
        setShowIssueOther(false)
      }
    }
    
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }))
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <header className="bg-white dark:bg-gray-800 shadow-sm sticky top-0 z-10">
        <div className="px-4 py-3">
          <div className="flex items-center justify-between mb-3">
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">Create New Job</h1>
            <Link href="/app/jobs" className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors" title="Home">
              <Home className="h-5 w-5 text-primary" />
            </Link>
          </div>
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => setShowCustomerSearch(true)} className="w-14 h-14 flex items-center justify-center rounded-xl bg-green-600 text-white hover:bg-green-700 transition-colors active:scale-90" title="Search Customers">
              <UserSearch className="h-6 w-6" />
            </button>
            <button type="button" onClick={() => setShowQuoteLookup(true)} className="w-14 h-14 flex items-center justify-center rounded-xl bg-blue-600 text-white hover:bg-blue-700 transition-colors active:scale-90" title="Search Quotes">
              <Search className="h-6 w-6" />
            </button>
            <button type="button" onClick={() => { if (confirm('Clear all form data?')) { setFormData({ device_type: '', device_make: '', device_model: '', issue: '', description: '', repair_type: '', technician_notes: '', price_total: '', requires_parts_order: false, device_left_with_us: true, passcode_requirement: 'not_required', linked_quote_id: null }); setCustomerName(''); setCustomerPhone(''); setValidationErrors({}); setShowValidationSummary(false); if (typeof window !== 'undefined') { sessionStorage.removeItem('job_create_form_state'); sessionStorage.removeItem('quote_customer_data'); sessionStorage.removeItem('job_creation_overrides'); sessionStorage.removeItem('customer_confirm_wizard') } } }} className="w-14 h-14 flex items-center justify-center rounded-xl bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-red-100 dark:hover:bg-red-900/30 hover:text-red-600 transition-colors active:scale-90 ml-auto" title="Clear Form">
              <Trash2 className="h-6 w-6" />
            </button>
          </div>
        </div>
      </header>

      <main className="p-4 max-w-2xl mx-auto">
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Mode toggles — perfectly square buttons */}
          <div className="flex gap-3 justify-center">
            <button
              type="button"
              onClick={() => { setSuperQuickMode(!superQuickMode); if (!superQuickMode) setQuickWalkInMode(false) }}
              className={`w-32 h-32 flex flex-col items-center justify-center gap-2 rounded-2xl border-2 transition-all active:scale-95 ${
                superQuickMode
                  ? 'bg-green-600 text-white border-green-600 shadow-md'
                  : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-700'
              }`}
            >
              <Zap className="h-8 w-8" />
              <span className="text-sm font-bold">Super Quick</span>
            </button>
            <button
              type="button"
              onClick={() => { if (!superQuickMode) setQuickWalkInMode(!quickWalkInMode) }}
              disabled={superQuickMode}
              className={`w-32 h-32 flex flex-col items-center justify-center gap-2 rounded-2xl border-2 transition-all active:scale-95 disabled:opacity-40 ${
                quickWalkInMode
                  ? 'bg-orange-500 text-white border-orange-500 shadow-md'
                  : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-700'
              }`}
            >
              <Zap className="h-8 w-8" />
              <span className="text-sm font-bold">Quick Walk-In</span>
            </button>
          </div>

          {/* Super Quick Mode - Name & Phone Only */}
          {superQuickMode && (
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-6">
              <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">Customer Details</h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Customer Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    name="customerName"
                    value={customerName}
                    onChange={(e) => {
                      setCustomerName(e.target.value)
                      if (validationErrors.customerName) {
                        setValidationErrors(prev => {
                          const newErrors = { ...prev }
                          delete newErrors.customerName
                          return newErrors
                        })
                      }
                    }}
                    className={`w-full px-4 py-3 border-2 rounded-xl focus:outline-none focus:ring-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-lg ${
                      validationErrors.customerName
                        ? 'border-red-500 dark:border-red-500 focus:ring-red-500'
                        : 'border-gray-300 dark:border-gray-600 focus:ring-primary'
                    }`}
                    placeholder="Enter customer name"
                    autoFocus
                  />
                  {validationErrors.customerName && (
                    <p className="mt-1 text-sm text-red-600 dark:text-red-400 flex items-center gap-1">
                      <AlertCircle className="h-4 w-4" />
                      {validationErrors.customerName}
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Phone Number <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="tel"
                    name="customerPhone"
                    value={customerPhone}
                    onChange={(e) => {
                      setCustomerPhone(e.target.value)
                      if (validationErrors.customerPhone) {
                        setValidationErrors(prev => {
                          const newErrors = { ...prev }
                          delete newErrors.customerPhone
                          return newErrors
                        })
                      }
                    }}
                    className={`w-full px-4 py-3 border-2 rounded-xl focus:outline-none focus:ring-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-lg ${
                      validationErrors.customerPhone
                        ? 'border-red-500 dark:border-red-500 focus:ring-red-500'
                        : 'border-gray-300 dark:border-gray-600 focus:ring-primary'
                    }`}
                    placeholder="07410 123 456"
                  />
                  {validationErrors.customerPhone && (
                    <p className="mt-1 text-sm text-red-600 dark:text-red-400 flex items-center gap-1">
                      <AlertCircle className="h-4 w-4" />
                      {validationErrors.customerPhone}
                    </p>
                  )}
                </div>

                <div className="bg-blue-50 dark:bg-blue-900/20 border-2 border-blue-200 dark:border-blue-800 rounded-xl p-4">
                  <p className="text-sm text-blue-900 dark:text-blue-100">
                    <strong>Quick Intake:</strong> Device details will be marked as "To be added". You can fill them in later from the job page.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setSendCompleteLaterSms(!sendCompleteLaterSms)}
                  className={`w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl font-semibold border-2 transition-colors ${
                    sendCompleteLaterSms
                      ? 'bg-primary text-white border-primary'
                      : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:border-primary'
                  }`}
                >
                  <Send className="h-5 w-5" />
                  {sendCompleteLaterSms ? 'Will send SMS to customer to complete later' : 'Send SMS to customer to complete later'}
                </button>
              </div>
            </div>
          )}

          {/* Device Quick Presets - Only visible in Quick Walk-In Mode */}
          {quickWalkInMode && !superQuickMode && (
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
                      className={`${preset.color} text-white rounded-xl font-bold shadow-md transition-all aspect-square flex flex-col items-center justify-center gap-1`}
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

          {!superQuickMode && (
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-6">
              <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">Device Details (Optional - if not using presets)</h2>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Device Type <span className="text-red-500">*</span>
                </label>
                <select
                  name="device_type"
                  value={formData.device_type}
                  onChange={handleChange}
                  required
                  className={`w-full px-4 py-3 border rounded-xl focus:outline-none focus:ring-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white ${
                    validationErrors.device_type 
                      ? 'border-red-500 dark:border-red-500 focus:ring-red-500' 
                      : 'border-gray-300 dark:border-gray-600 focus:ring-primary'
                  }`}
                >
                  <option value="">Select device type...</option>
                  {deviceTypes.map(type => (
                    <option key={type.value} value={type.value}>{type.label}</option>
                  ))}
                </select>
                {validationErrors.device_type && (
                  <p className="mt-1 text-sm text-red-600 dark:text-red-400 flex items-center gap-1">
                    <AlertCircle className="h-4 w-4" />
                    {validationErrors.device_type}
                  </p>
                )}
              </div>

              {formData.device_type && formData.device_type !== 'other' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Make <span className="text-red-500">*</span>
                  </label>
                  {!showMakeOther ? (
                    <select
                      name="device_make"
                      value={formData.device_make}
                      onChange={handleChange}
                      required
                      className={`w-full px-4 py-3 border rounded-xl focus:outline-none focus:ring-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white ${
                        validationErrors.device_make 
                          ? 'border-red-500 dark:border-red-500 focus:ring-red-500' 
                          : 'border-gray-300 dark:border-gray-600 focus:ring-primary'
                      }`}
                    >
                      <option value="">Select make...</option>
                      {makesByType[formData.device_type]?.map(make => (
                        <option key={make} value={make}>{make}</option>
                      ))}
                    </select>
                  ) : (
                    <div className="space-y-2">
                      <input
                        type="text"
                        name="device_make"
                        value={formData.device_make === 'Other' ? '' : formData.device_make}
                        onChange={handleChange}
                        placeholder="Enter make..."
                        required
                        autoFocus
                        className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          setShowMakeOther(false)
                          setFormData(prev => ({ ...prev, device_make: '' }))
                        }}
                        className="text-sm text-primary hover:underline"
                      >
                        ← Back to dropdown
                      </button>
                    </div>
                  )}
                  {validationErrors.device_make && (
                    <p className="mt-1 text-sm text-red-600 dark:text-red-400 flex items-center gap-1">
                      <AlertCircle className="h-4 w-4" />
                      {validationErrors.device_make}
                    </p>
                  )}
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  {formData.device_type === 'other' ? 'Device Name' : 'Model'} {!quickWalkInMode && <span className="text-red-500">*</span>}
                </label>
                <input
                  type="text"
                  name="device_model"
                  value={formData.device_model}
                  onChange={handleChange}
                  required={!quickWalkInMode}
                  className={`w-full px-4 py-3 border rounded-xl focus:outline-none focus:ring-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white ${
                    validationErrors.device_model 
                      ? 'border-red-500 dark:border-red-500 focus:ring-red-500' 
                      : 'border-gray-300 dark:border-gray-600 focus:ring-primary'
                  }`}
                  placeholder={formData.device_type === 'other' 
                    ? "e.g. Printer, Radio, Drone, TV..." 
                    : quickWalkInMode ? "Optional - or use preset above" : "e.g. iPhone 14 Pro, Galaxy S23, ThinkPad X1"}
                />
                {validationErrors.device_model && (
                  <p className="mt-1 text-sm text-red-600 dark:text-red-400 flex items-center gap-1">
                    <AlertCircle className="h-4 w-4" />
                    {validationErrors.device_model}
                  </p>
                )}
              </div>

              {/* Common Issue Presets - Only in Quick Mode */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                  Issue <span className="text-red-500">*</span>{quickWalkInMode ? ' - Quick Select' : ''}
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
                            className={`${preset.color} text-white rounded-xl font-bold shadow-md transition-all aspect-square flex flex-col items-center justify-center gap-1 ${
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
                {!showIssueOther ? (
                  <select
                    name="issue"
                    value={formData.issue}
                    onChange={handleChange}
                    required
                    className={`w-full px-4 py-3 border rounded-xl focus:outline-none focus:ring-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white ${
                      validationErrors.issue 
                        ? 'border-red-500 dark:border-red-500 focus:ring-red-500' 
                        : 'border-gray-300 dark:border-gray-600 focus:ring-primary'
                    }`}
                  >
                    <option value="">Select issue...</option>
                    {currentIssues.map(issue => (
                      <option key={issue} value={issue}>{issue}</option>
                    ))}
                  </select>
                ) : (
                  <div className="space-y-2">
                    <input
                      type="text"
                      name="issue"
                      value={formData.issue === 'Other' ? '' : formData.issue}
                      onChange={handleChange}
                      placeholder="Describe the issue..."
                      required
                      autoFocus
                      list="custom-issue-suggestions"
                      className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    />
                    <datalist id="custom-issue-suggestions">
                      {getCustomIssues(formData.device_type || 'other').map((suggestion, idx) => (
                        <option key={idx} value={suggestion} />
                      ))}
                    </datalist>
                    {getCustomIssues(formData.device_type || 'other').length > 0 && (
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        Suggestions shown from previous entries
                      </p>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setShowIssueOther(false)
                        setFormData(prev => ({ ...prev, issue: '' }))
                      }}
                      className="text-sm text-primary hover:underline"
                    >
                      ← Back to dropdown
                    </button>
                  </div>
                )}
                {validationErrors.issue && (
                  <p className="mt-1 text-sm text-red-600 dark:text-red-400 flex items-center gap-1">
                    <AlertCircle className="h-4 w-4" />
                    {validationErrors.issue}
                  </p>
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
          )}

          {!superQuickMode && (
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-5">
              <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-3">
                {isWarranty ? 'Warranty Repair' : (quickWalkInMode ? 'Price & Options' : 'Pricing & Parts')}
              </h2>
              <div className="space-y-3">
                <button
                  type="button"
                  onClick={() => setIsWarranty(!isWarranty)}
                  className={`w-full py-3 rounded-xl border-2 font-semibold text-sm transition-all active:scale-95 flex items-center justify-center gap-2 ${
                    isWarranty
                      ? 'border-green-500 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300'
                      : 'border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400'
                  }`}
                >
                  <Shield className="h-5 w-5" />
                  {isWarranty ? 'Warranty Repair — No Charge' : 'Mark as Warranty Repair'}
                </button>

                {!isWarranty && (
                  <div>
                    <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                      {quickWalkInMode ? 'Price (£)' : 'Total Price (£)'}
                    </label>
                    <input
                      type="number"
                      name="price_total"
                      value={formData.price_total}
                      onChange={handleChange}
                      required={false}
                      step="0.01"
                      min="0"
                      className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary bg-white dark:bg-gray-700 text-gray-900 dark:text-white font-semibold text-lg"
                      placeholder={quickWalkInMode ? "Add later" : "Can be added later"}
                    />
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => setFormData(prev => ({ ...prev, requires_parts_order: !prev.requires_parts_order }))}
                  className={`w-full py-3 rounded-xl border-2 font-semibold text-sm transition-all active:scale-95 flex items-center justify-center gap-2 ${
                    formData.requires_parts_order
                      ? 'border-purple-400 bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-300'
                      : 'border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400'
                  }`}
                >
                  <Wrench className="h-5 w-5" />
                  {formData.requires_parts_order ? 'Parts Needed (auto-orders in 1hr)' : 'Mark as Parts Needed'}
                </button>
                {formData.requires_parts_order && (
                  <p className="text-xs text-purple-600 dark:text-purple-400 text-center">
                    Status will auto-change to &quot;Parts Ordered&quot; in 1 hour and notify the customer.
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Passcode Requirement Section */}
          {!superQuickMode && (!quickWalkInMode ? (
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
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-6">
              <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">Passcode Requirement</h2>
              <div className="bg-blue-50 dark:bg-blue-900/20 border-2 border-blue-300 dark:border-blue-700 rounded-xl p-3 mb-4">
                <p className="text-xs text-blue-900 dark:text-blue-100 flex items-center gap-2">
                  <Zap className="h-4 w-4" />
                  <strong>Quick Mode:</strong> Pre-set to "Not Required" - change if needed
                </p>
              </div>
              
              <div className="space-y-2">
                <label className="flex items-center space-x-3 p-3 border-2 border-green-200 dark:border-green-700 bg-green-50 dark:bg-green-900/20 rounded-xl cursor-pointer hover:bg-green-100 dark:hover:bg-green-900/30 transition-colors">
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
          ))}

          {!superQuickMode && !quickWalkInMode && (
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
                
                <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-3 border-2 border-blue-200 dark:border-blue-800">
                  <p className="text-xs text-blue-900 dark:text-blue-100">
                    Hand the device to the customer after pressing "Switch to Customer Screen".
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Advanced Options - For importing old jobs */}
          {!superQuickMode && (
            <div className="bg-gradient-to-br from-orange-50 to-yellow-50 dark:from-orange-900/20 dark:to-yellow-900/20 rounded-2xl shadow-lg border-2 border-orange-200 dark:border-orange-700 overflow-hidden">
            <button
              type="button"
              onClick={() => setShowAdvancedOptions(!showAdvancedOptions)}
              className="w-full p-4 flex items-center justify-between hover:bg-orange-100/50 dark:hover:bg-orange-900/30 transition-colors"
            >
              <div className="flex items-center gap-2">
                <Wrench className="h-5 w-5 text-orange-600 dark:text-orange-400" />
                <h3 className="font-bold text-gray-900 dark:text-white">Advanced Options</h3>
                <span className="text-xs bg-orange-200 dark:bg-orange-800 text-orange-900 dark:text-orange-100 px-2 py-1 rounded-full">For importing old jobs</span>
              </div>
              <svg className={`h-5 w-5 text-gray-600 dark:text-gray-400 transition-transform ${showAdvancedOptions ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            
            {showAdvancedOptions && (
              <div className="p-6 pt-0 space-y-4 border-t-2 border-orange-200 dark:border-orange-700">
                <p className="text-sm text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 p-3 rounded-lg border border-orange-200 dark:border-orange-700">
                  <strong>Use these options when adding old jobs to the system.</strong> This prevents confusing customers with notifications about jobs they already know about.
                </p>
                
                {/* Override Initial Status */}
                <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border-2 border-gray-200 dark:border-gray-600">
                  <div className="flex items-start space-x-3 mb-3">
                    <input
                      type="checkbox"
                      checked={overrideInitialStatus}
                      onChange={(e) => setOverrideInitialStatus(e.target.checked)}
                      className="w-5 h-5 text-orange-600 focus:ring-orange-500 border-gray-300 rounded mt-0.5"
                      id="override_status"
                    />
                    <label htmlFor="override_status" className="text-sm text-gray-900 dark:text-white cursor-pointer flex-1">
                      <strong>Override Initial Status</strong>
                      <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                        Set a custom starting status instead of automatic RECEIVED/QUOTE_APPROVED
                      </p>
                    </label>
                  </div>
                  
                  {overrideInitialStatus && (
                    <select
                      value={initialStatus}
                      onChange={(e) => setInitialStatus(e.target.value)}
                      className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    >
                      <option value="QUOTE_APPROVED">Quote Approved</option>
                      <option value="RECEIVED">Received</option>
                      <option value="AWAITING_DEPOSIT">Awaiting Deposit</option>
                      <option value="PARTS_ORDERED">Parts Ordered</option>
                      <option value="PARTS_ARRIVED">Parts Arrived</option>
                      <option value="IN_REPAIR">In Repair</option>
                      <option value="READY_TO_COLLECT">Ready to Collect</option>
                      <option value="COLLECTED">Collected</option>
                      <option value="COMPLETED">Completed</option>
                    </select>
                  )}
                </div>
                
                {/* Skip Initial Notifications */}
                <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border-2 border-gray-200 dark:border-gray-600">
                  <div className="flex items-start space-x-3">
                    <input
                      type="checkbox"
                      checked={skipInitialSMS}
                      onChange={(e) => setSkipInitialSMS(e.target.checked)}
                      className="w-5 h-5 text-orange-600 focus:ring-orange-500 border-gray-300 rounded mt-0.5"
                      id="skip_sms"
                    />
                    <label htmlFor="skip_sms" className="text-sm text-gray-900 dark:text-white cursor-pointer">
                      <strong>Skip Initial Notifications (SMS & Email)</strong>
                      <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                        Don't send SMS or email when creating this job (prevents confusing customers about old jobs). <strong className="text-orange-600 dark:text-orange-400">Future status updates will still send both SMS and email notifications normally.</strong>
                      </p>
                    </label>
                  </div>
                </div>
              </div>
            )}
            </div>
          )}

          {/* Validation errors shown as bottom toast */}

          <div className="flex gap-3">
            <Link
              href="/app/jobs"
              className="w-14 h-14 flex items-center justify-center bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-900 dark:text-white font-bold rounded-xl transition-all shadow-lg active:scale-95 flex-shrink-0"
              title="Cancel"
            >
              <X className="h-5 w-5" />
            </Link>
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
              ) : superQuickMode ? (
                <>
                  <CheckCircle className="h-5 w-5" />
                  <span>Create Job</span>
                </>
              ) : (
                <>
                  <CheckCircle className="h-5 w-5" />
                  <span>Switch to Customer Screen</span>
                </>
              )}
            </button>
          </div>
        </form>
      </main>

      <QuoteLookupModal
        isOpen={showQuoteLookup}
        onClose={() => setShowQuoteLookup(false)}
        onSelectQuote={handleQuoteSelect}
      />

      <CustomerSearchModal
        isOpen={showCustomerSearch}
        onClose={() => setShowCustomerSearch(false)}
        onSelectCustomer={handleCustomerSelect}
      />

      <FormErrorToast
        errors={validationErrors}
        show={showValidationSummary}
        onClose={() => setShowValidationSummary(false)}
      />
    </div>
  )
}

export default function CreateJobPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    }>
      <CreateJobContent />
    </Suspense>
  )
}
