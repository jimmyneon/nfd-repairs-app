import { type ClassValue, clsx } from 'clsx'

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs)
}

export function formatDate(date: string | Date): string {
  return new Date(date).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  })
}

export function formatDateTime(date: string | Date): string {
  return new Date(date).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

export function getStatusColor(status: string): string {
  const statusColors: Record<string, string> = {
    received: 'bg-blue-100 text-blue-800',
    diagnosing: 'bg-purple-100 text-purple-800',
    awaiting_parts: 'bg-yellow-100 text-yellow-800',
    repairing: 'bg-orange-100 text-orange-800',
    testing: 'bg-indigo-100 text-indigo-800',
    completed: 'bg-green-100 text-green-800',
    ready_for_collection: 'bg-green-100 text-green-800',
    collected: 'bg-gray-100 text-gray-800',
  }
  return statusColors[status] || 'bg-gray-100 text-gray-800'
}

export function getStatusLabel(status: string): string {
  const statusLabels: Record<string, string> = {
    received: 'Received',
    diagnosing: 'Diagnosing',
    awaiting_parts: 'Awaiting Parts',
    repairing: 'Repairing',
    testing: 'Testing',
    completed: 'Completed',
    ready_for_collection: 'Ready for Collection',
    collected: 'Collected',
  }
  return statusLabels[status] || status
}
