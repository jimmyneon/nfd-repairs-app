import { NextResponse } from 'next/server'
import { getFirstName } from '@/lib/sms-template'
import { shortTrackingLink, shortHoursLink } from '@/lib/utils'

/**
 * GET /api/sms/test-responses
 *
 * Returns all possible SMS responses for all intents × statuses
 * WITHOUT sending any actual SMS. Used for testing/review only.
 *
 * Add ?phone=07xxxxxxxxx to use a real customer name/device from the DB.
 */
export async function GET(request: Request) {
  const url = new URL(request.url)
  const phoneParam = url.searchParams.get('phone')

  // Default test job
  let job: any = {
    customer_name: 'John Smith',
    device_make: 'Apple',
    device_model: 'iPhone 13',
    issue: 'Screen replacement',
    short_token: 'abc123',
    tracking_token: 'xyz789',
  }

  // If phone provided, try to load real job data
  if (phoneParam) {
    try {
      const { createClient } = await import('@supabase/supabase-js')
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        { auth: { autoRefreshToken: false, persistSession: false } }
      )

      const normalised = normaliseUkPhoneForLookup(phoneParam)
      const { data: jobs } = await supabase
        .from('jobs')
        .select('id, job_ref, customer_name, customer_phone, status, device_make, device_model, issue, tracking_token, short_token')
        .in('customer_phone', [normalised, phoneParam.trim()])
        .order('created_at', { ascending: false })
        .limit(1)

      if (jobs && jobs.length > 0) {
        job = { ...job, ...jobs[0] }
      }
    } catch (e) {
      // Ignore — use default test job
    }
  }

  const statuses = [
    'QUOTE_APPROVED', 'RECEIVED', 'IN_REPAIR', 'PARTS_ORDERED',
    'PARTS_ARRIVED', 'AWAITING_DEPOSIT', 'READY_TO_COLLECT',
    'COMPLETED', 'COLLECTED', 'DIAGNOSTIC',
  ]

  const intents = [
    { key: 'collection', label: 'Can I pick it up?', message: 'Can I pick it up?' },
    { key: 'turnaround', label: 'How long will it take?', message: 'How long will it take?' },
    { key: 'done_check', label: 'Is it done?', message: 'Is it done?' },
    { key: 'update', label: 'Update (1st text)', message: 'update', variant: 0 },
    { key: 'update', label: 'Update (2nd text)', message: 'update', variant: 1 },
    { key: 'update', label: 'Update (3rd text)', message: 'update', variant: 2 },
    { key: 'location', label: 'Where are you?', message: 'Where are you located?' },
  ]

  const results: any[] = []

  for (const status of statuses) {
    const testJob = { ...job, status }
    const statusResults: any = { status, responses: [] }

    for (const intent of intents) {
      const smsCount = intent.variant !== undefined ? intent.variant : 0
      const response = buildResponseForIntent(intent.key, testJob, smsCount)
      statusResults.responses.push({
        intent: intent.label,
        message: response,
      })
    }

    results.push(statusResults)
  }

  return NextResponse.json({
    job: {
      customer_name: job.customer_name,
      device: `${job.device_make} ${job.device_model}`,
      issue: job.issue,
      status: job.status,
    },
    results,
  }, { headers: { 'Cache-Control': 'no-store' } })
}

// ---------------------------------------------------------------------------
// Helper functions (copied from sms/reply/route.ts for testing)
// ---------------------------------------------------------------------------

function normaliseUkPhoneForLookup(raw: string): string {
  const digits = raw.replace(/[^\d+]/g, '')
  if (/^\+447\d{9}$/.test(digits)) return digits
  if (/^00447\d{9}$/.test(digits)) return `+447${digits.slice(5)}`
  if (/^447\d{9}$/.test(digits)) return `+${digits}`
  if (/^07\d{9}$/.test(digits)) return `+44${digits.slice(1)}`
  return raw.trim()
}

