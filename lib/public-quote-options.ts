export type QuoteCatalogueRow = {
  category?: string
  brand?: string
  model?: string
  repair?: string
  priceType?: string
  customerPriceGbp?: number | null
  enabled?: boolean
}

export type SavedAddOn = { repair: string; display_name: string; price: number }
export type SavedAccessory = { name: string; price: number }

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
      row.category === context.category &&
      row.brand === context.brand &&
      row.model === context.model &&
      row.repair === repair &&
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
  const iphone = String(context.brand || '').toLowerCase() === 'apple' &&
    String(context.category || '').toLowerCase() === 'phone'

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

export function mergeNamedItems(existing: unknown, additions: Array<Record<string, unknown>>, key: 'repair' | 'name') {
  const result: Array<Record<string, unknown>> = []
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
