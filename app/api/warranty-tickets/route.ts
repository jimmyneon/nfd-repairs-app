import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'

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

    // Verify API key
    const apiKey = request.headers.get('X-API-KEY')
    if (!apiKey) {
      return NextResponse.json(
        { error: 'Missing X-API-KEY header' },
        { status: 401 }
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
        { status: 401 }
      )
    }

    // Parse request body
    const body = await request.json()

    // Validate required fields
    if (!body.customer?.name || !body.customer?.phone || !body.issue?.description) {
      return NextResponse.json(
        { error: 'Missing required fields: customer.name, customer.phone, issue.description' },
        { status: 400 }
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
      })
    }

    // Attempt to match to existing job
    const matchResult = await matchToJob(supabase, {
      jobId: body.repair?.jobId,
      reference: body.repair?.reference,
      phone: body.customer.phone
    })

    // Create warranty ticket
    const { data: ticket, error: ticketError } = await supabase
      .from('warranty_tickets')
      .insert({
        source: body.source || 'website',
        submitted_at: body.submittedAt || new Date().toISOString(),
        customer_name: body.customer.name,
        customer_phone: body.customer.phone,
        customer_email: body.customer.email || null,
        matched_job_id: matchResult.jobId,
        match_confidence: matchResult.confidence,
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
        { status: 500 }
      )
    }

    // Create initial event
    await supabase
      .from('warranty_ticket_events')
      .insert({
        ticket_id: ticket.id,
        type: 'SYSTEM',
        message: `Ticket created from ${body.source || 'website'}`,
        metadata: {
          matchConfidence: matchResult.confidence,
          matchedJobId: matchResult.jobId
        }
      })

    console.log('Warranty ticket created:', ticket.ticket_ref)

    return NextResponse.json({
      ticketId: ticket.id,
      ticketRef: ticket.ticket_ref,
      matchedJobId: matchResult.jobId,
      matchConfidence: matchResult.confidence,
      status: ticket.status
    })

  } catch (error) {
    console.error('Error in warranty-tickets API:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
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
 * Match warranty ticket to existing job
 * Priority: jobId > reference > phone + recent job
 */
async function matchToJob(
  supabase: any,
  params: { jobId?: string; reference?: string; phone: string }
): Promise<{ jobId: string | null; confidence: string }> {
  
  // Try matching by jobId (highest confidence)
  if (params.jobId) {
    const { data: job } = await supabase
      .from('jobs')
      .select('id')
      .eq('id', params.jobId)
      .single()
    
    if (job) {
      return { jobId: job.id, confidence: 'high' }
    }
  }

  // Try matching by job reference (high confidence)
  if (params.reference) {
    const { data: job } = await supabase
      .from('jobs')
      .select('id')
      .eq('job_ref', params.reference)
      .single()
    
    if (job) {
      return { jobId: job.id, confidence: 'high' }
    }
  }

  // Try matching by phone + most recent job within 90 days (medium/low confidence)
  const ninetyDaysAgo = new Date()
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90)

  const { data: jobs } = await supabase
    .from('jobs')
    .select('id, created_at, status')
    .eq('customer_phone', params.phone)
    .gte('created_at', ninetyDaysAgo.toISOString())
    .order('created_at', { ascending: false })
    .limit(1)

  if (jobs && jobs.length > 0) {
    const job = jobs[0]
    const daysSinceCreation = Math.floor(
      (Date.now() - new Date(job.created_at).getTime()) / (1000 * 60 * 60 * 24)
    )
    
    // Medium confidence if within 30 days, low if 30-90 days
    const confidence = daysSinceCreation <= 30 ? 'medium' : 'low'
    return { jobId: job.id, confidence }
  }

  // No match found
  return { jobId: null, confidence: 'none' }
}
