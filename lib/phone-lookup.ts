// Shared UK phone normalisation + lookup-variant helpers.
// Customer phone numbers may be stored as 07..., +447..., 447... or 00447...
// depending on how the record was created, so all lookups go through these.

export function normaliseUkPhoneForLookup(raw: string): string {
  const digits = raw.replace(/[^\d+]/g, '')
  if (/^\+447\d{9}$/.test(digits)) return digits
  if (/^00447\d{9}$/.test(digits)) return `+447${digits.slice(5)}`
  if (/^447\d{9}$/.test(digits)) return `+${digits}`
  if (/^07\d{9}$/.test(digits)) return `+44${digits.slice(1)}`
  return raw.trim() // fallback: return as-is for non-UK or unusual formats
}

export function phoneLookupVariants(raw: string): string[] {
  const normalised = normaliseUkPhoneForLookup(raw)
  const lookupSet = new Set<string>([normalised, raw.trim()])
  // Also add the 07... form (strip +44 prefix)
  if (normalised.startsWith('+447')) {
    lookupSet.add('0' + normalised.slice(3))
  }
  // And the 447... / 00447... forms (no + prefix)
  if (normalised.startsWith('+447')) {
    lookupSet.add(normalised.slice(1))
    lookupSet.add('00' + normalised.slice(1))
  }
  return Array.from(lookupSet).filter(Boolean)
}
