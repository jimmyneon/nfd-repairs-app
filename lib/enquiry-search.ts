const SEARCH_FIELDS = [
  'enquiry_ref', 'customer_name', 'customer_email', 'company',
  'device_category', 'device_make', 'device_model', 'repair_type', 'issue_description',
] as const

type SearchField = (typeof SEARCH_FIELDS)[number]
type SearchableEnquiry = Partial<Record<SearchField | 'customer_phone' | 'description', string | null>>

export const ENQUIRY_SEARCH_MAX_LENGTH = 120

function getPhonePattern(search: string) {
  if (!/^[\d\s()+.-]+$/.test(search)) return null
  const digits = search.replace(/\D/g, '')
  if (!digits) return null

  const separator = '[\\s().+-]*'
  const digitPattern = (value: string) => value.split('').join(separator)
  const local = digits.match(/^0([1-9]\d{2,9})$/)
  const international = search.startsWith('+') || digits.startsWith('0044') || digits.length === 12
    ? digits.match(/^(?:00)?44(0?[1-9]\d{2,9})$/)
    : null
  const national = local?.[1] ?? international?.[1].replace(/^0/, '')

  if (!national) return digitPattern(digits)
  const prefix = `(?:0|${digitPattern('44')}(?:${separator}0)?|${digitPattern('0044')}(?:${separator}0)?)`
  return `^[\\s+(]*${prefix}${separator}${digitPattern(national)}`
}

function getSearchTerms(search: string) {
  const terms = search.split(/\s+/)
  return terms.length <= 6 ? terms : [search]
}

export function matchesEnquirySearch(enquiry: SearchableEnquiry, query: string) {
  const search = query.trim().toLowerCase()
  if (!search) return true

  const phonePattern = getPhonePattern(search)
  if (phonePattern && new RegExp(phonePattern).test(enquiry.customer_phone ?? '')) return true

  const fields = [...SEARCH_FIELDS.map(field => enquiry[field]), enquiry.description]
  // Keep a formatted phone search together so individual digit groups can't match unrelated fields.
  const terms = phonePattern ? [search] : getSearchTerms(search)
  return terms.every(term => fields.some(value => value?.toLowerCase().includes(term)))
}

function literalPattern(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function quotedPattern(pattern: string) {
  return `"${pattern.replace(/["\\]/g, '\\$&')}"`
}

// PostgREST combines repeated OR groups with AND, allowing make and model to match separate columns.
export function quoteSearchFilters(search: string, type: string) {
  const phonePattern = getPhonePattern(search)
  if (type === 'phone') {
    return [`customer_phone.imatch.${quotedPattern(phonePattern ?? literalPattern(search))}`]
  }
  if (type === 'name') {
    return [`customer_name.imatch.${quotedPattern(literalPattern(search))}`]
  }

  const terms = phonePattern ? [search] : getSearchTerms(search)
  return terms.map(term => {
    const pattern = quotedPattern(literalPattern(term))
    const filters = SEARCH_FIELDS.map(field => `${field}.imatch.${pattern}`)
    if (phonePattern) filters.push(`customer_phone.imatch.${quotedPattern(phonePattern)}`)
    return filters.join(',')
  })
}
