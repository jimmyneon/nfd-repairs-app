import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'

/**
 * OPTIONS /api/warranty-tickets
 * Handle CORS preflight requests
 */
export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-API-KEY',
      'Access-Control-Max-Age': '86400',
    },
  })
}

/**
 * POST /api/warranty-tickets
 * Create warranty ticket from website or external source
 * Requires X-API-KEY header for authentication
 */
export async function POST(request: NextRequest) {
  try {
    // Use service role key to bypass RLS
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-API-KEY',
    }

    // Verify API key
    const apiKey = request.headers.get('X-API-KEY')
    if (!apiKey) {
      return NextResponse.json(
        { error: 'Missing X-API-KEY header' },
        { status: 401, headers: corsHeaders }
      )
    }

    // Get stored API key from admin_settings
    const { data: settingData } = await supabase
      .from('admin_settings')
      .select('value')
      .eq('key', 'warranty_api_key')
      .single()

    if (!settingData || apiKey !== settingData.value) {
      return NextResponse.json(
        { error: 'Invalid API key' },
        { status: 401, headers: corsHeaders }
      )
    }

    // Parse request body
    const body = await request.json()

    // Validate required fields
    if (!body.customer?.name || !body.customer?.phone || !body.issue?.description) {
      return NextResponse.json(
        { error: 'Missing required fields: customer.name, customer.phone, issue.description' },
        { status: 400, headers: corsHeaders }
      )
    }

    // Generate idempotency key if not provided
    const idempotencyKey = request.headers.get('Idempotency-Key') || 
      generateIdempotencyKey(
        body.customer.phone,
        body.issue.description,
        body.submittedAt || new Date().toISOString()
      )

    // Check for duplicate using idempotency key
    const { data: existingTicket } = await supabase
      .from('warranty_tickets')
      .select('id, ticket_ref, matched_job_id, status')
      .eq('idempotency_key', idempotencyKey)
      .single()

    if (existingTicket) {
      console.log('Duplicate ticket prevented:', idempotencyKey)
      return NextResponse.json({
        ticketId: existingTicket.id,
        ticketRef: existingTicket.ticket_ref,
        matchedJobId: existingTicket.matched_job_id,
        status: existingTicket.status,
        duplicate: true
      }, {
        headers: corsHeaders
      })
    }

    // Find suggested job matches
    const suggestions = await findJobSuggestions(supabase, {
      jobId: body.repair?.jobId,
      reference: body.repair?.reference,
      phone: body.customer.phone,
      deviceModel: body.repair?.deviceModel
    })

    // Only auto-match if we have a high confidence match with exact reference
    const autoMatch = suggestions.find(s => s.confidence === 'high' && s.matchReason === 'reference')
    
    // Create warranty ticket
    const { data: ticket, error: ticketError } = await supabase
      .from('warranty_tickets')
      .insert({
        source: body.source || 'website',
        submitted_at: body.submittedAt || new Date().toISOString(),
        customer_name: body.customer.name,
        customer_phone: body.customer.phone,
        customer_email: body.customer.email || null,
        matched_job_id: autoMatch?.jobId || null,
        match_confidence: autoMatch ? 'high' : (suggestions.length > 0 ? 'none' : 'none'),
        suggested_jobs: suggestions,
        job_reference: body.repair?.reference || null,
        device_model: body.repair?.deviceModel || null,
        issue_description: body.issue.description,
        issue_category: body.issue.category || null,
        attachments: body.attachments || [],
        ip_address: body.metadata?.ip || null,
        user_agent: body.metadata?.userAgent || null,
        idempotency_key: idempotencyKey,
        status: 'NEW'
      })
      .select()
      .single()

    if (ticketError) {
      console.error('Error creating warranty ticket:', ticketError)
      return NextResponse.json(
        { error: 'Failed to create warranty ticket' },
        { status: 500, headers: corsHeaders }
      )
    }

    // Create initial event
    await supabase
      .from('warranty_ticket_events')
      .insert({
        ticket_id: ticket.id,
        type: 'SYSTEM',
        message: `Ticket created from ${body.source || 'website'}${autoMatch ? ' - Auto-matched to job' : suggestions.length > 0 ? ` - ${suggestions.length} job suggestions found` : ' - No matching jobs found'}`,
        metadata: {
          autoMatched: !!autoMatch,
          suggestionsCount: suggestions.length,
          matchedJobId: autoMatch?.jobId || null
        }
      })

    console.log('Warranty ticket created:', ticket.ticket_ref, `(${suggestions.length} suggestions)`)

    return NextResponse.json({
      ticketId: ticket.id,
      ticketRef: ticket.ticket_ref,
      matchedJobId: autoMatch?.jobId || null,
      matchConfidence: autoMatch ? 'high' : 'none',
      suggestionsCount: suggestions.length,
      status: ticket.status
    }, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, X-API-KEY',
      }
    })

  } catch (error) {
    console.error('Error in warranty-tickets API:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { 
        status: 500,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, X-API-KEY',
        }
      }
    )
  }
}

/**
 * Generate idempotency key from phone, description, and timestamp
 * Rounds timestamp to 5-minute intervals to prevent duplicates
 */
function generateIdempotencyKey(phone: string, description: string, timestamp: string): string {
  // Round timestamp to 5-minute intervals
  const date = new Date(timestamp)
  const roundedMinutes = Math.floor(date.getMinutes() / 5) * 5
  date.setMinutes(roundedMinutes, 0, 0)
  
  const key = `${phone}|${description.substring(0, 100)}|${date.toISOString()}`
  return crypto.createHash('sha256').update(key).digest('hex')
}

