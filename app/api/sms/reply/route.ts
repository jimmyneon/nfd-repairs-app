import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

/**
 * POST /api/sms/reply
 * Handle inbound SMS replies from MacroDroid
 * Creates warranty ticket if customer replies to post-collection SMS
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const body = await request.json()
    const { phone, message, timestamp, threadId } = body

    if (!phone || !message) {
      return NextResponse.json(
        { error: 'Missing phone or message' },
        { status: 400 }
      )
    }

    console.log('Received SMS reply from:', phone)

    // Find most recent job for this phone number
    const { data: jobs } = await supabase
      .from('jobs')
      .select('*')
      .eq('customer_phone', phone)
      .order('created_at', { ascending: false })
      .limit(1)

    const job = jobs?.[0]

    if (!job) {
      console.log('No job found for phone:', phone)
      return NextResponse.json({
        success: true,
        message: 'No matching job found'
      })
    }

    // Check if there's already an open warranty ticket for this job
    const { data: existingTickets } = await supabase
      .from('warranty_tickets')
      .select('*')
      .eq('matched_job_id', job.id)
      .in('status', ['NEW', 'NEEDS_ATTENTION', 'IN_PROGRESS'])
      .order('created_at', { ascending: false })
      .limit(1)

    let ticket = existingTickets?.[0]

    if (ticket) {
      // Update existing ticket status to NEEDS_ATTENTION
      await supabase
        .from('warranty_tickets')
        .update({
          status: 'NEEDS_ATTENTION',
          sms_thread_id: threadId || null,
          inbound_messages: supabase.rpc('jsonb_array_append', {
            arr: ticket.inbound_messages || [],
            elem: {
              message,
              timestamp: timestamp || new Date().toISOString(),
              phone
            }
          })
        })
        .eq('id', ticket.id)

      // Log event
      await supabase
        .from('warranty_ticket_events')
        .insert({
          ticket_id: ticket.id,
          type: 'SMS_RECEIVED',
          message: `Customer replied: ${message.substring(0, 100)}...`,
          metadata: { phone, threadId }
        })

      console.log('Updated existing warranty ticket:', ticket.ticket_ref)
    } else {
      // Create new warranty ticket
      const { data: newTicket, error: ticketError } = await supabase
        .from('warranty_tickets')
        .insert({
          source: 'sms_reply',
          submitted_at: timestamp || new Date().toISOString(),
          customer_name: job.customer_name,
          customer_phone: phone,
          customer_email: job.customer_email,
          matched_job_id: job.id,
          match_confidence: 'high',
          job_reference: job.job_ref,
          device_model: `${job.device_make} ${job.device_model}`,
          issue_description: message,
          issue_category: 'warranty',
          status: 'NEEDS_ATTENTION',
          sms_thread_id: threadId || null,
          inbound_messages: [{
            message,
            timestamp: timestamp || new Date().toISOString(),
            phone
          }]
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

      ticket = newTicket

      // Log initial event
      await supabase
        .from('warranty_ticket_events')
        .insert({
          ticket_id: ticket.id,
          type: 'SMS_RECEIVED',
          message: `Customer replied via SMS: ${message.substring(0, 100)}...`,
          metadata: { phone, threadId }
        })

      console.log('Created new warranty ticket from SMS reply:', ticket.ticket_ref)
    }

    // Add to job events
    await supabase
      .from('job_events')
      .insert({
        job_id: job.id,
        type: 'NOTE',
        message: `Customer SMS reply: ${message.substring(0, 100)}${message.length > 100 ? '...' : ''}`
      })

    // TODO: Send push notification to staff
    // This would integrate with the existing notification system

    return NextResponse.json({
      success: true,
      ticketId: ticket.id,
      ticketRef: ticket.ticket_ref,
      status: ticket.status
    })

  } catch (error) {
    console.error('Error handling SMS reply:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
