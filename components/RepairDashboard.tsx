'use client'

import { useState } from 'react'
import { 
  Smartphone, 
  Clock, 
  CheckCircle, 
  AlertCircle, 
  Calendar,
  DollarSign,
  Shield,
  MessageSquare,
  Package
} from 'lucide-react'
import { formatDate, formatDateTime, getStatusColor, getStatusLabel } from '@/lib/utils'

interface Repair {
  id: string
  created_at: string
  customer_name: string
  device_type: string
  device_model: string
  issue_description: string
  status: string
  estimated_completion: string | null
  actual_completion: string | null
  cost_estimate: number | null
  final_cost: number | null
  warranty_expiry: string | null
  notes: string | null
}

interface Update {
  id: string
  created_at: string
  status: string
  message: string
}

interface Issue {
  id: string
  created_at: string
  issue_type: string
  description: string
  status: string
  resolution: string | null
  resolved_at: string | null
}

export default function RepairDashboard({
  repair,
  updates,
  issues,
}: {
  repair: Repair
  updates: Update[]
  issues: Issue[]
}) {
  const [showIssueForm, setShowIssueForm] = useState(false)

  const statusSteps = [
    'received',
    'diagnosing',
    'awaiting_parts',
    'repairing',
    'testing',
    'completed',
    'ready_for_collection',
  ]

  const currentStepIndex = statusSteps.indexOf(repair.status)

  return (
    <div className="min-h-screen bg-gradient-to-b from-background-light to-white">
      <nav className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center space-x-2">
            <Package className="h-8 w-8 text-primary" />
            <span className="text-2xl font-bold text-gray-900">Repair Tracker</span>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Hello, {repair.customer_name}!
          </h1>
          <p className="text-gray-600">
            Here's the status of your {repair.device_type} repair
          </p>
        </div>

        <div className="grid lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-6">
            <div className="card">
              <div className="flex items-start justify-between mb-6">
                <div className="flex items-center space-x-3">
                  <Smartphone className="h-8 w-8 text-primary" />
                  <div>
                    <h2 className="text-xl font-semibold">{repair.device_model}</h2>
                    <p className="text-gray-600">{repair.device_type}</p>
                  </div>
                </div>
                <span className={`status-badge ${getStatusColor(repair.status)}`}>
                  {getStatusLabel(repair.status)}
                </span>
              </div>

              <div className="space-y-4">
                <div>
                  <h3 className="font-medium text-gray-900 mb-2">Issue Description</h3>
                  <p className="text-gray-600">{repair.issue_description}</p>
                </div>

                {repair.notes && (
                  <div>
                    <h3 className="font-medium text-gray-900 mb-2">Notes</h3>
                    <p className="text-gray-600">{repair.notes}</p>
                  </div>
                )}
              </div>
            </div>

            <div className="card">
              <h3 className="text-lg font-semibold mb-4 flex items-center">
                <Clock className="h-5 w-5 mr-2 text-primary" />
                Repair Progress
              </h3>
              <div className="space-y-3">
                {statusSteps.map((step, index) => (
                  <div key={step} className="flex items-center">
                    <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
                      index <= currentStepIndex
                        ? 'bg-primary text-white'
                        : 'bg-gray-200 text-gray-400'
                    }`}>
                      {index < currentStepIndex ? (
                        <CheckCircle className="h-5 w-5" />
                      ) : (
                        <span className="text-sm">{index + 1}</span>
                      )}
                    </div>
                    <div className="ml-4 flex-1">
                      <p className={`font-medium ${
                        index <= currentStepIndex ? 'text-gray-900' : 'text-gray-400'
                      }`}>
                        {getStatusLabel(step)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {updates.length > 0 && (
              <div className="card">
                <h3 className="text-lg font-semibold mb-4 flex items-center">
                  <MessageSquare className="h-5 w-5 mr-2 text-primary" />
                  Recent Updates
                </h3>
                <div className="space-y-4">
                  {updates.map((update) => (
                    <div key={update.id} className="border-l-4 border-primary pl-4 py-2">
                      <div className="flex items-center justify-between mb-1">
                        <span className={`status-badge ${getStatusColor(update.status)}`}>
                          {getStatusLabel(update.status)}
                        </span>
                        <span className="text-sm text-gray-500">
                          {formatDateTime(update.created_at)}
                        </span>
                      </div>
                      <p className="text-gray-700">{update.message}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="space-y-6">
            <div className="card">
              <h3 className="text-lg font-semibold mb-4 flex items-center">
                <Calendar className="h-5 w-5 mr-2 text-primary" />
                Timeline
              </h3>
              <div className="space-y-3 text-sm">
                <div>
                  <p className="text-gray-600">Received</p>
                  <p className="font-medium">{formatDate(repair.created_at)}</p>
                </div>
                {repair.estimated_completion && (
                  <div>
                    <p className="text-gray-600">Estimated Completion</p>
                    <p className="font-medium">{formatDate(repair.estimated_completion)}</p>
                  </div>
                )}
                {repair.actual_completion && (
                  <div>
                    <p className="text-gray-600">Completed</p>
                    <p className="font-medium">{formatDate(repair.actual_completion)}</p>
                  </div>
                )}
              </div>
            </div>

            <div className="card">
              <h3 className="text-lg font-semibold mb-4 flex items-center">
                <DollarSign className="h-5 w-5 mr-2 text-primary" />
                Pricing
              </h3>
              <div className="space-y-3 text-sm">
                {repair.cost_estimate && (
                  <div>
                    <p className="text-gray-600">Estimated Cost</p>
                    <p className="font-medium text-lg">£{repair.cost_estimate.toFixed(2)}</p>
                  </div>
                )}
                {repair.final_cost && (
                  <div>
                    <p className="text-gray-600">Final Cost</p>
                    <p className="font-medium text-lg">£{repair.final_cost.toFixed(2)}</p>
                  </div>
                )}
              </div>
            </div>

            {repair.warranty_expiry && (
              <div className="card bg-green-50 border border-green-200">
                <h3 className="text-lg font-semibold mb-2 flex items-center text-green-900">
                  <Shield className="h-5 w-5 mr-2" />
                  Warranty
                </h3>
                <p className="text-sm text-green-800">
                  Valid until {formatDate(repair.warranty_expiry)}
                </p>
              </div>
            )}

            <div className="card">
              <h3 className="text-lg font-semibold mb-4 flex items-center">
                <AlertCircle className="h-5 w-5 mr-2 text-primary" />
                Report an Issue
              </h3>
              <p className="text-sm text-gray-600 mb-4">
                Not satisfied with your repair? Let us know and we'll make it right.
              </p>
              <button className="w-full btn-primary">
                Report Issue
              </button>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