function getTurnaroundText(job: any): string {
  const make = (job.device_make || '').toLowerCase()
  const model = (job.device_model || '').toLowerCase()
  const issue = (job.issue || '').toLowerCase()
  const combined = `${make} ${model}`

  const complex = issue.includes('motherboard') || issue.includes('logic board') ||
    issue.includes('no power') || issue.includes('wont turn on') || issue.includes("won't turn on") ||
    issue.includes('water damage') || issue.includes('liquid damage') || issue.includes('data recovery')

  if (complex) {
    if (issue.includes('data recovery')) return 'up to 7 days'
    return 'up to 7 days, often quicker'
  }

  if (combined.includes('iphone') || combined.includes('samsung') && !combined.includes('tab') ||
      combined.includes('pixel') || combined.includes('phone')) {
    if (issue.includes('battery')) return '1-3 hours'
    if (issue.includes('screen') || issue.includes('display') || issue.includes('lcd') || issue.includes('oled')) return '2-6 hours, sometimes next day'
    if (issue.includes('charging')) return '2-4 hours, sometimes 1-2 days'
    if (issue.includes('camera')) return '1-3 hours'
    if (issue.includes('back glass') || issue.includes('back cover')) return '1-3 days'
    return '2-6 hours, sometimes 1-2 days'
  }

  if (combined.includes('ipad') || combined.includes('tablet') || combined.includes('tab ')) {
    if (issue.includes('battery')) return '2-4 hours'
    if (issue.includes('screen') || issue.includes('display')) return '2-8 hours, sometimes 1-2 days'
    return '1-3 days'
  }

  if (combined.includes('macbook') || combined.includes('laptop') || combined.includes('notebook') || combined.includes('chromebook')) {
    if (issue.includes('battery')) return '1-2 days'
    if (issue.includes('screen') || issue.includes('display')) return '1-3 days'
    if (issue.includes('keyboard')) return '1-2 days'
    return '1-3 days'
  }

  if (combined.includes('playstation') || combined.includes('xbox') || combined.includes('nintendo') || combined.includes('ps4') || combined.includes('ps5')) {
    return '1-2 days'
  }

  return '1-5 days depending on the repair'
}

