'use client'

import { useState, useEffect } from 'react'
import { Search, FileText, Phone, Loader2, CheckCircle } from 'lucide-react'
import { ENQUIRY_SEARCH_MAX_LENGTH } from '@/lib/enquiry-search'
import SlideUpPanel from './SlideUpPanel'

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
  original_created_at: string | null
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
  const [error, setError] = useState('')
  const [searchAttempt, setSearchAttempt] = useState(0)

  useEffect(() => {
    if (!isOpen) return

    const controller = new AbortController()
    const query = searchQuery.trim()
    setLoading(true)
    setError('')
    const debounceTimer = setTimeout(async () => {
      const params = query
        ? new URLSearchParams({ q: query, type: searchType })
        : new URLSearchParams({ limit: '5' })

      try {
        const response = await fetch(`/api/quotes/search?${params}`, { signal: controller.signal })
        if (!response.ok) {
          if (!controller.signal.aborted) {
            setError(response.status === 401 ? 'Sign in again to search quotes.' : 'Could not search quotes. Try again.')
          }
          return
        }
        const result = await response.json()
        if (!controller.signal.aborted) setQuotes(result.quotes || [])
      } catch {
        if (!controller.signal.aborted) setError('Could not search quotes. Try again.')
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }, query ? 300 : 0)

    return () => {
      clearTimeout(debounceTimer)
      controller.abort()
    }
  }, [searchQuery, searchType, isOpen, searchAttempt])

  if (!isOpen) return null

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
    <SlideUpPanel
      isOpen={isOpen}
      onClose={onClose}
      title="Search Quotes"
      icon={<FileText className="h-5 w-5 text-primary" />}
      minHeight="70vh"
    >
      <div className="flex flex-col h-full">
        <div className="pb-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex gap-2">
            <div className="flex-1">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                aria-label="Search quotes by name, phone, device, repair or reference"
                placeholder="Name, phone, device or ref"
                maxLength={ENQUIRY_SEARCH_MAX_LENGTH}
                className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                autoFocus
              />
            </div>
            <select
              value={searchType}
              onChange={(e) => setSearchType(e.target.value as any)}
              className="px-3 py-3 border border-gray-300 dark:border-gray-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
            >
              <option value="all">All</option>
              <option value="phone">Phone</option>
              <option value="name">Name</option>
              <option value="quote_id">ID</option>
            </select>
            <button
              type="button"
              aria-label="Search quotes"
              onClick={() => setSearchAttempt(attempt => attempt + 1)}
              disabled={loading}
              className="px-4 py-3 bg-primary hover:bg-primary-dark text-white rounded-xl font-semibold disabled:opacity-50 transition-all flex items-center gap-2"
            >
              {loading ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <Search className="h-5 w-5" />
              )}
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto pt-4">
          {loading && (
            <div className="text-center py-12 text-gray-500 dark:text-gray-400">
              <Loader2 className="h-16 w-16 mx-auto mb-4 opacity-50 animate-spin" />
              <p>Loading quotes...</p>
            </div>
          )}

          {!loading && error && (
            <p role="alert" className="py-8 text-center text-red-700 dark:text-red-400">{error}</p>
          )}

          {!loading && !error && quotes.length === 0 && (
            <div className="text-center py-12 text-gray-500 dark:text-gray-400">
              <FileText className="h-16 w-16 mx-auto mb-4 opacity-50" />
              <p>No quotes found matching your search</p>
            </div>
          )}

          {!loading && !error && quotes.length > 0 && (
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
                          Created: {formatDate(quote.original_created_at || quote.created_at)}
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
    </SlideUpPanel>
  )
}
