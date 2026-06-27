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

  return result
}
