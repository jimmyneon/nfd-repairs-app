import { describe, expect, it } from 'vitest'
import {
  getAvailableAccessories,
  getAvailableAddOns,
  isScreenRepair,
  mergeNamedItems,
  normalizePublicQuoteRef,
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


describe('public quote reference normalization', () => {
  it('keeps a clean enquiry ref unchanged', () => {
    expect(normalizePublicQuoteRef('ENQ-QLPGARZ6')).toBe('ENQ-QLPGARZ6')
  })

  it('extracts the enquiry ref from legacy redirect noise', () => {
    expect(normalizePublicQuoteRef('ENQ-QLPGARZ6/?t=abc123')).toBe('ENQ-QLPGARZ6')
    expect(normalizePublicQuoteRef('quote/accept/ENQ-qlpgarz6')).toBe('ENQ-QLPGARZ6')
  })
})


describe('secure quote upsells', () => {
  const iphone15Catalogue = [
    { category: 'Phones', brand: 'Apple', model: 'iPhone 15 Pro', repair: 'Screen replacement', priceType: 'fixed', customerPriceGbp: 90, enabled: true, priority: 1 },
    { category: 'Phones', brand: 'Apple', model: 'iPhone 15 Pro', repair: 'Screen replacement', priceType: 'fixed', customerPriceGbp: 150, enabled: true, priority: 1 },
    { category: 'Phones', brand: 'Apple', model: 'iPhone 15 Pro', repair: 'Battery replacement', priceType: 'fixed', customerPriceGbp: 90, enabled: true, priority: 2 },
    { category: 'Phones', brand: 'Apple', model: 'iPhone 15 Pro', repair: 'Battery replacement', priceType: 'fixed', customerPriceGbp: 125, enabled: true, priority: 2 },
    { category: 'Phones', brand: 'Apple', model: 'iPhone 15 Pro', repair: 'Charging port service', priceType: 'fixed', customerPriceGbp: 39, enabled: true, priority: 3 },
  ]

  it('treats Phones and Phone as the same category', () => {
    expect(verifyRequestedAccessories(
      [{ name: 'Tempered glass screen protector' }],
      { category: 'Phones', brand: 'Apple', primaryRepair: 'Screen replacement' }
    )).toEqual([{ name: 'Tempered glass screen protector', price: 15 }])
  })

  it('offers the free health check and screen protector on an iPhone screen repair', () => {
    expect(getAvailableAccessories({
      category: 'Phones',
      brand: 'Apple',
      primaryRepair: 'Screen replacement',
    })).toEqual([
      { name: 'Free battery health check', price: 0 },
      { name: 'Tempered glass screen protector', price: 15 },
    ])
  })

  it('offers battery replacement as a discounted add-on for the iPhone 15 Pro screen quote', () => {
    const addOns = getAvailableAddOns(iphone15Catalogue, {
      category: 'Phones',
      brand: 'Apple',
      model: 'iPhone 15 Pro',
      primaryRepair: 'Screen replacement',
    })

    expect(addOns[0]).toMatchObject({
      repair: 'Battery replacement',
      originalPrice: 90,
      discountPrice: 68,
      hasDiscount: true,
      saving: 22,
    })
    expect(addOns.some(item => item.repair === 'Charging port service')).toBe(true)
    expect(addOns.some(item => item.repair === 'Screen replacement')).toBe(false)
  })
})
