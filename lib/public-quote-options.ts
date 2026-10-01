export type QuoteCatalogueRow = {
  category?: string
  brand?: string
  model?: string
  repair?: string
  priceType?: string
  customerPriceGbp?: number | null
  enabled?: boolean
  priority?: number | null
}

export type SavedAddOn = { repair: string; display_name: string; price: number }
export type SavedAccessory = { name: string; price: number }

export type AvailableAddOn = {
  repair: string
  displayName: string
  originalPrice: number
  discountPrice: number
  hasDiscount: boolean
  saving: number
  priority: number
}

export type AvailableAccessory = {
  name: string
  price: number
}

function normaliseText(value: unknown): string {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ')
}

function normaliseCategory(value: unknown): string {
  const raw = normaliseText(value)
  if (raw.endsWith('ies')) return raw.slice(0, -3) + 'y'
  if (raw.endsWith('s')) return raw.slice(0, -1)
  return raw
}

function sameCategory(a: unknown, b: unknown): boolean {
  return normaliseCategory(a) === normaliseCategory(b)
}

function sameText(a: unknown, b: unknown): boolean {
  return normaliseText(a) === normaliseText(b)
}

const SCREEN_WORDS = ['screen','display','lcd','oled','digitiser','digitizer','touch-glass','touch glass','touchscreen','inner screen','outer screen']

export function isScreenRepair(value: unknown): boolean {
  const repair = String(value || '').toLowerCase()
  return SCREEN_WORDS.some(word => repair.includes(word))
}

export function verifyRequestedAddOns(
  requested: Array<{ repair?: string }>,
  catalogue: QuoteCatalogueRow[],
  context: { category?: string | null; brand?: string | null; model?: string | null; primaryRepair?: string | null }
): SavedAddOn[] {
  const seen = new Set<string>()
  const output: SavedAddOn[] = []

  for (const item of requested || []) {
    const repair = String(item?.repair || '').trim()
    if (!repair || seen.has(repair) || repair === context.primaryRepair) continue

    const matches = catalogue.filter(row =>
      row.enabled !== false &&
      sameCategory(row.category, context.category) &&
      sameText(row.brand, context.brand) &&
      sameText(row.model, context.model) &&
      sameText(row.repair, repair) &&
      row.priceType === 'fixed' &&
      typeof row.customerPriceGbp === 'number'
    )
    if (!matches.length) continue

    const minPrice = Math.min(...matches.map(row => Number(row.customerPriceGbp)))
    const price = isScreenRepair(repair) ? minPrice : Math.round(minPrice * 0.75)
    output.push({
      repair,
      display_name: repair.replace(/_/g, ' ').replace(/\b\w/g, char => char.toUpperCase()),
      price,
    })
    seen.add(repair)
  }

  return output
}

export function verifyRequestedAccessories(
  requested: Array<{ name?: string }>,
  context: { category?: string | null; brand?: string | null; primaryRepair?: string | null }
): SavedAccessory[] {
  const allowed: Record<string, number> = {}
  const screen = isScreenRepair(context.primaryRepair)
  const iphone = sameText(context.brand, 'Apple') &&
    sameCategory(context.category, 'Phone')

  if (screen) allowed['Free battery health check'] = 0
  if (screen && iphone) allowed['Tempered glass screen protector'] = 15

  const output: SavedAccessory[] = []
  const seen = new Set<string>()
  for (const item of requested || []) {
    const name = String(item?.name || '').trim()
    if (!name || seen.has(name) || !(name in allowed)) continue
    output.push({ name, price: allowed[name] })
    seen.add(name)
  }
  return output
}

export function getAvailableAccessories(context: {
  category?: string | null
  brand?: string | null
  primaryRepair?: string | null
}): AvailableAccessory[] {
  const screen = isScreenRepair(context.primaryRepair)
  if (!screen) return []

  const output: AvailableAccessory[] = [
    { name: 'Free battery health check', price: 0 },
  ]

  if (sameText(context.brand, 'Apple') && sameCategory(context.category, 'Phone')) {
    output.push({ name: 'Tempered glass screen protector', price: 15 })
  }

  return output
}

export function getAvailableAddOns(
  catalogue: QuoteCatalogueRow[],
  context: {
    category?: string | null
    brand?: string | null
    model?: string | null
    primaryRepair?: string | null
  },
  existing: Array<{ repair?: string }> = []
): AvailableAddOn[] {
  const excluded = new Set(
    [context.primaryRepair, ...(existing || []).map(item => item?.repair)]
      .map(normaliseText)
      .filter(Boolean)
  )

  const matches = catalogue.filter(row =>
    row.enabled !== false &&
    sameCategory(row.category, context.category) &&
    sameText(row.brand, context.brand) &&
    sameText(row.model, context.model) &&
    row.priceType === 'fixed' &&
    typeof row.customerPriceGbp === 'number' &&
    !excluded.has(normaliseText(row.repair))
  )

  const grouped = new Map<string, QuoteCatalogueRow[]>()
  for (const row of matches) {
    const key = normaliseText(row.repair)
    if (!key) continue
    const list = grouped.get(key) || []
    list.push(row)
    grouped.set(key, list)
  }

  const output: AvailableAddOn[] = []
  for (const rows of grouped.values()) {
    const repair = String(rows[0]?.repair || '').trim()
    if (!repair) continue

    const originalPrice = Math.min(...rows.map(row => Number(row.customerPriceGbp)))
    const screen = isScreenRepair(repair)
    const discountPrice = screen ? originalPrice : Math.round(originalPrice * 0.75)
    const priority = Math.min(...rows.map(row => Number(row.priority ?? 999)))

    output.push({
      repair,
      displayName: repair.replace(/_/g, ' ').replace(/\b\w/g, char => char.toUpperCase()),
      originalPrice,
      discountPrice,
      hasDiscount: !screen && discountPrice < originalPrice,
      saving: originalPrice - discountPrice,
      priority,
    })
  }

  return output.sort((a, b) =>
    a.priority - b.priority ||
    Number(b.hasDiscount) - Number(a.hasDiscount) ||
    a.discountPrice - b.discountPrice
  ).slice(0, 4)
}

export function mergeNamedItems(existing: unknown, additions: any[], key: 'repair' | 'name') {
  const result: any[] = []
  const seen = new Set<string>()

  for (const item of Array.isArray(existing) ? existing : []) {
    const value = String(item?.[key] || '').trim()
    if (!value || seen.has(value)) continue
    seen.add(value)
    result.push(item)
  }

  for (const item of additions) {
    const value = String(item?.[key] || '').trim()
    if (!value || seen.has(value)) continue
    seen.add(value)
    result.push(item)
  }

  return result
}

export function normalizePublicQuoteRef(value: unknown): string {
  let ref = String(value || '').trim()
  if (!ref) return ''

  try {
    ref = decodeURIComponent(ref)
  } catch {}

  const enquiryMatch = ref.match(/ENQ-[A-Z0-9]+/i)
  if (enquiryMatch) return enquiryMatch[0].toUpperCase()

  ref = ref.split('?')[0].split('#')[0].replace(/^\/+|\/+$/g, '')
  return ref
}