/**
 * Generate all possible phone number format variants
 * Handles: +44, 0, 00, with/without spaces
 */
function generatePhoneVariants(phone: string): string[] {
  const variants = new Set<string>()
  
  // Normalize: remove all spaces and non-digit characters except +
  const normalized = phone.replace(/[\s\-()]/g, '')
  variants.add(normalized)
  
  // Extract the core number (without country code)
  let coreNumber = normalized
  
  if (normalized.startsWith('+44')) {
    coreNumber = normalized.substring(3)
  } else if (normalized.startsWith('0044')) {
    coreNumber = normalized.substring(4)
  } else if (normalized.startsWith('44')) {
    coreNumber = normalized.substring(2)
  } else if (normalized.startsWith('0')) {
    coreNumber = normalized.substring(1)
  }
  
  // Generate all variants
  variants.add('+44' + coreNumber)           // +447410381247
  variants.add('0' + coreNumber)             // 07410381247
  variants.add('0044' + coreNumber)          // 00447410381247
  variants.add('44' + coreNumber)            // 447410381247
  
  // Also add with spaces (common formats)
  variants.add('+44 ' + coreNumber)
  variants.add('0' + coreNumber.substring(0, 4) + ' ' + coreNumber.substring(4))
  
  return Array.from(variants)
}

/**
 * Find suggested job matches for warranty ticket
 * Returns array of suggestions with confidence scores
 * Staff will manually select the correct match
 */
async function findJobSuggestions(
  supabase: any,
  params: { jobId?: string; reference?: string; phone: string; deviceModel?: string }
): Promise<Array<{
  jobId: string
  jobRef: string
  confidence: 'high' | 'medium' | 'low'
  matchReason: string
  customerName: string
  deviceMake: string
  deviceModel: string
  createdAt: string
  status: string
}>> {
  
  const suggestions: any[] = []

  // 1. Try matching by exact job reference (100% match)
  if (params.reference) {
    const { data: job } = await supabase
      .from('jobs')
      .select('id, job_ref, customer_name, device_make, device_model, created_at, status')
      .eq('job_ref', params.reference)
      .single()
    
    if (job) {
      suggestions.push({
        jobId: job.id,
        jobRef: job.job_ref,
        confidence: 'high',
        matchReason: 'reference',
        customerName: job.customer_name,
        deviceMake: job.device_make,
        deviceModel: job.device_model,
        createdAt: job.created_at,
        status: job.status
      })
      // If we have exact reference match, return only this
      return suggestions
    }
  }

  // 2. Try matching by jobId if provided
  if (params.jobId) {
    const { data: job } = await supabase
      .from('jobs')
      .select('id, job_ref, customer_name, device_make, device_model, created_at, status')
      .eq('id', params.jobId)
      .single()
    
    if (job) {
      suggestions.push({
        jobId: job.id,
        jobRef: job.job_ref,
        confidence: 'high',
        matchReason: 'job_id',
        customerName: job.customer_name,
        deviceMake: job.device_make,
        deviceModel: job.device_model,
        createdAt: job.created_at,
        status: job.status
      })
    }
  }

  // 3. Find jobs by phone number within 90 days
  // Try multiple phone number formats: +44, 0, 00
  const ninetyDaysAgo = new Date()
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90)

  const phoneVariants = generatePhoneVariants(params.phone)
  
  const { data: phoneJobs } = await supabase
    .from('jobs')
    .select('id, job_ref, customer_name, device_make, device_model, created_at, status, customer_phone')
    .in('customer_phone', phoneVariants)
    .gte('created_at', ninetyDaysAgo.toISOString())
    .order('created_at', { ascending: false })
    .limit(10)

  if (phoneJobs && phoneJobs.length > 0) {
    phoneJobs.forEach((job: any) => {
      // Skip if already added
      if (suggestions.find(s => s.jobId === job.id)) return

      const daysSinceCreation = Math.floor(
        (Date.now() - new Date(job.created_at).getTime()) / (1000 * 60 * 60 * 24)
      )
      
      // Check if device model matches
      const deviceMatch = params.deviceModel && 
        job.device_model.toLowerCase().includes(params.deviceModel.toLowerCase())
      
      let confidence: 'high' | 'medium' | 'low'
      let matchReason: string
      
      if (deviceMatch && daysSinceCreation <= 30) {
        confidence = 'high'
        matchReason = 'phone_device_recent'
      } else if (deviceMatch) {
        confidence = 'medium'
        matchReason = 'phone_device'
      } else if (daysSinceCreation <= 30) {
        confidence = 'medium'
        matchReason = 'phone_recent'
      } else {
        confidence = 'low'
        matchReason = 'phone_old'
      }

      suggestions.push({
        jobId: job.id,
        jobRef: job.job_ref,
        confidence,
        matchReason,
        customerName: job.customer_name,
        deviceMake: job.device_make,
        deviceModel: job.device_model,
        createdAt: job.created_at,
        status: job.status
      })
    })
  }

  // Sort by confidence and date
  suggestions.sort((a, b) => {
    const confOrder = { high: 3, medium: 2, low: 1 }
    if (confOrder[a.confidence] !== confOrder[b.confidence]) {
      return confOrder[b.confidence] - confOrder[a.confidence]
    }
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  })

  return suggestions
}
