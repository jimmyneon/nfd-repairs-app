import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Force dynamic rendering for this API route
export const dynamic = 'force-dynamic'

/**
 * API endpoint for AI Responder to check job status by phone number
 * GET /api/jobs/check-status?phone=+447410381247
 */
export async function GET(request: NextRequest) {
  try {
    // Use service role key to bypass RLS
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // Get phone number from query params
    const searchParams = request.nextUrl.searchParams
    const phone = searchParams.get('phone')

    if (!phone) {
      return NextResponse.json(
        { error: 'Phone number is required' },
        { status: 400 }
      )
    }

    // Normalize phone number (remove spaces, ensure +44 format)
    const normalizedPhone = phone.trim().replace(/\s+/g, '')

    console.log('Checking jobs for phone:', normalizedPhone)

    // Query jobs by phone number
    const { data: jobs, error } = await supabase
      .from('jobs')
      .select(`
        id,
        job_ref,
        customer_name,
        customer_phone,
        device_make,
        device_model,
        issue,
        status,
        quoted_price,
        price_total,
        deposit_required,
        deposit_amount,
        deposit_received,
        tracking_token,
        created_at,
        updated_at
      `)
      .eq('customer_phone', normalizedPhone)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Database error:', error)
      return NextResponse.json(
        { error: 'Failed to fetch jobs' },
        { status: 500 }
      )
    }

    // If no jobs found, try alternative phone formats
    if (!jobs || jobs.length === 0) {
      // Try without country code if it has one
      let alternativePhone = normalizedPhone
      if (normalizedPhone.startsWith('+44')) {
        alternativePhone = '0' + normalizedPhone.substring(3)
      } else if (normalizedPhone.startsWith('0')) {
        alternativePhone = '+44' + normalizedPhone.substring(1)
      }

      const { data: altJobs } = await supabase
        .from('jobs')
        .select(`
          id,
          job_ref,
          customer_name,
          customer_phone,
          device_make,
          device_model,
          issue,
          status,
          quoted_price,
          price_total,
          deposit_required,
          deposit_amount,
          deposit_received,
          tracking_token,
          created_at,
          updated_at
        `)
        .eq('customer_phone', alternativePhone)
        .order('created_at', { ascending: false })

      if (altJobs && altJobs.length > 0) {
        return NextResponse.json({
          success: true,
          phone: normalizedPhone,
          jobs: altJobs.map(job => ({
            ...job,
            tracking_url: `${process.env.NEXT_PUBLIC_APP_URL || 'https://nfd-repairs-app.vercel.app'}/t/${job.tracking_token}`,
            status_label: getStatusLabel(job.status),
          }))
        })
      }
    }

    // Return results
    return NextResponse.json({
      success: true,
      phone: normalizedPhone,
      jobs: jobs?.map(job => ({
        ...job,
        tracking_url: `${process.env.NEXT_PUBLIC_APP_URL || 'https://nfd-repairs-app.vercel.app'}/t/${job.tracking_token}`,
        status_label: getStatusLabel(job.status),
      })) || []
    })

  } catch (error) {
    console.error('Error checking job status:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// Helper function to get human-readable status labels
function getStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    'RECEIVED': 'Received',
    'AWAITING_DEPOSIT': 'Awaiting Deposit',
    'PARTS_ORDERED': 'Parts Ordered',
    'READY_TO_BOOK_IN': 'Ready to Book In',
    'IN_REPAIR': 'In Repair',
    'READY_TO_COLLECT': 'Ready to Collect',
    'COMPLETED': 'Completed',
    'CANCELLED': 'Cancelled',
  }
  return labels[status] || status
}
