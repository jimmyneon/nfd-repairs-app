import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

describe('XSS prevention', () => {
  it('should not use dangerouslySetInnerHTML in email-templates page', () => {
    const content = fs.readFileSync(
      path.join(process.cwd(), 'app/app/email-templates/page.tsx'),
      'utf-8'
    )
    expect(content).not.toContain('dangerouslySetInnerHTML')
  })

  it('should use sandboxed iframe for email preview', () => {
    const content = fs.readFileSync(
      path.join(process.cwd(), 'app/app/email-templates/page.tsx'),
      'utf-8'
    )
    expect(content).toContain('iframe')
    expect(content).toContain('sandbox')
  })

  it('should have escapeHtml function in enquiries update route', () => {
    const content = fs.readFileSync(
      path.join(process.cwd(), 'app/api/enquiries/update/route.ts'),
      'utf-8'
    )
    expect(content).toContain('escapeHtml')
    // Verify it escapes the dangerous characters
    expect(content).toContain('&amp;')
    expect(content).toContain('&lt;')
    expect(content).toContain('&gt;')
    expect(content).toContain('&quot;')
  })
})

describe('Hardcoded secrets removed', () => {
  const secretFiles = [
    'supabase/setup-tracking-sync-cron.sql',
    'supabase/setup-auto-parts-cron.sql',
    'supabase/setup-collection-reminders.sql',
    'supabase/setup-pg-cron.sql',
    'supabase/setup-sms-drain-cron.sql',
    'supabase/flush-pending-sms.sql',
  ]

  for (const file of secretFiles) {
    it(`${file} should not contain the exposed secret`, () => {
      const filePath = path.join(process.cwd(), file)
      if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, 'utf-8')
        // The previously exposed secret should never appear
        expect(content).not.toContain('74f5d06ea99badfeb73748de6b4efbc96f6c8aee489aafb1d2d7a573eb221263')
      }
    })
  }
})

describe('Supabase .temp ignored', () => {
  it('should have supabase/.temp/ in .gitignore', () => {
    const gitignore = fs.readFileSync(
      path.join(process.cwd(), '.gitignore'),
      'utf-8'
    )
    expect(gitignore).toContain('.temp')
  })
})
