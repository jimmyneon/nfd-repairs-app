import { NextResponse } from 'next/server'
import { getFirstName } from '@/lib/sms-template'
import { shortTrackingLink, shortHoursLink } from '@/lib/utils'
import {
  getTurnaroundEstimate,
  getShortEta,
  getWorkloadAdjustedEta,
  calculateWorkloadFromJobs,
  getDeviceType,
  getPriorityTier,
  type WorkloadInfo,
  type TurnaroundEstimate,
} from '@/lib/tracking-utils'

/**
 * GET /api/test/scenarios
 *
 * Runs scenarios A–H through the actual ETA engine and SMS builders
 * with simulated job data and workload. Does NOT send any SMS.
 *
 * Add ?scenario=A to run a single scenario.
 * Add ?workload=quiet|normal|busy|very_busy to override the workload level.
 */
export async function GET(request: Request) {
  const url = new URL(request.url)
  const scenarioParam = url.searchParams.get('scenario')?.toUpperCase()
  const workloadOverride = url.searchParams.get('workload')

  const scenarios = buildScenarios(workloadOverride)
  const toRun = scenarioParam ? scenarios.filter(s => s.id === scenarioParam) : scenarios

  const results = toRun.map(scenario => runScenario(scenario))

  return NextResponse.json({
    total: results.length,
    results,
  }, { headers: { 'Cache-Control': 'no-store' } })
}

// ---------------------------------------------------------------------------
// Scenario definitions
// ---------------------------------------------------------------------------

interface Scenario {
  id: string
  label: string
  description: string
  job: {
    customer_name: string
    device_make: string
    device_model: string
    issue: string
    status: string
    device_in_shop: boolean
    requires_parts_order: boolean
    deposit_required: boolean
    deposit_received: boolean
    parts_ordered_at: string | null
    parts_expected_at: string | null
    short_token: string
    tracking_token: string
  }
  // Simulated queue: other active jobs in the workshop
  queue: Array<{ device_make: string; device_model: string; issue: string; status: string }>
  workloadLabel: string
}

