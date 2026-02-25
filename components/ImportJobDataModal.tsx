'use client'

import { useState } from 'react'
import { X, Upload, FileJson, AlertCircle, CheckCircle } from 'lucide-react'

interface ImportJobDataModalProps {
  onImport: (data: any) => void
  onClose: () => void
}

export default function ImportJobDataModal({ onImport, onClose }: ImportJobDataModalProps) {
  const [jsonInput, setJsonInput] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const sampleJSON = {
    customer_name: "John Smith",
    customer_phone: "+447410123456",
    customer_email: "john@example.com",
    device_type: "phone",
    device_make: "Apple",
    device_model: "iPhone 14 Pro",
    issue: "Screen Replacement",
    description: "Cracked screen from drop",
    price_total: 89.99,
    requires_parts_order: true,
    device_password: "1234",
    password_na: false,
    terms_accepted: true
  }

  const handleImport = () => {
    setError(null)
    setSuccess(false)

    try {
      const parsed = JSON.parse(jsonInput)
      
      // Validate required fields
      const requiredFields = ['customer_name', 'customer_phone', 'device_type', 'device_make', 'device_model', 'issue', 'price_total']
      const missingFields = requiredFields.filter(field => !parsed[field])
      
      if (missingFields.length > 0) {
        setError(`Missing required fields: ${missingFields.join(', ')}`)
        return
      }

      // Validate phone number format
      if (parsed.customer_phone && !parsed.customer_phone.startsWith('+')) {
        setError('Phone number must start with + (e.g., +447410123456)')
        return
      }

      // Validate price is a number
      if (isNaN(parseFloat(parsed.price_total))) {
        setError('price_total must be a valid number')
        return
      }

      // Convert booleans if they're strings
      if (typeof parsed.requires_parts_order === 'string') {
        parsed.requires_parts_order = parsed.requires_parts_order.toLowerCase() === 'true'
      }
      if (typeof parsed.password_na === 'string') {
        parsed.password_na = parsed.password_na.toLowerCase() === 'true'
      }
      if (typeof parsed.terms_accepted === 'string') {
        parsed.terms_accepted = parsed.terms_accepted.toLowerCase() === 'true'
      }

      setSuccess(true)
      setTimeout(() => {
        onImport(parsed)
        onClose()
      }, 500)

    } catch (err) {
      setError('Invalid JSON format. Please check your input and try again.')
    }
  }

  const loadSample = () => {
    setJsonInput(JSON.stringify(sampleJSON, null, 2))
    setError(null)
    setSuccess(false)
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b">
          <div className="flex items-center gap-3">
            <FileJson className="h-6 w-6 text-primary" />
            <h2 className="text-xl font-semibold text-gray-900">Import Job Data from JSON</h2>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* Instructions */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
            <h3 className="font-semibold text-blue-900 mb-2">How to use:</h3>
            <ol className="text-sm text-blue-800 space-y-1 list-decimal list-inside">
              <li>Take a photo of the paper form</li>
              <li>Use ChatGPT or OCR software to extract the data</li>
              <li>Ask it to format the data as JSON (use the sample below as a template)</li>
              <li>Paste the JSON here and click Import</li>
              <li>Review and edit the auto-filled form before submitting</li>
            </ol>
          </div>

          {/* Sample Template */}
          <div className="mb-4">
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-gray-700">Sample JSON Template:</label>
              <button
                onClick={loadSample}
                className="text-xs text-primary hover:text-primary-dark font-medium"
              >
                Load Sample
              </button>
            </div>
            <pre className="bg-gray-50 border border-gray-200 rounded p-3 text-xs overflow-x-auto">
{JSON.stringify(sampleJSON, null, 2)}
            </pre>
          </div>

          {/* JSON Input */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Paste JSON Data:
            </label>
            <textarea
              value={jsonInput}
              onChange={(e) => {
                setJsonInput(e.target.value)
                setError(null)
                setSuccess(false)
              }}
              className="w-full h-64 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent font-mono text-sm"
              placeholder="Paste your JSON data here..."
            />
          </div>

          {/* Error Message */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4 flex items-start gap-2">
              <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-red-900">Import Error</p>
                <p className="text-sm text-red-700">{error}</p>
              </div>
            </div>
          )}

          {/* Success Message */}
          {success && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-3 mb-4 flex items-start gap-2">
              <CheckCircle className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-green-900">Success!</p>
                <p className="text-sm text-green-700">Data imported successfully. Auto-filling form...</p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-6 border-t bg-gray-50">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-700 hover:text-gray-900 font-medium"
          >
            Cancel
          </button>
          <button
            onClick={handleImport}
            disabled={!jsonInput.trim()}
            className="px-6 py-2 bg-primary text-white rounded-lg hover:bg-primary-dark disabled:opacity-50 disabled:cursor-not-allowed font-medium flex items-center gap-2"
          >
            <Upload className="h-4 w-4" />
            Import Data
          </button>
        </div>
      </div>
    </div>
  )
}
