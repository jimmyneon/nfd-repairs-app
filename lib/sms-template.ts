/**
 * Shared SMS template rendering utilities.
 *
 * Provides a safe first-name fallback and a simple variable replacer so no
 * literal placeholders (e.g. {first_name}) ever reach customers.
 */

export function getFirstName(name: string | null | undefined): string {
  const cleaned = (name || '').trim().split(' ')[0]
  if (!cleaned) return 'there'
  // Capitalise first letter, keep the rest as-is to avoid mangling names
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1)
}

export function renderSmsTemplate(
  template: string,
  variables: Record<string, string | number | null | undefined>
): string {
  let result = template

  for (const [key, rawValue] of Object.entries(variables)) {
    const value = rawValue === null || rawValue === undefined ? '' : String(rawValue)
    // Replace every occurrence of the placeholder
    result = result.replaceAll(`{${key}}`, value)
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
      if (/[a-zA-Z\s]+:\s*\.\s*$/.test(trimmed)) return false
      // Strip lines that are just a label + empty (e.g. "Deposit paid: ")
      if (/[a-zA-Z\s]+:\s*$/.test(trimmed) && !trimmed.includes('http')) return false
      return true
    })
    .join('\n')
    // Collapse 3+ consecutive newlines to 2 (preserve paragraph breaks)
    .replace(/\n{3,}/g, '\n\n')
    // Trim leading/trailing whitespace
    .trim()

  return result
}
