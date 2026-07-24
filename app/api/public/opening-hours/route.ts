import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  })
}

// Fallback hours if DB is unavailable
const FALLBACK_HOURS = {
  Sunday:    { isOpen: false, formatted: 'Closed' },
  Monday:    { isOpen: true,  formatted: '10:00 AM - 5:00 PM', open: '10:00', close: '17:00' },
  Tuesday:   { isOpen: true,  formatted: '10:00 AM - 5:00 PM', open: '10:00', close: '17:00' },
  Wednesday: { isOpen: true,  formatted: '10:00 AM - 5:00 PM', open: '10:00', close: '17:00' },
  Thursday:  { isOpen: true,  formatted: '10:00 AM - 5:00 PM', open: '10:00', close: '17:00' },
  Friday:    { isOpen: true,  formatted: '10:00 AM - 5:00 PM', open: '10:00', close: '17:00' },
  Saturday:  { isOpen: true,  formatted: '10:00 AM - 3:00 PM', open: '10:00', close: '15:00' },
}

function buildResponse(weeklyHours: Record<string, any>, specialHours: any, googleMapsUrl: string) {
  const now = new Date()
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
  const currentDay = days[now.getDay()]
  const currentHour = now.getHours()
  const currentMin = now.getMinutes()

  const weeklySchedule = days.map(day => ({
    day,
    isOpen: weeklyHours[day]?.isOpen ?? false,
    formatted: weeklyHours[day]?.formatted ?? 'Closed',
    open: weeklyHours[day]?.open ?? null,
    close: weeklyHours[day]?.close ?? null,
  }))

  const todayHours = weeklyHours[currentDay] || FALLBACK_HOURS[currentDay as keyof typeof FALLBACK_HOURS]
  let isOpen = false

  if (todayHours.isOpen && todayHours.open && todayHours.close) {
    const [openH, openM] = todayHours.open.split(':').map(Number)
    const [closeH, closeM] = todayHours.close.split(':').map(Number)
    const currentMins = currentHour * 60 + currentMin
    isOpen = currentMins >= openH * 60 + openM && currentMins < closeH * 60 + closeM
  }

  // Find next open time if closed
  let nextOpen: string | null = null
  if (!isOpen) {
    for (let i = 0; i <= 7; i++) {
      const checkIdx = (now.getDay() + i) % 7
      const checkDay = days[checkIdx]
      const checkHours = weeklyHours[checkDay]
      if (checkHours?.isOpen) {
        if (i === 0 && checkHours.open) {
          const [openH] = checkHours.open.split(':').map(Number)
          if (currentHour < openH) {
            nextOpen = `Today at ${checkHours.open}`
            break
          }
        } else if (i > 0) {
          nextOpen = `${checkDay} at ${checkHours.open}`
          break
        }
      }
    }
  }

  const currentTimeStr = `${String(currentHour).padStart(2, '0')}:${String(currentMin).padStart(2, '0')}`

  return {
    businessName: 'New Forest Device Repairs',
    currentStatus: { isOpen, currentTime: currentTimeStr, currentDay },
    today: {
      day: currentDay,
      hours: todayHours.formatted,
      open: todayHours.open || null,
      close: todayHours.close || null,
      isOpen: todayHours.isOpen,
    },
    nextOpen,
    weeklySchedule,
    specialHours: specialHours || { active: false, note: null },
    googleMapsUrl,
  }
}

export async function GET() {
  try {
    // Try to read from Supabase admin_settings
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // Fetch opening hours, google maps link, and special hours from admin_settings
    const { data: settings } = await supabase
      .from('admin_settings')
      .select('key, value')
      .in('key', ['opening_hours', 'google_maps_link', 'special_hours'])

    let weeklyHours = FALLBACK_HOURS
    let specialHours = { active: false, note: null }
    let googleMapsUrl = 'https://maps.app.goo.gl/AEfEr4ZRhjB8rVSC7'

    if (settings && settings.length > 0) {
      for (const setting of settings) {
        if (setting.key === 'opening_hours' && setting.value) {
          // Parse stored opening hours (JSONB format)
          try {
            const parsed = typeof setting.value === 'string' 
              ? JSON.parse(setting.value) 
              : setting.value
            if (parsed && typeof parsed === 'object') {
              weeklyHours = parsed
            }
          } catch (e) {
            console.error('Failed to parse opening_hours setting:', e)
          }
        } else if (setting.key === 'google_maps_link' && setting.value) {
          googleMapsUrl = typeof setting.value === 'string' ? setting.value : String(setting.value)
        } else if (setting.key === 'special_hours' && setting.value) {
          try {
            const parsed = typeof setting.value === 'string' 
              ? JSON.parse(setting.value) 
              : setting.value
            if (parsed && typeof parsed === 'object') {
              specialHours = parsed
            }
          } catch (e) {
            console.error('Failed to parse special_hours setting:', e)
          }
        }
      }
    }

    const data = buildResponse(weeklyHours, specialHours, googleMapsUrl)

    return NextResponse.json(data, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
      },
    })
  } catch (error) {
    console.error('Error in opening-hours API, using fallback:', error)

    // Return fallback data if DB fails
    const data = buildResponse(FALLBACK_HOURS, { active: false, note: null }, 'https://maps.app.goo.gl/AEfEr4ZRhjB8rVSC7')

    return NextResponse.json(data, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
      },
    })
  }
}
