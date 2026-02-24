import { JobStatus } from './types-v3'

export const JOB_STATUS_LABELS: Record<JobStatus, string> = {
  QUOTE_APPROVED: 'Quote Approved',
  DROPPED_OFF: 'Dropped Off',
  RECEIVED: 'Received',
  AWAITING_DEPOSIT: 'Awaiting Deposit',
  PARTS_ORDERED: 'Parts Ordered',
  PARTS_ARRIVED: 'Parts Arrived',
  IN_REPAIR: 'In Repair',
  DELAYED: 'Delayed',
  READY_TO_COLLECT: 'Ready to Collect',
  COLLECTED: 'Collected',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
}

export const JOB_STATUS_COLORS: Record<JobStatus, string> = {
  QUOTE_APPROVED: 'bg-cyan-600 text-white !text-white',
  DROPPED_OFF: 'bg-blue-600 text-white !text-white',
  RECEIVED: 'bg-blue-700 text-white !text-white',
  AWAITING_DEPOSIT: 'bg-yellow-500 text-white !text-white',
  PARTS_ORDERED: 'bg-purple-600 text-white !text-white',
  PARTS_ARRIVED: 'bg-purple-700 text-white !text-white',
  IN_REPAIR: 'bg-orange-600 text-white !text-white',
  DELAYED: 'bg-red-600 text-white !text-white',
  READY_TO_COLLECT: 'bg-green-600 text-white !text-white',
  COLLECTED: 'bg-green-700 text-white !text-white',
  COMPLETED: 'bg-gray-600 text-white !text-white',
  CANCELLED: 'bg-gray-800 text-white !text-white',
}

export const JOB_STATUS_BORDER_COLORS: Record<JobStatus, string> = {
  QUOTE_APPROVED: 'border-cyan-500',
  DROPPED_OFF: 'border-blue-500',
  RECEIVED: 'border-blue-700',
  AWAITING_DEPOSIT: 'border-yellow-500',
  PARTS_ORDERED: 'border-purple-500',
  PARTS_ARRIVED: 'border-purple-700',
  IN_REPAIR: 'border-orange-500',
  DELAYED: 'border-red-500',
  READY_TO_COLLECT: 'border-green-500',
  COLLECTED: 'border-green-700',
  COMPLETED: 'border-gray-500',
  CANCELLED: 'border-gray-800',
}

export const SHOP_INFO = {
  name: 'New Forest Device Repairs',
  address: 'Lymington, Hampshire',
  phone: '07410381247',
  email: 'nfdrepairs@gmail.com',
  opening_times: 'Mon-Fri 9am-5:30pm',
}

export const SMS_TEMPLATE_VARIABLES = [
  '{job_ref}',
  '{device_summary}',
  '{repair_summary}',
  '{price_total}',
  '{deposit_amount}',
  '{tracking_link}',
  '{deposit_link}',
  '{shop_address}',
  '{opening_times}',
  '{google_maps_link}',
]