function buildScenarios(override?: string | null): Scenario[] {
  return [
    {
      id: 'A',
      label: 'Quote → Proceed → parts in stock → bring device → received → repair → ready',
      description: 'iPhone screen repair, parts in stock, device still with customer',
      job: {
        customer_name: 'Sarah Jones',
        device_make: 'Apple',
        device_model: 'iPhone 13',
        issue: 'Screen replacement',
        status: 'AWAITING_DEVICE',
        device_in_shop: false,
        requires_parts_order: false,
        deposit_required: false,
        deposit_received: false,
        parts_ordered_at: null,
        parts_expected_at: null,
        short_token: 'scrA01',
        tracking_token: 'tokA01',
      },
      queue: [],
      workloadLabel: override || 'quiet',
    },
    {
      id: 'B',
      label: 'Quote → Proceed → parts need ordering → £20 deposit → paid → ordered → arrived → bring device',
      description: 'Samsung screen repair, parts ordered, device still with customer',
      job: {
        customer_name: 'Mike Brown',
        device_make: 'Samsung',
        device_model: 'Galaxy S22',
        issue: 'Screen replacement',
        status: 'PARTS_ARRIVED',
        device_in_shop: false,
        requires_parts_order: true,
        deposit_required: true,
        deposit_received: true,
        parts_ordered_at: '2026-09-04T10:00:00Z',
        parts_expected_at: '2026-09-07T10:00:00Z',
        short_token: 'scrB02',
        tracking_token: 'tokB02',
      },
      queue: [],
      workloadLabel: override || 'quiet',
    },
    {
      id: 'C',
      label: 'Device already in shop → parts need ordering → deposit → parts arrive → repair starts',
      description: 'PS5 HDMI repair, device in shop, parts arrived',
      job: {
        customer_name: 'Tom Wilson',
        device_make: 'Sony',
        device_model: 'PlayStation 5',
        issue: 'HDMI port replacement',
        status: 'PARTS_ARRIVED',
        device_in_shop: true,
        requires_parts_order: true,
        deposit_required: true,
        deposit_received: true,
        parts_ordered_at: '2026-09-04T10:00:00Z',
        parts_expected_at: '2026-09-07T10:00:00Z',
        short_token: 'scrC03',
        tracking_token: 'tokC03',
      },
      queue: [],
      workloadLabel: override || 'quiet',
    },
    {
      id: 'D',
      label: 'Quick phone repair, parts in stock, low workload',
      description: 'iPhone battery, device received, quiet workshop',
      job: {
        customer_name: 'Emma Lee',
        device_make: 'Apple',
        device_model: 'iPhone 12',
        issue: 'Battery replacement',
        status: 'IN_REPAIR',
        device_in_shop: true,
        requires_parts_order: false,
        deposit_required: false,
        deposit_received: false,
        parts_ordered_at: null,
        parts_expected_at: null,
        short_token: 'scrD04',
        tracking_token: 'tokD04',
      },
      queue: [
        { device_make: 'Apple', device_model: 'iPhone 14', issue: 'Screen replacement', status: 'IN_REPAIR' },
      ],
      workloadLabel: override || 'quiet',
    },
    {
      id: 'E',
      label: 'Quick phone repair, parts in stock, HIGH workload',
      description: 'iPhone battery, device received, very busy workshop with laptops and consoles',
      job: {
        customer_name: 'Emma Lee',
        device_make: 'Apple',
        device_model: 'iPhone 12',
        issue: 'Battery replacement',
        status: 'IN_REPAIR',
        device_in_shop: true,
        requires_parts_order: false,
        deposit_required: false,
        deposit_received: false,
        parts_ordered_at: null,
        parts_expected_at: null,
        short_token: 'scrE05',
        tracking_token: 'tokE05',
      },
      queue: [
        { device_make: 'Apple', device_model: 'MacBook Pro', issue: 'Motherboard repair', status: 'IN_REPAIR' },
        { device_make: 'Dell', device_model: 'Latitude laptop', issue: 'No power', status: 'RECEIVED' },
        { device_make: 'Sony', device_model: 'PlayStation 5', issue: 'HDMI port replacement', status: 'RECEIVED' },
        { device_make: 'Microsoft', device_model: 'Xbox Series X', issue: 'Overheating', status: 'DIAGNOSTIC' },
        { device_make: 'Apple', device_model: 'MacBook Air', issue: 'Logic board repair', status: 'IN_REPAIR' },
        { device_make: 'HP', device_model: 'Pavilion laptop', issue: 'Water damage', status: 'RECEIVED' },
        { device_make: 'Lenovo', device_model: 'ThinkPad', issue: 'Screen replacement', status: 'PARTS_ARRIVED' },
        { device_make: 'Asus', device_model: 'ROG laptop', issue: 'Charging port', status: 'RECEIVED' },
      ],
      workloadLabel: override || 'very_busy',
    },
    {
      id: 'F',
      label: 'PS5/Xbox HDMI repair with phone jobs also in queue',
      description: 'PS5 HDMI, device in shop, phone repairs queued ahead',
      job: {
        customer_name: 'Chris Taylor',
        device_make: 'Sony',
        device_model: 'PlayStation 5',
        issue: 'HDMI port replacement',
        status: 'RECEIVED',
        device_in_shop: true,
        requires_parts_order: false,
        deposit_required: false,
        deposit_received: false,
        parts_ordered_at: null,
        parts_expected_at: null,
        short_token: 'scrF06',
        tracking_token: 'tokF06',
      },
      queue: [
        { device_make: 'Apple', device_model: 'iPhone 14', issue: 'Screen replacement', status: 'IN_REPAIR' },
        { device_make: 'Samsung', device_model: 'Galaxy S23', issue: 'Battery replacement', status: 'RECEIVED' },
        { device_make: 'Apple', device_model: 'iPhone 13', issue: 'Charging port', status: 'RECEIVED' },
        { device_make: 'Google', device_model: 'Pixel 7', issue: 'Screen replacement', status: 'RECEIVED' },
      ],
      workloadLabel: override || 'normal',
    },
    {
      id: 'G',
      label: 'Laptop/MacBook motherboard repair — no exact ETA',
      description: 'MacBook Pro motherboard, device in shop, complex repair',
      job: {
        customer_name: 'David Clark',
        device_make: 'Apple',
        device_model: 'MacBook Pro',
        issue: 'Motherboard repair — no power',
        status: 'DIAGNOSTIC',
        device_in_shop: true,
        requires_parts_order: false,
        deposit_required: false,
        deposit_received: false,
        parts_ordered_at: null,
        parts_expected_at: null,
        short_token: 'scrG07',
        tracking_token: 'tokG07',
      },
      queue: [
        { device_make: 'Apple', device_model: 'iPhone 15', issue: 'Screen replacement', status: 'IN_REPAIR' },
        { device_make: 'Samsung', device_model: 'Galaxy S22', issue: 'Battery replacement', status: 'RECEIVED' },
      ],
      workloadLabel: override || 'normal',
    },
    {
      id: 'H',
      label: 'Liquid-damage diagnostic/repair — no safe initial exact ETA',
      description: 'iPhone liquid damage, device in shop, diagnostic phase',
      job: {
        customer_name: 'Lisa Martin',
        device_make: 'Apple',
        device_model: 'iPhone 14',
        issue: 'Liquid damage — phone won\'t turn on',
        status: 'DIAGNOSTIC',
        device_in_shop: true,
        requires_parts_order: false,
        deposit_required: false,
        deposit_received: false,
        parts_ordered_at: null,
        parts_expected_at: null,
        short_token: 'scrH08',
        tracking_token: 'tokH08',
      },
      queue: [
        { device_make: 'Apple', device_model: 'iPhone 13', issue: 'Screen replacement', status: 'IN_REPAIR' },
        { device_make: 'Sony', device_model: 'PlayStation 5', issue: 'HDMI port replacement', status: 'RECEIVED' },
        { device_make: 'Dell', device_model: 'Latitude laptop', issue: 'Screen replacement', status: 'RECEIVED' },
      ],
      workloadLabel: override || 'normal',
    },
    // --- New scenarios for queue impact matrix testing ---
    {
      id: 'I',
      label: 'Quick phone repair with 1 quick phone job ahead',
      description: 'iPhone battery, device received, 1 phone screen ahead',
      job: {
        customer_name: 'Alex Reed',
        device_make: 'Apple',
        device_model: 'iPhone 13',
        issue: 'Battery replacement',
        status: 'RECEIVED',
        device_in_shop: true,
        requires_parts_order: false,
        deposit_required: false,
        deposit_received: false,
        parts_ordered_at: null,
        parts_expected_at: null,
        short_token: 'scrI09',
        tracking_token: 'tokI09',
      },
      queue: [
        { device_make: 'Apple', device_model: 'iPhone 14', issue: 'Screen replacement', status: 'IN_REPAIR' },
      ],
      workloadLabel: override || 'quiet',
    },
    {
      id: 'J',
      label: 'Quick phone repair with 3 quick phone jobs ahead',
      description: 'iPhone battery, device received, 3 phone repairs ahead',
      job: {
        customer_name: 'Alex Reed',
        device_make: 'Apple',
        device_model: 'iPhone 13',
        issue: 'Battery replacement',
        status: 'RECEIVED',
        device_in_shop: true,
        requires_parts_order: false,
        deposit_required: false,
        deposit_received: false,
        parts_ordered_at: null,
        parts_expected_at: null,
        short_token: 'scrJ10',
        tracking_token: 'tokJ10',
      },
      queue: [
        { device_make: 'Apple', device_model: 'iPhone 14', issue: 'Screen replacement', status: 'IN_REPAIR' },
        { device_make: 'Samsung', device_model: 'Galaxy S23', issue: 'Battery replacement', status: 'RECEIVED' },
        { device_make: 'Apple', device_model: 'iPhone 12', issue: 'Charging port', status: 'RECEIVED' },
      ],
      workloadLabel: override || 'normal',
    },
    {
      id: 'K',
      label: 'Quick phone repair with 6 quick phone jobs ahead',
      description: 'iPhone battery, device received, 6 phone repairs ahead (same-tier saturation)',
      job: {
        customer_name: 'Alex Reed',
        device_make: 'Apple',
        device_model: 'iPhone 13',
        issue: 'Battery replacement',
        status: 'RECEIVED',
        device_in_shop: true,
        requires_parts_order: false,
        deposit_required: false,
        deposit_received: false,
        parts_ordered_at: null,
        parts_expected_at: null,
        short_token: 'scrK11',
        tracking_token: 'tokK11',
      },
      queue: [
        { device_make: 'Apple', device_model: 'iPhone 14', issue: 'Screen replacement', status: 'IN_REPAIR' },
        { device_make: 'Samsung', device_model: 'Galaxy S23', issue: 'Battery replacement', status: 'RECEIVED' },
        { device_make: 'Apple', device_model: 'iPhone 12', issue: 'Charging port', status: 'RECEIVED' },
        { device_make: 'Google', device_model: 'Pixel 7', issue: 'Screen replacement', status: 'RECEIVED' },
        { device_make: 'Apple', device_model: 'iPhone 15', issue: 'Camera replacement', status: 'RECEIVED' },
        { device_make: 'Samsung', device_model: 'Galaxy S22', issue: 'Speaker repair', status: 'RECEIVED' },
      ],
      workloadLabel: override || 'busy',
    },
    {
      id: 'L',
      label: 'Heavy jobs only — laptop screen with 3 laptop jobs ahead',
      description: 'Lenovo laptop screen, device received, 3 laptop repairs ahead',
      job: {
        customer_name: 'Sam Wright',
        device_make: 'Lenovo',
        device_model: 'ThinkPad T14',
        issue: 'Screen replacement',
        status: 'RECEIVED',
        device_in_shop: true,
        requires_parts_order: false,
        deposit_required: false,
        deposit_received: false,
        parts_ordered_at: null,
        parts_expected_at: null,
        short_token: 'scrL12',
        tracking_token: 'tokL12',
      },
      queue: [
        { device_make: 'Dell', device_model: 'Latitude 5520', issue: 'Screen replacement', status: 'IN_REPAIR' },
        { device_make: 'HP', device_model: 'Pavilion 15', issue: 'Keyboard replacement', status: 'RECEIVED' },
        { device_make: 'Asus', device_model: 'ZenBook 14', issue: 'Software reinstall', status: 'RECEIVED' },
      ],
      workloadLabel: override || 'busy',
    },
    {
      id: 'M',
      label: 'Mixed workload — phone screen with phones + laptops + consoles ahead',
      description: 'iPhone screen, device received, mixed queue (2 phones, 2 laptops, 1 console)',
      job: {
        customer_name: 'Jordan Blake',
        device_make: 'Apple',
        device_model: 'iPhone 14',
        issue: 'Screen replacement',
        status: 'RECEIVED',
        device_in_shop: true,
        requires_parts_order: false,
        deposit_required: false,
        deposit_received: false,
        parts_ordered_at: null,
        parts_expected_at: null,
        short_token: 'scrM13',
        tracking_token: 'tokM13',
      },
      queue: [
        { device_make: 'Apple', device_model: 'iPhone 13', issue: 'Battery replacement', status: 'IN_REPAIR' },
        { device_make: 'Samsung', device_model: 'Galaxy S22', issue: 'Charging port', status: 'RECEIVED' },
        { device_make: 'Dell', device_model: 'Latitude 5520', issue: 'Screen replacement', status: 'RECEIVED' },
        { device_make: 'Lenovo', device_model: 'ThinkPad', issue: 'Software reinstall', status: 'RECEIVED' },
        { device_make: 'Sony', device_model: 'PlayStation 5', issue: 'HDMI port replacement', status: 'RECEIVED' },
      ],
      workloadLabel: override || 'normal',
    },
    {
      id: 'N',
      label: 'Mixed workload — laptop screen with phones + laptops + console ahead',
      description: 'Lenovo laptop screen, device received, mixed queue (3 phones, 1 laptop, 1 console)',
      job: {
        customer_name: 'Jordan Blake',
        device_make: 'Lenovo',
        device_model: 'ThinkPad T14',
        issue: 'Screen replacement',
        status: 'RECEIVED',
        device_in_shop: true,
        requires_parts_order: false,
        deposit_required: false,
        deposit_received: false,
        parts_ordered_at: null,
        parts_expected_at: null,
        short_token: 'scrN14',
        tracking_token: 'tokN14',
      },
      queue: [
        { device_make: 'Apple', device_model: 'iPhone 13', issue: 'Battery replacement', status: 'IN_REPAIR' },
        { device_make: 'Samsung', device_model: 'Galaxy S22', issue: 'Charging port', status: 'RECEIVED' },
        { device_make: 'Google', device_model: 'Pixel 7', issue: 'Screen replacement', status: 'RECEIVED' },
        { device_make: 'Dell', device_model: 'Latitude 5520', issue: 'Screen replacement', status: 'RECEIVED' },
        { device_make: 'Sony', device_model: 'PlayStation 5', issue: 'HDMI port replacement', status: 'RECEIVED' },
      ],
      workloadLabel: override || 'normal',
    },
  ]
}

