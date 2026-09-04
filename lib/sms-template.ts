/**
 * Shared SMS template rendering utilities.
 *
 * Provides a safe first-name fallback and a simple variable replacer so no
 * literal placeholders (e.g. {first_name}) ever reach customers.
 */

const TITLES = ['mr','mr.','mrs','mrs.','ms','ms.','miss','dr','dr.','sir','prof','prof.','rev','rev.','fr','fr.','mx','mx.']

// Values used as placeholders when device details aren't known yet (quick intake / finish later).
// These should NEVER appear in customer-facing SMS — replace with a generic word like "device".
const PLACEHOLDER_DEVICE_VALUES = ['to be added', 'to-be-added', 'tobeadded', 'unknown', 'n/a', 'na', 'tbd', '']

export function getFirstName(name: string | null | undefined): string {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean)
  const first = parts.find(p => !TITLES.includes(p.toLowerCase()))
  if (!first) return 'there'
  return first
}

/**
 * Returns a customer-safe device label for use in SMS templates.
 * If the make/model is a placeholder (e.g. "To be added", "Unknown", or empty),
 * returns a generic word like "device" so customers never see "your To be added".
 *
 * If both make and model are known, returns "{make} {model}" (trimmed).
 * If only one is known, returns that one.
 */
export function safeDeviceLabel(
  deviceMake: string | null | undefined,
  deviceModel: string | null | undefined
): string {
  const make = (deviceMake || '').trim()
  const model = (deviceModel || '').trim()

  const makeIsPlaceholder = PLACEHOLDER_DEVICE_VALUES.includes(make.toLowerCase())
  const modelIsPlaceholder = PLACEHOLDER_DEVICE_VALUES.includes(model.toLowerCase())

  // Both placeholder/empty → generic
  if (makeIsPlaceholder && modelIsPlaceholder) return 'device'

  // Make is placeholder but model is real → just use model
  if (makeIsPlaceholder) return model

  // Model is placeholder but make is real → just use make
  if (modelIsPlaceholder) return make

  // Both known → combine
  return `${make} ${model}`.trim()
}

export function renderSmsTemplate(
  template: string,
  variables: Record<string, string | number | null | undefined>
): string {
  let result = template

  for (const [key, rawValue] of Object.entries(variables)) {
    const value = rawValue === null || rawValue === undefined ? '' : String(rawValue)
    // Replace every occurrence of the placeholder.
    // Support both {key} and {{key}} syntax so a template using either
    // convention renders correctly (a previous bug shipped {{first_name}}
    // to customers because only {key} was handled).
    result = result.replaceAll(`{{${key}}}`, value).replaceAll(`{${key}}`, value)
  }

  // Strip lines where a variable resolved to empty — removes "Deposit paid: £." etc.
  // Also collapses multiple blank lines left behind
  result = result
    .split('\n')
    .filter((line) => {
      const trimmed = line.trim()
      // Keep blank lines (they'll be collapsed next)
      if (trimmed === '') return true
      // Strip lines that end with "£." or "£ ." (variable was empty after £ prefix)
      if (/£\s*\.\s*$/.test(trimmed)) return false
      // Strip lines that are just a label + empty variable (e.g. "Balance to pay: .")
      if (/^[a-zA-Z\s]+:\s*\.\s*$/.test(trimmed)) return false
      // Strip lines that are just a label + empty (e.g. "Deposit paid: ")
      if (/^[a-zA-Z\s]+:\s*$/.test(trimmed) && !trimmed.includes('http')) return false
      return true
    })
    .join('\n')
    // Collapse 3+ consecutive newlines to 2 (preserve paragraph breaks)
    .replace(/\n{3,}/g, '\n\n')
    // Trim leading/trailing whitespace
    .trim()

  // Safety net: strip any remaining unresolved {variable} or {{variable}} placeholders
  // This catches variables not passed to the function (e.g. device_summary, shop_address)
  result = result.replace(/\{\{[a-z_]+\}\}/gi, '').replace(/\{[a-z_]+\}/gi, '')
  // Clean up any double spaces or orphaned punctuation left behind
  result = result.replace(/  +/g, ' ').replace(/\n{3,}/g, '\n\n').trim()

  return result
}
