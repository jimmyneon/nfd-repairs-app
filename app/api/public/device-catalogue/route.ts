import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

// Cache the catalogue for 10 minutes to avoid re-fetching on every request
let catalogueCache: { data: any; fetchedAt: number } | null = null
const CACHE_TTL = 10 * 60 * 1000 // 10 minutes

/**
 * GET /api/public/device-catalogue
 *
 * Returns a lightweight device catalogue (categories → brands → models)
 * derived from the public quote catalogue on the static site.
 * Used by the walk-in self-booking form for dropdown selectors.
 */
export async function GET() {
  try {
    if (catalogueCache && Date.now() - catalogueCache.fetchedAt < CACHE_TTL) {
      return NextResponse.json(catalogueCache.data)
    }

    const res = await fetch('https://newforestdevicerepairs.co.uk/data/quote-catalogue.json', {
      headers: { 'Accept': 'application/json' },
      // Use Next.js fetch cache
      next: { revalidate: 600 },
    })

    if (!res.ok) {
      return NextResponse.json(
        { error: 'Catalogue unavailable' },
        { status: 502 }
      )
    }

    const raw = await res.json()
    const quotes = raw.quotes || []

    // Build category → brand → models map
    const tree: Record<string, Record<string, string[]>> = {}

    for (const q of quotes) {
      const cat = q.category
      const brand = q.brand
      const model = q.model
      if (!cat || !brand || !model) continue
      if (!tree[cat]) tree[cat] = {}
      if (!tree[cat][brand]) tree[cat][brand] = []
      if (!tree[cat][brand].includes(model)) {
        tree[cat][brand].push(model)
      }
    }

    // Sort everything alphabetically
    const sorted: Record<string, Record<string, string[]>> = {}
    for (const cat of Object.keys(tree).sort()) {
      sorted[cat] = {}
      for (const brand of Object.keys(tree[cat]).sort()) {
        sorted[cat][brand] = tree[cat][brand].sort()
      }
    }

    const data = { categories: sorted }

    catalogueCache = { data, fetchedAt: Date.now() }
    return NextResponse.json(data)
  } catch (error) {
    console.error('Device catalogue error:', error)
    return NextResponse.json(
      { error: 'Failed to load device catalogue' },
      { status: 500 }
    )
  }
}