// ---------------------------------------------------------------------------
// Scenario runner — uses the ACTUAL engine functions
// ---------------------------------------------------------------------------

function runScenario(scenario: Scenario) {
  const job = scenario.job
  const deviceType = getDeviceType(job.device_make, job.device_model)
  const priorityTier = getPriorityTier(deviceType, job.issue)

  // Build workload from the simulated queue — no override, let the engine decide
  const effectiveWorkload = calculateWorkloadFromJobs(scenario.queue, {
    device_make: job.device_make,
    device_model: job.device_model,
    issue: job.issue,
  })

  // Base turnaround estimate
  const baseEstimate = getTurnaroundEstimate(
    job.device_make,
    job.device_model,
    job.issue,
    job.status
  )

  // Parts lead time
  let partsLeadDays = 0
  if (job.status === 'PARTS_ORDERED' || job.status === 'AWAITING_DEPOSIT') {
    partsLeadDays = 2
  }

  // ETA strings
  const shortEta = getShortEta(baseEstimate, effectiveWorkload, partsLeadDays)
  const fullEta = getWorkloadAdjustedEta(baseEstimate, effectiveWorkload, partsLeadDays)

  // SMS responses for each intent
  const smsResponses = {
    update: buildUpdateSms(job, effectiveWorkload),
    turnaround: buildTurnaroundSms(job, effectiveWorkload, shortEta),
    collection: buildCollectionSms(job),
    done_check: buildDoneCheckSms(job),
    location: buildLocationSms(job),
  }

  // Tracking page wording
  const trackingWording = buildTrackingWording(job, baseEstimate, effectiveWorkload, fullEta)

  // Parts state
  const partsState = getPartsState(job)

  return {
    scenario: scenario.id,
    label: scenario.label,
    description: scenario.description,
    job: {
      customer_name: job.customer_name,
      device: `${job.device_make} ${job.device_model}`,
      issue: job.issue,
      status: job.status,
      device_in_shop: job.device_in_shop,
    },
    classification: {
      deviceType,
      priorityTier,
      isComplex: baseEstimate.isComplex,
    },
    partsState,
    workload: {
      level: effectiveWorkload.level,
      activeJobs: effectiveWorkload.activeJobs,
      benchHoursAhead: effectiveWorkload.benchHoursAhead,
      weightedBenchHoursAhead: effectiveWorkload.weightedBenchHoursAhead,
      adjustment: effectiveWorkload.adjustment,
      jobsByTier: effectiveWorkload.jobsByTier,
      queueSummary: scenario.queue.length > 0
        ? `${scenario.queue.length} jobs queued: ${scenario.queue.map(q => `${q.device_make} ${q.device_model} (${q.issue})`).join(', ')}`
        : 'Empty queue',
    },
    eta: {
      baseEstimate: baseEstimate.display,
      minHours: baseEstimate.minHours,
      maxHours: baseEstimate.maxHours,
      partsLeadDays,
      shortEta,
      fullEta,
    },
    trackingWording,
    sms: smsResponses,
  }
}

