/**
 * Direct carrier tracking scrapers for Royal Mail, DPD UK, and Evri.
 * No API keys, no signups, no costs. Just HTTP fetch + parse.
 *
 * Carrier detection from tracking number format:
 * - Royal Mail: 13 chars, ends in "GB" (e.g. AB123456789GB)
 * - DPD UK: 14-15 digit number (e.g. 15512345678901)
 * - Evri: Usually starts with "H" + alphanumeric (e.g. H01BXA0001234567) or 8-16 digit number
 */

export type TrackingResult = {
  carrier: string
  status: string
  lastEvent: string
  lastLocation: string
  eta: string | null
  events?: TrackingEvent[]
}

export type TrackingEvent = {
  time: string
  description: string
  location: string
}

export type CarrierType = 'royalmail' | 'dpd' | 'evri' | 'unknown'

const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-GB,en;q=0.9',
  'Accept-Encoding': 'gzip, deflate, br',
  'Connection': 'keep-alive',
  'Upgrade-Insecure-Requests': '1',
}

/**
 * Detect carrier from tracking number format
 */
export function detectCarrier(trackingNumber: string): CarrierType {
  const tn = trackingNumber.trim().toUpperCase()

  // Royal Mail: 13 chars, 2 letters + 9 digits + 2 letters (usually GB)
  if (/^[A-Z]{2}\d{9}[A-Z]{2}$/.test(tn)) {
    return 'royalmail'
  }

  // Evri: typically starts with H followed by alphanumeric, or T01, or pure digits 8-16
  if (/^H[A-Z0-9]{6,20}$/i.test(tn) || /^T\d{2}[A-Z]{3}\d{10}/i.test(tn)) {
    return 'evri'
  }

  // DPD UK: 14-15 digit number
  if (/^\d{14,15}$/.test(tn)) {
    return 'dpd'
  }

  // Fallback: try Evri for short alphanumeric, DPD for pure digits
  if (/^\d{8,16}$/.test(tn)) {
    return 'evri' // Could be Evri or DPD, try Evri first
  }

  return 'unknown'
}

/**
 * Normalize carrier status to our standard set
 */
function normalizeStatus(rawStatus: string): string {
  const s = rawStatus.toLowerCase().trim()
  if (s.includes('deliver') && !s.includes('out for') && !s.includes('attempt')) return 'Delivered'
  if (s.includes('out for delivery')) return 'OutForDelivery'
  if (s.includes('in transit') || s.includes('transit')) return 'InTransit'
  if (s.includes('received') || s.includes('accepted') || s.includes('label')) return 'InfoReceived'
  if (s.includes('collected') || s.includes('picked up') || s.includes('collection')) return 'PickedUp'
  if (s.includes('available') || s.includes('ready for') || s.includes('pickup')) return 'AvailableForPickup'
  if (s.includes('exception') || s.includes('delay') || s.includes('failed')) return 'Exception'
  if (s.includes('return')) return 'Returning'
  if (s.includes('expired')) return 'Expired'
  if (s.includes('stopped')) return 'Stopped'
  return rawStatus
}

/**
 * Scrape Royal Mail tracking
 * Fetches the HTML tracking page and parses tracking events
 */
