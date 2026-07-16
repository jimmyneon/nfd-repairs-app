import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  })
}

export async function GET() {
  // Simple test endpoint to verify analytics tracking is working
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!supabaseUrl || !supabaseKey) {
      return NextResponse.json({ error: 'Missing env vars' }, { status: 500 })
    }
    const supabase = createClient(supabaseUrl, supabaseKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    })
    const { count, error } = await supabase
      .from('quote_analytics_events')
      .select('*', { count: 'exact', head: true })
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json({
      success: true,
      total_events: count,
      endpoint: 'POST to this URL with JSON array of events',
    }, {
      headers: { 'Access-Control-Allow-Origin': '*' },
    })
  } catch (error) {
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    // Support both single event and batched events
    const events = Array.isArray(body) ? body : [body]

    if (events.length === 0) {
      return NextResponse.json({ error: 'No events provided' }, { status: 400 })
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!supabaseUrl || !supabaseKey) {
      console.error('Analytics track: missing env vars')
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
    }
    const supabase = createClient(supabaseUrl, supabaseKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    })

    // Parse and validate events
    const rows = events.map((evt: any) => {
      const url = evt.page_url || ''
      let utm_source = evt.utm_source || null
      let utm_medium = evt.utm_medium || null
      let utm_campaign = evt.utm_campaign || null
      let utm_content = evt.utm_content || null
      let utm_term = evt.utm_term || null
      let source_tag = evt.source_tag || null

      // Also try to extract from page_url if not provided directly
      if (url && (!utm_source || !source_tag)) {
        try {
          const urlObj = new URL(url)
          if (!utm_source) utm_source = urlObj.searchParams.get('utm_source')
          if (!utm_medium) utm_medium = urlObj.searchParams.get('utm_medium')
          if (!utm_campaign) utm_campaign = urlObj.searchParams.get('utm_campaign')
          if (!utm_content) utm_content = urlObj.searchParams.get('utm_content')
          if (!utm_term) utm_term = urlObj.searchParams.get('utm_term')
          if (!source_tag) source_tag = urlObj.searchParams.get('s') || urlObj.searchParams.get('source') || urlObj.searchParams.get('ref_source')
        } catch {}
      }

      // Map short tags to readable names for dashboard display
      const tagMap: Record<string, string> = {
        'sms': 'SMS Text',
        'wa': 'WhatsApp',
        'fb': 'Facebook',
        'ig': 'Instagram',
        'email': 'Email',
        'google': 'Google Ad',
        'flyer': 'Flyer/Card',
        'word': 'Word of Mouth',
      }
      if (source_tag && tagMap[source_tag]) {
        if (!utm_source) utm_source = tagMap[source_tag]
      }

      // Detect mobile from user agent
      const ua = evt.user_agent || ''
      const isMobile = /Mobile|Android|iPhone|iPad|iPod|Windows Phone/i.test(ua)

      return {
        session_id: evt.session_id || null,
        enquiry_ref: evt.enquiry_ref || null,
        event_type: evt.event_type || null,
        event_data: evt.event_data || {},
        page_url: url,
        page_path: evt.page_path || null,
        referrer: evt.referrer || null,
        utm_source,
        utm_medium,
        utm_campaign,
        utm_content,
        utm_term,
        source_tag,
        user_agent: ua,
        viewport: evt.viewport || null,
        is_mobile: isMobile,
      }
    })

    // Filter out invalid rows (missing session_id or event_type)
    const validRows = rows.filter((r: any) => r.session_id && r.event_type)

    if (validRows.length === 0) {
      return NextResponse.json({ error: 'No valid events' }, { status: 400 })
    }

    const { error } = await supabase
      .from('quote_analytics_events')
      .insert(validRows)

    if (error) {
      console.error('Analytics insert error:', error)
      return NextResponse.json(
        { error: 'Failed to store analytics' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      stored: validRows.length,
    }, {
      headers: { 'Access-Control-Allow-Origin': '*' },
    })
  } catch (error) {
    console.error('Analytics track error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