// ---------------------------------------------------------------------------
// Parts state helper
// ---------------------------------------------------------------------------

function getPartsState(job: any): string {
  if (!job.requires_parts_order) return 'Not required — parts in stock'
  if (job.status === 'AWAITING_DEPOSIT') return 'Awaiting deposit before ordering'
  if (job.status === 'PARTS_ORDERED') return 'Ordered — awaiting delivery (2-3 working days)'
  if (job.status === 'PARTS_ARRIVED') return 'Arrived — ready for repair'
  if (job.deposit_received && job.parts_ordered_at) return 'Ordered — awaiting delivery'
  return 'Required — not yet ordered'
}

// ---------------------------------------------------------------------------
// Tracking page wording (mirrors app/t/[token]/page.tsx logic)
// ---------------------------------------------------------------------------

function buildTrackingWording(job: any, estimate: TurnaroundEstimate, workload: WorkloadInfo, fullEta: string): string {
  const status = job.status
  const deviceInShop = job.device_in_shop

  if (status === 'AWAITING_DEVICE') {
    return `Great news — we have the parts in stock for your repair! Just bring your device in whenever suits you during opening hours. No appointment needed. ${fullEta} once we start.`
  }

  if (status === 'QUOTE_APPROVED' && !deviceInShop) {
    return `We're ready for your device — bring it in whenever suits you during opening hours. No appointment needed. ${fullEta} once we start.`
  }

  if (status === 'AWAITING_DEPOSIT') {
    return `We need a £20 deposit to order parts for your repair. Pay here: https://pay.sumup.com/b2c/Q9OZOAJT — Once paid, parts take 2-3 working days to arrive, then ${fullEta}.`
  }

  if (status === 'PARTS_ORDERED') {
    return `Parts are on their way — expected within 2-3 working days. We'll update this page when they arrive and start your repair straight away. ${fullEta} once parts arrive.`
  }

  if (status === 'PARTS_ARRIVED') {
    if (deviceInShop) {
      return `Good news — your parts have arrived and we're getting started. ${fullEta} from this point.`
    } else {
      return `Good news — your parts have arrived! Bring your device in whenever suits you and we'll get started. ${fullEta} once we start.`
    }
  }

  if (status === 'RECEIVED') {
    return `Your device is with us and in the queue. ${fullEta} once we start working on it. We'll text you the moment work begins.`
  }

  if (status === 'DIAGNOSTIC') {
    if (estimate.isComplex) {
      return `We're checking your device over carefully — this is a complex repair and we want to get the diagnosis right. We'll text you with our findings and a quote. A reliable ETA will be provided once we know exactly what's needed.`
    }
    return `We're checking your device over to see what's needed. We'll text you with our findings and a quote — no obligation until you're happy.`
  }

  if (status === 'IN_REPAIR') {
    return `Your device is being worked on right now. ${fullEta}. We'll text you the second it's ready.`
  }

  if (status === 'READY_TO_COLLECT') {
    return `Your device is repaired and ready to collect! Pop in during opening hours: nfdr.uk/h`
  }

  if (status === 'COMPLETED') {
    return `Your device is all repaired and ready to collect. Pop in during opening hours: nfdr.uk/h`
  }

  if (status === 'COLLECTED') {
    return `Your device has been collected — thanks for choosing us!`
  }

  return `Your repair is at the ${status.replace(/_/g, ' ').toLowerCase()} stage.`
}