export async function scrapeRoyalMail(trackingNumber: string): Promise<TrackingResult> {
  const tn = trackingNumber.trim().toUpperCase()
  const url = `https://www.royalmail.com/portal/rm/track?trackNumber=${tn}`

  const response = await fetch(url, {
    headers: BROWSER_HEADERS,
    redirect: 'follow',
  })

  if (!response.ok) {
    throw new Error(`Royal Mail fetch failed: ${response.status}`)
  }

  const html = await response.text()

  // Royal Mail page contains tracking data in script tags or JSON blocks
  // Look for __NEXT_DATA__ or similar embedded JSON
  const nextDataMatch = html.match(/<script[^>]*id="__NEXT_DATA__"[^>]*>(.*?)<\/script>/s)
  if (nextDataMatch) {
    try {
      const data = JSON.parse(nextDataMatch[1])
      const mailpiece = data?.props?.pageProps?.mailPiece
      if (mailpiece) {
        const events = mailpiece?.events || mailpiece?.mailPieceEvents || []
        const latestEvent = events[0] || {}
        const status = latestEvent?.eventStatus || latestEvent?.status || 'Unknown'

        return {
          carrier: 'Royal Mail',
          status: normalizeStatus(status),
          lastEvent: latestEvent?.eventDescription || latestEvent?.description || '',
          lastLocation: latestEvent?.locationName || latestEvent?.location || '',
          eta: mailpiece?.estimatedDelivery?.date || null,
          events: events.slice(0, 10).map((e: any) => ({
            time: e.eventDateTime || e.time || '',
            description: e.eventDescription || e.description || '',
            location: e.locationName || e.location || '',
          })),
        }
      }
    } catch (e) {
      // Fall through to HTML parsing
    }
  }

  // Fallback: parse HTML directly for tracking event elements
  // Royal Mail uses specific CSS classes for tracking events
  const eventMatches = html.matchAll(/<[^>]*(?:class|data-test)[^>]*=["'](?:[^"']*?(?:track-event|event-item|tracking-event|status-item)[^"']*?)["'][^>]*>([\s\S]*?)<\/(?:div|li|tr)>/gi)
  const events: TrackingEvent[] = []

  for (const match of eventMatches) {
    const block = match[1]
    const text = block.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
    if (text && text.length > 5) {
      // Try to extract date/time, description, location from the text
      const dateMatch = text.match(/(\d{1,2}\/\d{1,2}\/\d{2,4}|\d{1,2}\s+\w{3,9}\s+\d{2,4})/i)
      const timeMatch = text.match(/(\d{1,2}:\d{2}(?:\s?[AaPp][Mm])?)/)
      events.push({
        time: `${dateMatch?.[0] || ''} ${timeMatch?.[0] || ''}`.trim(),
        description: text,
        location: '',
      })
    }
  }

  if (events.length > 0) {
    return {
      carrier: 'Royal Mail',
      status: normalizeStatus(events[0].description),
      lastEvent: events[0].description,
      lastLocation: events[0].location,
      eta: null,
      events: events.slice(0, 10),
    }
  }

  // Check for "delivered" in the page
  if (/deliver/i.test(html) && /your item was delivered/i.test(html)) {
    return {
      carrier: 'Royal Mail',
      status: 'Delivered',
      lastEvent: 'Item delivered',
      lastLocation: '',
      eta: null,
    }
  }

  // Check for "we're expecting it" / not found
  if (/we.*expecting|not yet received|no information/i.test(html)) {
    return {
      carrier: 'Royal Mail',
      status: 'InfoReceived',
      lastEvent: 'Label created, awaiting item',
      lastLocation: '',
      eta: null,
    }
  }

  return {
    carrier: 'Royal Mail',
    status: 'Unknown',
    lastEvent: 'Unable to parse tracking data',
    lastLocation: '',
    eta: null,
  }
}

/**
 * Scrape DPD UK tracking
 * DPD requires parcel number + delivery postcode.
 * Uses the internal JSON API that the tracking page calls.
 */
export async function scrapeDPD(trackingNumber: string, postcode: string): Promise<TrackingResult> {
  const tn = trackingNumber.trim()
  const pc = postcode.replace(/\s+/g, '').toUpperCase()

  // DPD tracking page makes an XHR to this endpoint
  // Try the JSON API endpoint that the tracking page uses
  const url = `https://track.dpd.co.uk/parcels/${tn}?postcode=${encodeURIComponent(pc)}`

  const response = await fetch(url, {
    headers: {
      ...BROWSER_HEADERS,
      'Accept': 'application/json, text/html',
      'Referer': 'https://track.dpd.co.uk/',
    },
  })

  const contentType = response.headers.get('content-type') || ''

  if (response.ok && contentType.includes('application/json')) {
    const data = await response.json()

    // DPD JSON structure varies, try common fields
    const parcel = data.parcel || data
    const events = parcel?.trackingEvents || parcel?.events || data?.trackingEvents || []
    const latestEvent = events[0] || {}
    const status = latestEvent?.parcelStatus || latestEvent?.status || data?.parcelStatus || 'Unknown'

    return {
      carrier: 'DPD',
      status: normalizeStatus(status),
      lastEvent: latestEvent?.parcelStatusText || latestEvent?.description || latestEvent?.statusText || '',
      lastLocation: latestEvent?.location || latestEvent?.depot || '',
      eta: parcel?.estimatedDeliveryDate || parcel?.deliveryDate || null,
      events: events.slice(0, 10).map((e: any) => ({
        time: e.eventDateTime || e.dateTime || e.time || '',
        description: e.parcelStatusText || e.description || e.statusText || '',
        location: e.location || e.depot || '',
      })),
    }
  }

  // Fallback: fetch the HTML page and look for embedded data
  const htmlResponse = await fetch(`https://track.dpd.co.uk/search?parcelRef=${tn}&postcode=${encodeURIComponent(pc)}`, {
    headers: BROWSER_HEADERS,
  })

  if (!htmlResponse.ok) {
    throw new Error(`DPD fetch failed: ${htmlResponse.status}`)
  }

  const html = await htmlResponse.text()

  // Look for __NEXT_DATA__ or embedded JSON
  const nextDataMatch = html.match(/<script[^>]*id="__NEXT_DATA__"[^>]*>(.*?)<\/script>/s)
  if (nextDataMatch) {
    try {
      const data = JSON.parse(nextDataMatch[1])
      const parcel = data?.props?.pageProps?.parcel || data?.props?.pageProps
      if (parcel) {
        const events = parcel?.trackingEvents || parcel?.events || []
        const latestEvent = events[0] || {}
        return {
          carrier: 'DPD',
          status: normalizeStatus(latestEvent?.status || 'Unknown'),
          lastEvent: latestEvent?.description || latestEvent?.statusText || '',
          lastLocation: latestEvent?.location || '',
          eta: parcel?.estimatedDeliveryDate || null,
          events: events.slice(0, 10).map((e: any) => ({
            time: e.time || e.dateTime || '',
            description: e.description || e.statusText || '',
            location: e.location || '',
          })),
        }
      }
    } catch (e) {
      // Fall through
    }
  }

  // Check for delivered in HTML
  if (/deliver/i.test(html) && /has been delivered|delivered to/i.test(html)) {
    return {
      carrier: 'DPD',
      status: 'Delivered',
      lastEvent: 'Parcel delivered',
      lastLocation: '',
      eta: null,
    }
  }

  if (/in transit|on its way/i.test(html)) {
    return {
      carrier: 'DPD',
      status: 'InTransit',
      lastEvent: 'Parcel in transit',
      lastLocation: '',
      eta: null,
    }
  }

  if (/out for delivery/i.test(html)) {
    return {
      carrier: 'DPD',
      status: 'OutForDelivery',
      lastEvent: 'Out for delivery',
      lastLocation: '',
      eta: null,
    }
  }

  return {
    carrier: 'DPD',
    status: 'Unknown',
    lastEvent: 'Unable to parse tracking data',
    lastLocation: '',
    eta: null,
  }
}

/**
 * Scrape Evri tracking
 * Uses Evri's internal tracking API (endpoint and key exposed in their website source)
 */
export async function scrapeEvri(trackingNumber: string): Promise<TrackingResult> {
  const tn = trackingNumber.trim()

  // Evri tracking API - endpoint and key found in their website's JS config
  const apiKey = 'MgMPMhWhXxSp7xIoYUVnWDklTl7EXAgG'
  const baseUrl = 'https://tracking.platform-apis.evri.com/v1/'

  // Try the parcels endpoint
  const url = `${baseUrl}parcels/${encodeURIComponent(tn)}`

  const response = await fetch(url, {
    headers: {
      ...BROWSER_HEADERS,
      'Accept': 'application/json',
      'Api-Key': apiKey,
      'Origin': 'https://www.evri.com',
      'Referer': 'https://www.evri.com/',
    },
  })

  if (response.ok) {
    const data = await response.json()

    // Evri API structure - try common fields
    const parcel = data.parcel || data
    const events = parcel?.events || parcel?.trackingEvents || data?.events || []
    const latestEvent = events[0] || {}
    const status = latestEvent?.status || parcel?.status || data?.status || 'Unknown'

    return {
      carrier: 'Evri',
      status: normalizeStatus(status),
      lastEvent: latestEvent?.description || latestEvent?.statusDescription || latestEvent?.message || '',
      lastLocation: latestEvent?.location || latestEvent?.depot || '',
      eta: parcel?.estimatedDeliveryDate || parcel?.deliveryDate || null,
      events: events.slice(0, 10).map((e: any) => ({
        time: e.dateTime || e.time || e.eventDate || '',
        description: e.description || e.statusDescription || e.message || '',
        location: e.location || e.depot || '',
      })),
    }
  }

  // Fallback: try the customer tracking API
  const customerApiUrl = `https://api.evri.com/customer-tracking/v1/parcels/${encodeURIComponent(tn)}`
  const customerResponse = await fetch(customerApiUrl, {
    headers: {
      ...BROWSER_HEADERS,
      'Accept': 'application/json',
      'Api-Key': apiKey,
      'Origin': 'https://www.evri.com',
      'Referer': 'https://www.evri.com/',
    },
  })

  if (customerResponse.ok) {
    const data = await customerResponse.json()
    const parcel = data.parcel || data
    const events = parcel?.events || parcel?.trackingEvents || data?.events || []
    const latestEvent = events[0] || {}
    const status = latestEvent?.status || parcel?.status || data?.status || 'Unknown'

    return {
      carrier: 'Evri',
      status: normalizeStatus(status),
      lastEvent: latestEvent?.description || latestEvent?.statusDescription || '',
      lastLocation: latestEvent?.location || '',
      eta: parcel?.estimatedDeliveryDate || null,
      events: events.slice(0, 10).map((e: any) => ({
        time: e.dateTime || e.time || '',
        description: e.description || e.statusDescription || '',
        location: e.location || '',
      })),
    }
  }

  // Last fallback: scrape the HTML page
  const htmlUrl = `https://www.evri.com/track/tracking/${encodeURIComponent(tn)}`
  const htmlResponse = await fetch(htmlUrl, {
    headers: BROWSER_HEADERS,
  })

  if (!htmlResponse.ok) {
    throw new Error(`Evri fetch failed: ${response.status}`)
  }

  const html = await htmlResponse.text()

  // Evri is a Nuxt SPA - look for __NUXT_DATA__ or embedded JSON
  const nuxtDataMatch = html.match(/<script[^>]*id="__NUXT_DATA__"[^>]*>(.*?)<\/script>/s)
  if (nuxtDataMatch) {
    try {
      const data = JSON.parse(nuxtDataMatch[1])
      // Nuxt data is an array-based format - search for tracking-related objects
      const dataStr = JSON.stringify(data)
      if (/deliver/i.test(dataStr)) {
        const statusMatch = dataStr.match(/"status"\s*:\s*"([^"]+)"/i)
        return {
          carrier: 'Evri',
          status: normalizeStatus(statusMatch?.[1] || 'Unknown'),
          lastEvent: 'Tracking data found in page',
          lastLocation: '',
          eta: null,
        }
      }
    } catch (e) {
      // Fall through
    }
  }

  return {
    carrier: 'Evri',
    status: 'Unknown',
    lastEvent: 'Unable to parse tracking data',
    lastLocation: '',
    eta: null,
  }
}

/**
 * Main tracking function - detects carrier and calls appropriate scraper
 */
export async function trackPackage(trackingNumber: string, postcode?: string): Promise<TrackingResult> {
  const carrier = detectCarrier(trackingNumber)

  switch (carrier) {
    case 'royalmail':
      return scrapeRoyalMail(trackingNumber)
    case 'dpd':
      return scrapeDPD(trackingNumber, postcode || process.env.SHOP_POSTCODE || 'SO427DH')
    case 'evri':
      return scrapeEvri(trackingNumber)
    default:
      // Try all carriers in sequence
      try {
        return await scrapeRoyalMail(trackingNumber)
      } catch {
        try {
          return await scrapeEvri(trackingNumber)
        } catch {
          if (postcode || process.env.SHOP_POSTCODE) {
            return await scrapeDPD(trackingNumber, postcode || process.env.SHOP_POSTCODE || 'SO427DH')
          }
          throw new Error(`Could not detect carrier for tracking number: ${trackingNumber}`)
        }
      }
  }
}
