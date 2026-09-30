export const QUICK_REPAIR_SOURCE = 'staff_quick_log'
export const QUICK_REPAIR_DEVICES = [
  { value: 'phone', label: 'Phone' },
  { value: 'tablet', label: 'Tablet' },
  { value: 'laptop', label: 'Laptop' },
  { value: 'desktop', label: 'PC' },
  { value: 'console', label: 'Console' },
  { value: 'watch', label: 'Watch' },
  { value: 'other', label: 'Other' },
] as const

/** Only staff quick logs may omit contact details. Never invent consent or payment. */
export function buildQuickRepairJob(input: Record<string, unknown>, now = new Date()) {
  const id = typeof input.id === 'string' ? input.id : ''
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    throw new Error('Please reload the form and try again.')
  }
  const device = typeof input.device_type === 'string' ? input.device_type : ''
  if (!QUICK_REPAIR_DEVICES.some(option => option.value === device)) throw new Error('Choose a device type.')
  const issue = typeof input.issue === 'string' ? input.issue.trim() : ''
  if (!issue || issue.length > 500) throw new Error('Enter a short repair description (up to 500 characters).')
  const model = typeof input.device_model === 'string' ? input.device_model.trim() : ''
  if (model.length > 120) throw new Error('Keep the device model under 120 characters.')
  const status = input.status
  if (status !== 'COMPLETED' && status !== 'RECEIVED') throw new Error('Choose whether the repair is finished or still in progress.')
  const rawAmount = input.amount
  if (rawAmount !== undefined && rawAmount !== null && typeof rawAmount !== 'string' && typeof rawAmount !== 'number') {
    throw new Error('Enter a valid amount in pounds.')
  }
  const amountText = String(rawAmount ?? '').trim()
  if (amountText && !/^\d{1,8}(\.\d{1,2})?$/.test(amountText)) throw new Error('Enter a valid amount in pounds, with up to two decimal places.')
  const amount = amountText ? Number(amountText) : 0
  const completed = status === 'COMPLETED'
  const timestamp = now.toISOString()
  return {
    id,
    customer_name: 'Walk-in (no details)',
    customer_phone: null,
    customer_email: null,
    device_type: device,
    device_make: 'Unspecified',
    device_model: model || 'Unspecified',
    issue,
    repair_type: issue,
    description: 'Quick repair log — customer details not recorded.',
    type: 'repair',
    source: QUICK_REPAIR_SOURCE,
    status,
    price_total: amount,
    quoted_price: 0,
    payment_received: false,
    device_in_shop: !completed,
    repair_outcome: completed ? 'repaired' : null,
    status_changed_at: timestamp,
    closed_at: completed ? timestamp : null,
    collected_at: completed ? timestamp : null,
    terms_accepted: false,
    onboarding_completed: false,
    quick_intake: false,
    skip_review_request: true,
  }
}