// ---------------------------------------------------------------------------
// SMS builders (mirror sms/reply/route.ts)
// ---------------------------------------------------------------------------

function buildLocationSms(job: any): string {
  return `Hi ${getFirstName(job.customer_name)},\n\nHere's where we are and our opening hours: nfdr.uk/h\n\nNew Forest Device Repairs`
}

function buildUpdateSms(job: any, workload: WorkloadInfo): string {
  const firstName = getFirstName(job.customer_name)
  const trackingLink = shortTrackingLink(job.short_token || job.tracking_token)
  const statusInfo = getStatusVariant(job.status, 0)
  return `Hi ${firstName},\n\n${statusInfo}\n\nTrack it here: ${trackingLink}\nOur hours: ${shortHoursLink()}\n\nNew Forest Device Repairs`
}

function buildTurnaroundSms(job: any, workload: WorkloadInfo, eta: string): string {
  const firstName = getFirstName(job.customer_name)
  const hoursLink = shortHoursLink()
  const status = job.status
  // Strip leading "about " if present, since templates add their own "about"
  const cleanEta = eta.replace(/^about\s+/i, '')

  if (status === 'READY_TO_COLLECT' || status === 'COMPLETED') {
    return `Hi ${firstName},\n\nIt's already done and ready to collect! Pop in whenever we're open: ${hoursLink}\n\nNew Forest Device Repairs`
  }
  if (status === 'COLLECTED') {
    return `Hi ${firstName},\n\nYour device was already collected — hope all's well! If anything's not right, just text us.\n\nNew Forest Device Repairs`
  }
  if (status === 'IN_REPAIR') {
    return `Hi ${firstName},\n\nWe're working on it right now — should be about ${cleanEta} from when we started. We'll text you the moment it's done.\n\nNew Forest Device Repairs`
  }
  if (status === 'PARTS_ORDERED') {
    return `Hi ${firstName},\n\nParts take 2-3 working days to arrive, then the repair itself is about ${cleanEta}. We'll text you at every step.\n\nNew Forest Device Repairs`
  }
  if (status === 'PARTS_ARRIVED') {
    if (job.device_in_shop) {
      return `Hi ${firstName},\n\nParts are here! The repair itself should take about ${cleanEta}. We'll text you when it's ready to collect.\n\nNew Forest Device Repairs`
    }
    return `Hi ${firstName},\n\nGood news — the parts have arrived! Once you bring your device in, the repair itself takes about ${cleanEta}.\n\nOur hours: ${hoursLink}\nNew Forest Device Repairs`
  }
  if (status === 'AWAITING_DEVICE' || (status === 'QUOTE_APPROVED' && !job.device_in_shop)) {
    return `Hi ${firstName},\n\nWe've got the parts in stock — once you bring your device in, this type of repair takes about ${cleanEta}. No appointment needed!\n\nOur hours: ${hoursLink}\nNew Forest Device Repairs`
  }
  if (status === 'RECEIVED' || status === 'QUOTE_APPROVED') {
    return `Hi ${firstName},\n\nOnce we start on it, this type of repair takes about ${cleanEta}. Your device is in the queue — we'll text you the moment work begins.\n\nNew Forest Device Repairs`
  }
  if (status === 'AWAITING_DEPOSIT') {
    return `Hi ${firstName},\n\nWe need a £20 deposit to order parts first. Once that's paid, parts take 2-3 days to arrive and then the repair is about ${cleanEta}.\n\nPay the deposit here:\nhttps://pay.sumup.com/b2c/Q9OZOAJT\n\nGive us a text if you have any questions.\n\nNew Forest Device Repairs`
  }
  if (status === 'DIAGNOSTIC') {
    return `Hi ${firstName},\n\nWe're still checking your device over. Once we know what's needed, we'll text you a quote and an ETA. Shouldn't be too long.\n\nNew Forest Device Repairs`
  }
  return `Hi ${firstName},\n\n${getStatusVariant(status, 0)}\n\nNew Forest Device Repairs`
}

