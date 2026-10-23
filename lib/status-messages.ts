import { Job } from './types-v3'
import { getFirstName, safeDeviceLabel } from './sms-template'
import { shortTrackingLink } from './utils'

// Customer-facing wording for each job status. Shared by the STATUS_UPDATE
// email route and the manual "send status update" SMS template.
const STATUS_MESSAGES: Record<string, string> = {
  QUOTE_REQUESTED: 'We have your repair enquiry and are pricing it up — we will be in touch with your quote shortly.',
  QUOTE_APPROVED: 'Your repair quote has been approved! Please use the booking link below to get started.',
  AWAITING_DEVICE: 'Your repair is ready for drop-off. Bring the device in whenever suits you during opening hours — no appointment needed.',
  DROPPED_OFF: 'We have received your device and will begin the repair process.',
  RECEIVED: 'Your device is now booked in with us. We will keep you updated throughout the repair.',
  DIAGNOSTIC: 'Your device is being diagnosed — we will update you with the findings shortly.',
  AWAITING_CUSTOMER: 'We are waiting to hear back from you — reply to this message or check your tracking page.',
  AWAITING_DEPOSIT: 'We need a deposit to order the parts for your repair. Please use the payment link below.',
  PARTS_ORDERED: 'Parts have been ordered. We will let you know as soon as they arrive — usually 2-3 working days.',
  PARTS_ARRIVED: 'Great news! The parts for your repair have arrived. Please bring your device in whenever suits you.',
  IN_REPAIR: 'Your device is now being repaired. We will update you as soon as it is ready to collect.',
  DELAYED: 'There is a slight delay with your repair. We will contact you with more information shortly.',
  READY_TO_COLLECT: 'Your repair is complete! Your device is ready to collect.',
  IN_STORAGE: 'Your device is repaired and being kept safely in storage until you collect it.',
  COLLECTED: 'Thank you for collecting your device!',
  COMPLETED: 'Your repair is all done. If you notice any issues, just let us know.',
  CANCELLED: 'This repair has been cancelled. If you have any questions, please contact us.',
}

// Postal (ps5hdmirepair.co.uk) jobs never involve a shop visit — the same
// statuses need posting/dispatch wording instead.
const POSTAL_STATUS_MESSAGES: Partial<Record<string, string>> = {
  AWAITING_DEVICE: 'We are ready for your device — please post it to us whenever suits you.',
  PARTS_ARRIVED: 'The parts for your repair have arrived — please post your device to us whenever suits you.',
  READY_TO_COLLECT: 'Your repair is complete and tested — once the balance is paid we will post it straight back to you.',
  COLLECTED: 'Your device has been dispatched back to you.',
  COMPLETED: 'Your device has been dispatched back to you. If you notice any issues, just let us know.',
  IN_STORAGE: 'Your device is repaired and being kept safely with us for now.',
}

const GENERIC_MESSAGE = 'Your repair is in progress — the live status is on your tracking page below.'

type StatusJob = Pick<Job, 'status'> &
  Partial<Pick<Job, 'source' | 'deposit_received' | 'payment_received'>>

export function customerStatusMessage(job: StatusJob): string {
  if (job.status === 'AWAITING_DEPOSIT' && (job.deposit_received || job.payment_received)) {
    return 'Payment received. We are arranging your parts order and will text you when the parts arrive.'
  }
  if (job.source === 'hdmi_repair_uk') {
    return POSTAL_STATUS_MESSAGES[job.status] ?? STATUS_MESSAGES[job.status] ?? GENERIC_MESSAGE
  }
  return STATUS_MESSAGES[job.status] ?? GENERIC_MESSAGE
}

// Ready-to-send text for the staff "status update" action: current status in
// customer-facing words plus the tracking link. Staff can still edit it in
// the composer before it goes out.
export function buildStatusUpdateMessage(job: Job): string {
  const firstName = getFirstName(job.customer_name)
  const device = safeDeviceLabel(job.device_make, job.device_model)
  const trackingUrl = shortTrackingLink(job.short_token || job.tracking_token)
  return `Hi ${firstName}, quick update on your ${device}:\n\n${customerStatusMessage(job)}\n\nFollow it live here: ${trackingUrl}\n\nNFD Repairs`
}
