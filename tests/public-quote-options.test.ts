import { describe, expect, it } from 'vitest'
import {
  isScreenRepair,
  mergeNamedItems,
  verifyRequestedAccessories,
  verifyRequestedAddOns,
} from '../lib/public-quote-options'

const catalogue = [
  { category: 'phone', brand: 'Apple', model: 'iPhone 13', repair: 'battery', priceType: 'fixed', customerPriceGbp: 80, enabled: true },
  { category: 'phone', brand: 'Apple', model: 'iPhone 13', repair: 'screen', priceType: 'fixed', customerPriceGbp: 100, enabled: true },
  { category: 'phone', brand: 'Apple', model: 'iPhone 13', repair: 'screen', priceType: 'fixed', customerPriceGbp: 120, enabled: true },
]

describe('public quote option verification', () => {
  it('detects screen-style repairs', () => {
    expect(isScreenRepair('oled screen')).toBe(true)
    expect(isScreenRepair('battery')).toBe(false)
  })

  it('verifies add-on prices from the catalogue rather than the client', () => {
    const result = verifyRequestedAddOns(
      [{ repair: 'battery' }, { repair: 'screen' }],
      catalogue,
      { category: 'phone', brand: 'Apple', model: 'iPhone 13', primaryRepair: 'charging_port' }
    )

    expect(result).toEqual([
      { repair: 'battery', display_name: 'Battery', price: 60 },
      { repair: 'screen', display_name: 'Screen', price: 100 },
    ])
  })

  it('rejects unknown or duplicate add-ons', () => {
    const result = verifyRequestedAddOns(
      [{ repair: 'battery' }, { repair: 'battery' }, { repair: 'made_up' }],
      catalogue,
      { category: 'phone', brand: 'Apple', model: 'iPhone 13', primaryRepair: 'screen' }
    )
    expect(result).toEqual([{ repair: 'battery', display_name: 'Battery', price: 60 }])
  })

  it('only permits supported accessories for eligible screen repairs', () => {
    const requested = [
      { name: 'Free battery health check' },
      { name: 'Tempered glass screen protector' },
      { name: 'Free phone' },
    ]

    expect(verifyRequestedAccessories(requested, {
      category: 'phone',
      brand: 'Apple',
      primaryRepair: 'screen',
    })).toEqual([
      { name: 'Free battery health check', price: 0 },
      { name: 'Tempered glass screen protector', price: 15 },
    ])

    expect(verifyRequestedAccessories(requested, {
      category: 'phone',
      brand: 'Samsung',
      primaryRepair: 'screen',
    })).toEqual([
      { name: 'Free battery health check', price: 0 },
    ])

    expect(verifyRequestedAccessories(requested, {
      category: 'phone',
      brand: 'Apple',
      primaryRepair: 'battery',
    })).toEqual([])
  })

  it('merges saved options without duplicates', () => {
    expect(mergeNamedItems(
      [{ repair: 'battery', price: 60 }],
      [{ repair: 'battery', price: 999 }, { repair: 'screen', price: 100 }],
      'repair'
    )).toEqual([
      { repair: 'battery', price: 60 },
      { repair: 'screen', price: 100 },
    ])
  })
})