const STATUS_SMS_VARIANTS: Record<string, string[]> = {
  QUOTE_APPROVED: [
    "Your repair's all approved and ready to go — just bring your device in whenever suits you. No appointment needed!",
    "All sorted on our end — your repair's booked in and waiting. Pop in with your device whenever you're ready.",
    "We're ready for your device! Your repair's approved, so just drop in during opening hours and we'll get started.",
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
    "Your parts have arrived! We're getting started on your repair now — shouldn't be too long.",
    "Good news — parts are here and we're cracking on with your repair. We'll text when it's done.",
    "Parts landed! We're starting your repair straight away. We'll be in touch the moment it's finished.",
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
  COMPLETED: [
    "Your device is all repaired and ready to collect. Pop in during opening hours: nfdr.uk/h",
    "All done! Your device is fixed and waiting for you. Come grab it during opening hours: nfdr.uk/h",
    "Your repair's complete and ready for collection. We're open: nfdr.uk/h — see you soon!",
  ],
  COLLECTED: [
    "Your device has been collected — thanks for choosing us! If anything's not right, just text us here.",
    "All sorted — you've collected your device. Thanks for the business! Give us a shout if you need anything else.",
    "Thanks for coming in! Your device's all sorted. If you have any issues, just text us here anytime.",
  ],
  DIAGNOSTIC: [
    "We're checking your device over to see what's needed. We'll text you with our findings and a quote — no obligation until you're happy.",
    "Your device is in diagnostics — we're working out what's going on. We'll be in touch with a quote as soon as we know.",
    "We're testing your device to pin down the issue. Once we know what's needed, we'll text you with a price. No pressure to go ahead.",
  ],
}

function pickVariant(status: string, messageCount: number): string | null {
  const variants = STATUS_SMS_VARIANTS[status]
  if (!variants || variants.length === 0) return null
  return variants[messageCount % variants.length]
}

function fallbackStatusMessage(status: string): string {
  const readable = status.replace(/_/g, ' ').toLowerCase()
  return `Your repair is at the ${readable} stage. We'll text you as soon as there's an update.`
}

function buildResponseForIntent(intent: string, job: any, smsCount: number): string {
  const firstName = getFirstName(job.customer_name)
  const hoursLink = shortHoursLink()
  const trackingLink = job.short_token ? shortTrackingLink(job.short_token) : shortTrackingLink(job.tracking_token)
  const status = job.status
  const eta = getTurnaroundText(job)

  if (intent === 'location') {
    return `Hi ${firstName},\n\nHere's where we are and our opening hours: nfdr.uk/h\n\nNew Forest Device Repairs`
  }

  if (intent === 'collection') {
    if (status === 'READY_TO_COLLECT' || status === 'COMPLETED') {
      const variants = [
        `Yes! Your device is ready to collect. Pop in during opening hours: ${hoursLink}`,
        `It's all done and waiting for you! Come grab it whenever we're open: ${hoursLink}`,
        `Good news — it's ready! Come in whenever suits you: ${hoursLink}`,
      ]
      return `Hi ${firstName},\n\n${variants[smsCount % variants.length]}\n\nNew Forest Device Repairs`
    }
    if (status === 'COLLECTED') {
      return `Hi ${firstName},\n\nYour device was already collected — hope all's well! If something's not right, just text us here.\n\nNew Forest Device Repairs`
    }
    if (status === 'IN_REPAIR') {
      const variants = [
        "Not yet — we're still working on it. We'll text you the second it's ready to collect.",
        "Still being repaired, I'm afraid. We'll give you a buzz the moment it's done and ready for you.",
        "Not quite there yet — we're still fixing it. We'll text you as soon as it's ready to pick up.",
      ]
      return `Hi ${firstName},\n\n${variants[smsCount % variants.length]}\n\nOur hours: ${hoursLink}\nNew Forest Device Repairs`
    }
    if (status === 'PARTS_ORDERED') {
      const variants = [
        "Not yet — we're still waiting on parts to arrive. They usually take 2-3 working days. We'll text you the moment it's ready.",
        "Still waiting on parts, I'm afraid. Once they arrive we'll crack on with the repair and text you when it's done.",
        "Not yet — parts are on their way. We'll text you as soon as the repair's finished and it's ready to collect.",
      ]
      return `Hi ${firstName},\n\n${variants[smsCount % variants.length]}\n\nOur hours: ${hoursLink}\nNew Forest Device Repairs`
    }
    if (status === 'PARTS_ARRIVED') {
      const variants = [
        "Not yet — parts have just arrived and we're starting on it now. Shouldn't be too long! We'll text when it's ready.",
        "Almost there — parts are in and we're working on it. We'll text you the moment it's ready to collect.",
        "Not quite — we've just started the repair with the new parts. We'll text you as soon as it's done.",
      ]
      return `Hi ${firstName},\n\n${variants[smsCount % variants.length]}\n\nOur hours: ${hoursLink}\nNew Forest Device Repairs`
    }
    if (status === 'RECEIVED' || status === 'QUOTE_APPROVED') {
      const variants = [
        "Not yet — your device is in the queue. We'll text you the moment work starts and again when it's ready to collect.",
        "Still in the queue, I'm afraid. We'll text you as soon as we start on it and again when it's ready.",
        "Not yet — we've got it checked in and waiting. We'll text you the moment it's ready to pick up.",
      ]
      return `Hi ${firstName},\n\n${variants[smsCount % variants.length]}\n\nOur hours: ${hoursLink}\nNew Forest Device Repairs`
    }
    if (status === 'AWAITING_DEPOSIT') {
      return `Hi ${firstName},\n\nNot yet — we need a £20 deposit to order parts before we can start the repair. You can pay it here:\nhttps://pay.sumup.com/b2c/Q9OZOAJT\n\nOnce it's paid we'll get parts ordered straight away. Give us a text if you have any questions.\n\nNew Forest Device Repairs`
    }
    if (status === 'DIAGNOSTIC') {
      return `Hi ${firstName},\n\nNot yet — we're still checking your device over. We'll text you with a quote and then we can get started.\n\nNew Forest Device Repairs`
    }
    const statusInfo = pickVariant(status, smsCount) || fallbackStatusMessage(status)
    return `Hi ${firstName},\n\n${statusInfo}\n\nOur hours: ${hoursLink}\nNew Forest Device Repairs`
  }

  if (intent === 'turnaround') {
    if (status === 'READY_TO_COLLECT' || status === 'COMPLETED') {
      return `Hi ${firstName},\n\nIt's already done and ready to collect! Pop in whenever we're open: ${hoursLink}\n\nNew Forest Device Repairs`
    }
    if (status === 'COLLECTED') {
      return `Hi ${firstName},\n\nYour device was already collected — hope all's well! If anything's not right, just text us.\n\nNew Forest Device Repairs`
    }
    if (status === 'IN_REPAIR') {
      const variants = [
        `We're working on it right now — should be about ${eta} from when we started. We'll text you the moment it's done.`,
        `Currently being repaired — typically ${eta} for this type of job. We'll text you as soon as it's ready.`,
        `We're on it! Expect about ${eta} for this repair. We'll be in touch the second it's finished.`,
      ]
      return `Hi ${firstName},\n\n${variants[smsCount % variants.length]}\n\nNew Forest Device Repairs`
    }
    if (status === 'PARTS_ORDERED') {
      const variants = [
        `Parts take 2-3 working days to arrive, then the repair itself is about ${eta}. We'll text you at every step.`,
        `We're waiting on parts (2-3 days), then it's about ${eta} to do the repair. We'll let you know when parts land.`,
        `Once parts arrive (usually 2-3 days), the repair takes about ${eta}. We'll text you the moment it's ready.`,
      ]
      return `Hi ${firstName},\n\n${variants[smsCount % variants.length]}\n\nNew Forest Device Repairs`
    }
    if (status === 'PARTS_ARRIVED') {
      const variants = [
        `Parts are here! The repair itself should take about ${eta}. We'll text you when it's ready to collect.`,
        `Parts just landed — now it's about ${eta} to do the repair. We'll be in touch the moment it's done.`,
        `Good news — parts are in. Expect about ${eta} for the repair. We'll text you as soon as it's finished.`,
      ]
      return `Hi ${firstName},\n\n${variants[smsCount % variants.length]}\n\nNew Forest Device Repairs`
    }
    if (status === 'RECEIVED' || status === 'QUOTE_APPROVED') {
      const variants = [
        `Once we start on it, this type of repair takes about ${eta}. Your device is in the queue — we'll text you the moment work begins.`,
        `Typically ${eta} for this repair once we get started. It's in the queue and we'll text you as soon as we crack on.`,
        `This repair is usually about ${eta}. We'll text you the moment we start working on it.`,
      ]
      return `Hi ${firstName},\n\n${variants[smsCount % variants.length]}\n\nNew Forest Device Repairs`
    }
    if (status === 'AWAITING_DEPOSIT') {
      return `Hi ${firstName},\n\nWe need a £20 deposit to order parts first. Once that's paid, parts take 2-3 days to arrive and then the repair is about ${eta}.\n\nPay the deposit here:\nhttps://pay.sumup.com/b2c/Q9OZOAJT\n\nGive us a text if you have any questions.\n\nNew Forest Device Repairs`
    }
    if (status === 'DIAGNOSTIC') {
      return `Hi ${firstName},\n\nWe're still checking your device over. Once we know what's needed, we'll text you a quote and an ETA. Shouldn't be too long.\n\nNew Forest Device Repairs`
    }
    const statusInfo = pickVariant(status, smsCount) || fallbackStatusMessage(status)
    return `Hi ${firstName},\n\n${statusInfo}\n\nNew Forest Device Repairs`
  }

  if (intent === 'done_check') {
    if (status === 'READY_TO_COLLECT' || status === 'COMPLETED') {
      const variants = [
        `Yes! It's all done and ready to collect. Pop in during opening hours: ${hoursLink}`,
        `Done and dusted! Come grab it whenever we're open: ${hoursLink}`,
        `Yes, it's finished! Ready for collection — come in whenever suits you: ${hoursLink}`,
      ]
      return `Hi ${firstName},\n\n${variants[smsCount % variants.length]}\n\nNew Forest Device Repairs`
    }
    if (status === 'COLLECTED') {
      return `Hi ${firstName},\n\nYes — it was done and you've already collected it. Hope all's well! If anything's not right, just text us.\n\nNew Forest Device Repairs`
    }
    if (status === 'IN_REPAIR') {
      const variants = [
        "Not yet — we're still working on it. We'll text you the second it's done.",
        "Still in progress, I'm afraid. We'll text you the moment it's finished.",
        "Not quite — still being repaired. We'll be in touch as soon as it's done.",
      ]
      return `Hi ${firstName},\n\n${variants[smsCount % variants.length]}\n\nNew Forest Device Repairs`
    }
    if (status === 'PARTS_ORDERED') {
      const variants = [
        "Not yet — still waiting on parts to arrive. We'll text you once they're in and we start the repair.",
        "Not yet, I'm afraid — parts are on order. We'll text you as soon as the repair's done.",
        "Still waiting on parts. Once they arrive we'll crack on and text you the moment it's finished.",
      ]
      return `Hi ${firstName},\n\n${variants[smsCount % variants.length]}\n\nNew Forest Device Repairs`
    }
    if (status === 'PARTS_ARRIVED') {
      const variants = [
        "Not yet — parts just arrived and we're starting now. We'll text you when it's done.",
        "Not quite — we've just started the repair with the new parts. We'll text you the moment it's finished.",
        "Almost — parts are in and we're on it. We'll text you as soon as it's done.",
      ]
      return `Hi ${firstName},\n\n${variants[smsCount % variants.length]}\n\nNew Forest Device Repairs`
    }
    if (status === 'RECEIVED' || status === 'QUOTE_APPROVED') {
      const variants = [
        "Not yet — it's in the queue. We'll text you the moment we start on it and again when it's done.",
        "Not yet, I'm afraid — still waiting to be started. We'll text you as soon as it's finished.",
        "Not yet — it's checked in and in the queue. We'll text you the moment it's done.",
      ]
      return `Hi ${firstName},\n\n${variants[smsCount % variants.length]}\n\nNew Forest Device Repairs`
    }
    if (status === 'AWAITING_DEPOSIT') {
      return `Hi ${firstName},\n\nNot yet — we need a £20 deposit to order parts before we can start. You can pay it here:\nhttps://pay.sumup.com/b2c/Q9OZOAJT\n\nOnce it's paid we'll get parts ordered straight away. Give us a text if you have any questions.\n\nNew Forest Device Repairs`
    }
    if (status === 'DIAGNOSTIC') {
      return `Hi ${firstName},\n\nNot yet — we're still checking your device over. We'll text you with a quote and then we can get started.\n\nNew Forest Device Repairs`
    }
    const statusInfo = pickVariant(status, smsCount) || fallbackStatusMessage(status)
    return `Hi ${firstName},\n\n${statusInfo}\n\nNew Forest Device Repairs`
  }

  // update intent
  const statusInfo = pickVariant(status, smsCount) || fallbackStatusMessage(status)
  return `Hi ${firstName},\n\n${statusInfo}\n\nTrack it here: ${trackingLink}\nOur hours: ${hoursLink}\n\nNew Forest Device Repairs`
}
