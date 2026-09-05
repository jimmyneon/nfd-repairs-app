import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

describe('API route authentication', () => {
  // Staff routes that should have requireStaffUser
  const staffRoutes = [
    'app/api/analytics/jobs/route.ts',
    'app/api/analytics/summary/route.ts',
    'app/api/enquiries/accept/route.ts',
    'app/api/enquiries/convert-to-job/route.ts',
    'app/api/enquiries/get/route.ts',
    'app/api/enquiries/send-sms/route.ts',
    'app/api/enquiries/update/route.ts',
    'app/api/jobs/check-status/route.ts',
    'app/api/jobs/create-v3/route.ts',
    'app/api/jobs/diagnostic-action/route.ts',
    'app/api/jobs/send-tracking-sms/route.ts',
    'app/api/notifications/send-push/route.ts',
    'app/api/quotes/search/route.ts',
    'app/api/quotes/sync/route.ts',
    'app/api/warranty-tickets/route.ts',
  ]

  for (const route of staffRoutes) {
    it(`${route} should import and call requireStaffUser`, () => {
      const filePath = path.join(process.cwd(), route)
      if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, 'utf-8')
        expect(content).toContain('requireStaffUser')
      }
    })
  }

  // Staff routes with jobId param
  const staffJobIdRoutes = [
    'app/api/jobs/[jobId]/approve-quote/route.ts',
    'app/api/jobs/[jobId]/notify-parts/route.ts',
    'app/api/jobs/[jobId]/reject-quote/route.ts',
    'app/api/jobs/[jobId]/request-deposit/route.ts',
    'app/api/jobs/[jobId]/route.ts',
    'app/api/jobs/[jobId]/send-quote/route.ts',
  ]

  for (const route of staffJobIdRoutes) {
    it(`${route} should import and call requireStaffUser`, () => {
      const filePath = path.join(process.cwd(), route)
      if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, 'utf-8')
        expect(content).toContain('requireStaffUser')
      }
    })
  }

  // Cron routes that should have requireCronSecret
  const cronRoutes = [
    'app/api/jobs/send-collection-reminders/route.ts',
    'app/api/jobs/send-aftercare-sms/route.ts',
    'app/api/jobs/queue-status-sms/route.ts',
    'app/api/jobs/schedule-collection-sms/route.ts',
    'app/api/sms/send-all/route.ts',
    'app/api/email/send/route.ts',
    'app/api/password/cleanup/route.ts',
  ]

  for (const route of cronRoutes) {
    it(`${route} should import and call requireCronSecret`, () => {
      const filePath = path.join(process.cwd(), route)
      if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, 'utf-8')
        // Either uses the helper or has inline CRON_SECRET check
        const hasCronCheck = content.includes('requireCronSecret') ||
          (content.includes('CRON_SECRET') && content.includes('Bearer'))
        expect(hasCronCheck).toBe(true)
      }
    })
  }
})

describe('API route maxDuration', () => {
  const cronRoutes = [
    'app/api/jobs/send-collection-sms/route.ts',
    'app/api/jobs/send-collection-reminders/route.ts',
    'app/api/jobs/auto-parts-ordered/route.ts',
    'app/api/sms/send-all/route.ts',
    'app/api/password/cleanup/route.ts',
    'app/api/tracking/sync/route.ts',
    'app/api/jobs/backup-schedule-collection-sms/route.ts',
    'app/api/jobs/send-aftercare-sms/route.ts',
    'app/api/jobs/queue-status-sms/route.ts',
    'app/api/jobs/schedule-collection-sms/route.ts',
    'app/api/email/send/route.ts',
  ]

  for (const route of cronRoutes) {
    it(`${route} should have maxDuration export`, () => {
      const filePath = path.join(process.cwd(), route)
      if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, 'utf-8')
        expect(content).toContain('maxDuration')
      }
    })
  }
})

describe('Password endpoint security', () => {
  it('decrypt route should require staff auth', () => {
    const content = fs.readFileSync(
      path.join(process.cwd(), 'app/api/password/decrypt/route.ts'),
      'utf-8'
    )
    expect(content).toContain('requireStaffUser')
  })

  it('request route should require staff auth', () => {
    const content = fs.readFileSync(
      path.join(process.cwd(), 'app/api/password/request/route.ts'),
      'utf-8'
    )
    expect(content).toContain('requireStaffUser')
  })

  it('request route should not return token in response', () => {
    const content = fs.readFileSync(
      path.join(process.cwd(), 'app/api/password/request/route.ts'),
      'utf-8'
    )
    // The response should not include the token field
    const responseMatch = content.match(/NextResponse\.json\(\{[^}]*\}/g)
    if (responseMatch) {
      for (const resp of responseMatch) {
        expect(resp).not.toMatch(/token.*:/)
      }
    }
  })

  it('cleanup route should require cron secret', () => {
    const content = fs.readFileSync(
      path.join(process.cwd(), 'app/api/password/cleanup/route.ts'),
      'utf-8'
    )
    // Either uses the helper or has inline CRON_SECRET check
    const hasCronCheck = content.includes('requireCronSecret') ||
      (content.includes('CRON_SECRET') && content.includes('Bearer'))
    expect(hasCronCheck).toBe(true)
  })
})