function buildCollectionSms(job: any): string {
  const firstName = getFirstName(job.customer_name)
  const hoursLink = shortHoursLink()
  const status = job.status

  if (status === 'READY_TO_COLLECT' || status === 'COMPLETED') {
    return `Hi ${firstName},\n\nYes! Your device is ready to collect. Pop in during opening hours: ${hoursLink}\n\nNew Forest Device Repairs`
  }
  if (status === 'COLLECTED') {
    return `Hi ${firstName},\n\nYour device was already collected — hope all's well! If something's not right, just text us here.\n\nNew Forest Device Repairs`
  }
  if (status === 'IN_REPAIR') {
    return `Hi ${firstName},\n\nNot yet — we're still working on it. We'll text you the second it's ready to collect.\n\nOur hours: ${hoursLink}\nNew Forest Device Repairs`
  }
  if (status === 'PARTS_ORDERED') {
    return `Hi ${firstName},\n\nNot yet — we're still waiting on parts to arrive. They usually take 2-3 working days. We'll text you the moment it's ready.\n\nOur hours: ${hoursLink}\nNew Forest Device Repairs`
  }
  if (status === 'PARTS_ARRIVED') {
    if (job.device_in_shop) {
      return `Hi ${firstName},\n\nNot yet — parts have just arrived and we're starting on it now. Shouldn't be too long! We'll text when it's ready.\n\nOur hours: ${hoursLink}\nNew Forest Device Repairs`
    }
    return `Hi ${firstName},\n\nNot yet — the parts have arrived but we need your device first! Bring it in during opening hours and we'll get started straight away.\n\nOur hours: ${hoursLink}\nNew Forest Device Repairs`
  }
  if (status === 'AWAITING_DEVICE' || (status === 'QUOTE_APPROVED' && !job.device_in_shop)) {
    return `Hi ${firstName},\n\nNot yet — we've got the parts in stock, but we need your device first! Bring it in during opening hours and we'll get started.\n\nOur hours: ${hoursLink}\nNew Forest Device Repairs`
  }
  if (status === 'RECEIVED' || status === 'QUOTE_APPROVED') {
    return `Hi ${firstName},\n\nNot yet — your device is in the queue. We'll text you the moment work starts and again when it's ready to collect.\n\nOur hours: ${hoursLink}\nNew Forest Device Repairs`
  }
  if (status === 'AWAITING_DEPOSIT') {
    return `Hi ${firstName},\n\nNot yet — we need a £20 deposit to order parts before we can start the repair. You can pay it here:\nhttps://pay.sumup.com/b2c/Q9OZOAJT\n\nOnce it's paid we'll get parts ordered straight away. Give us a text if you have any questions.\n\nNew Forest Device Repairs`
  }
  if (status === 'DIAGNOSTIC') {
    return `Hi ${firstName},\n\nNot yet — we're still checking your device over. We'll text you with a quote and then we can get started.\n\nNew Forest Device Repairs`
  }
  return `Hi ${firstName},\n\n${getStatusVariant(status, 0)}\n\nOur hours: ${hoursLink}\nNew Forest Device Repairs`
}

