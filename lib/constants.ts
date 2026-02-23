import { JobStatus } from './types-v3'

export const JOB_STATUS_LABELS: Record<JobStatus, string> = {
  RECEIVED: 'Received',
  AWAITING_DEPOSIT: 'Awaiting Deposit',
  PARTS_ORDERED: 'Parts Ordered',
  READY_TO_BOOK_IN: 'Ready to Book In',
  IN_REPAIR: 'In Repair',
  DELAYED: 'Delayed',
  READY_TO_COLLECT: 'Ready to Collect',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
}

export const JOB_STATUS_COLORS: Record<JobStatus, string> = {
  RECEIVED: 'bg-blue-600 text-white !text-white',
  AWAITING_DEPOSIT: 'bg-yellow-500 text-white !text-white',
  PARTS_ORDERED: 'bg-purple-600 text-white !text-white',
  READY_TO_BOOK_IN: 'bg-indigo-600 text-white !text-white',
  IN_REPAIR: 'bg-orange-600 text-white !text-white',
  DELAYED: 'bg-amber-600 text-white !text-white',
  READY_TO_COLLECT: 'bg-green-600 text-white !text-white',
  COMPLETED: 'bg-gray-700 text-white !text-white',
  CANCELLED: 'bg-red-600 text-white !text-white',
}

export const JOB_STATUS_BORDER_COLORS: Record<JobStatus, string> = {
  RECEIVED: 'border-blue-500',
  AWAITING_DEPOSIT: 'border-yellow-500',
  PARTS_ORDERED: 'border-purple-500',
  READY_TO_BOOK_IN: 'border-indigo-500',
  IN_REPAIR: 'border-orange-500',
  DELAYED: 'border-amber-500',
  READY_TO_COLLECT: 'border-green-500',
  COMPLETED: 'border-gray-600',
  CANCELLED: 'border-red-500',
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
]
