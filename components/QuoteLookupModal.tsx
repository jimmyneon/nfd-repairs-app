'use client'

import { useState } from 'react'
import { X, Search, FileText, Phone, User, Loader2, CheckCircle } from 'lucide-react'

interface Quote {
  id: string
  quote_request_id: string
  customer_name: string
  customer_phone: string
  customer_email: string | null
  device_type: string | null
  device_make: string
  device_model: string
  issue: string
  description: string | null
  quoted_price: number | null
  status: string
  created_at: string
}

interface QuoteLookupModalProps {
  isOpen: boolean
  onClose: () => void
  onSelectQuote: (quote: Quote) => void
}

export default function QuoteLookupModal({ isOpen, onClose, onSelectQuote }: QuoteLookupModalProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [searchType, setSearchType] = useState<'all' | 'phone' | 'name' | 'quote_id'>('all')
  const [quotes, setQuotes] = useState<Quote[]>([])
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)

  if (!isOpen) return null

  const handleSearch = async () => {
    setLoading(true)
    setSearched(true)

    try {
      const params = new URLSearchParams()
      if (searchQuery.trim()) {
        params.append('q', searchQuery.trim())
      }
      params.append('type', searchType)

      const response = await fetch(`/api/quotes/search?${params.toString()}`)
      const result = await response.json()

      if (response.ok) {
        setQuotes(result.quotes || [])
      } else {
        console.error('Search failed:', result.error)
        alert(`Search failed: ${result.error}`)
      }
    } catch (error) {
      console.error('Search error:', error)
      alert('Failed to search quotes')
    } finally {
      setLoading(false)
    }
  }

  const handleSelectQuote = (quote: Quote) => {
    onSelectQuote(quote)
    onClose()
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleDateString('en-GB', { 
      day: '2-digit', 
      month: 'short', 
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        <div className="bg-gradient-to-r from-primary to-primary-dark p-6 text-white relative">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 text-white hover:bg-white/20 rounded-full p-2 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <FileText className="h-6 w-6" />
            Search Quotes
          </h2>
          <p className="text-sm text-white/90 mt-1">Find and convert existing quotes to jobs</p>
        </div>

        <div className="p-6 space-y-4">
          <div className="flex gap-3">
            <div className="flex-1">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                placeholder="Search by phone, name, or leave empty for all recent quotes..."
                className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              />
            </div>
            <select
              value={searchType}
              onChange={(e) => setSearchType(e.target.value as any)}
              className="px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            >
              <option value="all">All Fields</option>
              <option value="phone">Phone Only</option>
              <option value="name">Name Only</option>
              <option value="quote_id">Quote ID</option>
            </select>
            <button
              onClick={handleSearch}
              disabled={loading}
              className="px-6 py-3 bg-primary hover:bg-primary-dark text-white rounded-xl font-semibold disabled:opacity-50 transition-all shadow-lg flex items-center gap-2"
            >
              {loading ? (
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

          <div className="text-sm text-gray-600 dark:text-gray-400">
            💡 Tip: Leave search empty and click Search to see all recent unconverted quotes
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 pb-6">
          {!searched && (
            <div className="text-center py-12 text-gray-500 dark:text-gray-400">
              <FileText className="h-16 w-16 mx-auto mb-4 opacity-50" />
              <p>Enter search criteria and click Search to find quotes</p>
            </div>
          )}

          {searched && quotes.length === 0 && !loading && (
            <div className="text-center py-12 text-gray-500 dark:text-gray-400">
              <FileText className="h-16 w-16 mx-auto mb-4 opacity-50" />
              <p>No quotes found matching your search</p>
            </div>
          )}

          {quotes.length > 0 && (
            <div className="space-y-3">
              {quotes.map((quote) => (
                <div
                  key={quote.id}
                  className="bg-gray-50 dark:bg-gray-700 rounded-xl p-4 hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors cursor-pointer border-2 border-transparent hover:border-primary"
                  onClick={() => handleSelectQuote(quote)}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="font-semibold text-gray-900 dark:text-white text-lg">
                          {quote.customer_name}
                        </h3>
                        <span className="text-xs px-2 py-1 bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 rounded-full">
                          {quote.status}
                        </span>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                        <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
                          <Phone className="h-4 w-4" />
                          {quote.customer_phone}
                        </div>
                        
                        <div className="text-gray-600 dark:text-gray-400">
                          <strong>Device:</strong> {quote.device_make} {quote.device_model}
                        </div>
                        
                        <div className="text-gray-600 dark:text-gray-400">
                          <strong>Issue:</strong> {quote.issue}
                        </div>
                        
                        {quote.quoted_price && (
                          <div className="text-gray-600 dark:text-gray-400">
                            <strong>Quote:</strong> £{quote.quoted_price.toFixed(2)}
                          </div>
                        )}
                        
                        <div className="col-span-2 text-xs text-gray-500 dark:text-gray-500">
                          Created: {formatDate(quote.created_at)}
                        </div>
                      </div>
                    </div>
                    
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        handleSelectQuote(quote)
                      }}
                      className="ml-4 px-4 py-2 bg-primary hover:bg-primary-dark text-white rounded-lg font-semibold transition-all shadow-md flex items-center gap-2"
                    >
                      <CheckCircle className="h-4 w-4" />
                      Convert
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