function buildDoneCheckSms(job: any): string {
  const firstName = getFirstName(job.customer_name)
  const hoursLink = shortHoursLink()
  const status = job.status

  if (status === 'READY_TO_COLLECT' || status === 'COMPLETED') {
    return `Hi ${firstName},\n\nYes! It's all done and ready to collect. Pop in during opening hours: ${hoursLink}\n\nNew Forest Device Repairs`
  }
  if (status === 'COLLECTED') {
    return `Hi ${firstName},\n\nYes — it was done and you've already collected it. Hope all's well! If anything's not right, just text us.\n\nNew Forest Device Repairs`
  }
  if (status === 'IN_REPAIR') {
    return `Hi ${firstName},\n\nNot yet — we're still working on it. We'll text you the second it's done.\n\nNew Forest Device Repairs`
  }
  if (status === 'PARTS_ORDERED') {
    return `Hi ${firstName},\n\nNot yet — still waiting on parts to arrive. We'll text you once they're in and we start the repair.\n\nNew Forest Device Repairs`
  }
  if (status === 'PARTS_ARRIVED') {
    if (job.device_in_shop) {
      return `Hi ${firstName},\n\nNot yet — parts just arrived and we're starting now. We'll text you when it's done.\n\nNew Forest Device Repairs`
    }
    return `Hi ${firstName},\n\nNot yet — the parts are here but we need your device! Bring it in during opening hours and we'll get started.\n\nOur hours: ${hoursLink}\nNew Forest Device Repairs`
  }
  if (status === 'AWAITING_DEVICE' || (status === 'QUOTE_APPROVED' && !job.device_in_shop)) {
    return `Hi ${firstName},\n\nNot yet — we've got the parts ready but we need your device! Bring it in during opening hours and we'll get started.\n\nOur hours: ${hoursLink}\nNew Forest Device Repairs`
  }
  if (status === 'RECEIVED' || status === 'QUOTE_APPROVED') {
    return `Hi ${firstName},\n\nNot yet — it's in the queue. We'll text you the moment we start on it and again when it's done.\n\nNew Forest Device Repairs`
  }
  if (status === 'AWAITING_DEPOSIT') {
    return `Hi ${firstName},\n\nNot yet — we need a £20 deposit to order parts before we can start. You can pay it here:\nhttps://pay.sumup.com/b2c/Q9OZOAJT\n\nOnce it's paid we'll get parts ordered straight away. Give us a text if you have any questions.\n\nNew Forest Device Repairs`
  }
  if (status === 'DIAGNOSTIC') {
    return `Hi ${firstName},\n\nNot yet — we're still checking your device over. We'll text you with a quote and then we can get started.\n\nNew Forest Device Repairs`
  }
  return `Hi ${firstName},\n\n${getStatusVariant(status, 0)}\n\nNew Forest Device Repairs`
}

function getStatusVariant(status: string, count: number): string {
  const variants: Record<string, string[]> = {
    QUOTE_APPROVED: [
      "We're ready for your device — bring it in whenever suits you during opening hours. No appointment needed!",
      "All sorted on our end — just pop in with your device whenever you're ready.",
      "We're ready to start! Drop in during opening hours and we'll get going straight away.",
    ],
    AWAITING_DEVICE: [
      "Great news — we have the parts in stock for your repair! Just bring your device in whenever suits you during opening hours. No appointment needed!",
      "We've got everything ready for your repair — just bring your device in whenever you're ready. No appointment needed!",
      "Parts are in stock and we're ready to go! Drop in with your device during opening hours and we'll start straight away.",
    ],
    RECEIVED: [
      "Your device is with us and in the queue. We'll text you the moment work starts — no need to chase us!",
      "We've got your device safely checked in. It's in the queue and we'll update you as soon as things get moving.",
      "Good news — your device is booked in and waiting for repair. We'll be in touch the minute there's progress.",
    ],
    IN_REPAIR: [
      "Your device is being worked on right now. We'll text you the second it's ready — sit tight!",
      "We're repairing your device as we speak. Getting it sorted for you — we'll text the moment it's done.",
      "Your repair is underway! We're working on it now and will text you the moment it's finished.",
    ],
    PARTS_ORDERED: [
      "We've ordered the parts for your device. They usually take 2-3 working days to arrive — we'll text you when they turn up.",
      "Parts are on order for your repair. Typically a 2-3 day wait, then we'll crack on with it. We'll let you know when they arrive.",
      "Your parts have been ordered and are on their way. We check deliveries every day and will text you the moment they're in.",
    ],
    PARTS_ARRIVED: [
      "Good news — your parts have arrived! Bring your device in whenever suits you during opening hours and we'll get started.",
      "Parts are here! Whenever you're ready, just drop your device in during opening hours and we'll crack on with the repair.",
      "Your parts have landed! Bring your device in during opening hours and we'll get the repair done.",
    ],
    AWAITING_DEPOSIT: [
      "We need a £20 deposit to order parts for your repair. You can pay it here:\nhttps://pay.sumup.com/b2c/Q9OZOAJT\n\nOnce it's paid we'll get parts ordered straight away.",
      "To get parts ordered, we just need a £20 deposit. Pay online here:\nhttps://pay.sumup.com/b2c/Q9OZOAJT\n\nWe'll text you as soon as the parts arrive.",
      "We're ready to order parts — just need a £20 deposit to get started. Pay here:\nhttps://pay.sumup.com/b2c/Q9OZOAJT\n\nGive us a text if you have any questions.",
    ],
    READY_TO_COLLECT: [
      "Great news — your device is repaired and ready to collect! Pop in during opening hours: nfdr.uk/h",
      "Your device is all fixed and waiting for you! Come and grab it during our opening hours: nfdr.uk/h",
      "It's done! Your device is ready to collect. We're open: nfdr.uk/h — come whenever suits you.",
    ],
    DIAGNOSTIC: [
      "We're checking your device over to see what's needed. We'll text you with our findings and a quote — no obligation until you're happy.",
      "Your device is in diagnostics — we're working out what's going on. We'll be in touch with a quote as soon as we know.",
      "We're testing your device to pin down the issue. Once we know what's needed, we'll text you with a price. No pressure to go ahead.",
    ],
  }
  const v = variants[status]
  if (!v) return `Your repair is at the ${status.replace(/_/g, ' ').toLowerCase()} stage. We'll text you as soon as there's an update.`
  return v[count % v.length]
}
