import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

describe('New consolidation routes', () => {
  describe('Missed-call bridge endpoint', () => {
    it('app/api/macrodroid/missed-call/route.ts exists', () => {
      const filePath = path.join(process.cwd(), 'app/api/macrodroid/missed-call/route.ts')
      expect(fs.existsSync(filePath)).toBe(true)
    })

    it('handles OPTIONS for CORS preflight', () => {
      const content = fs.readFileSync(
        path.join(process.cwd(), 'app/api/macrodroid/missed-call/route.ts'),
        'utf-8'
      )
      expect(content).toContain('export async function OPTIONS')
      expect(content).toContain('Access-Control-Allow-Origin')
    })

    it('uses sendViaMacroDroid from lib/resilience', () => {
      const content = fs.readFileSync(
        path.join(process.cwd(), 'app/api/macrodroid/missed-call/route.ts'),
        'utf-8'
      )
      expect(content).toContain('sendViaMacroDroid')
      expect(content).toContain('@/lib/resilience')
    })

    it('validates UK mobile numbers', () => {
      const content = fs.readFileSync(
        path.join(process.cwd(), 'app/api/macrodroid/missed-call/route.ts'),
        'utf-8'
      )
      expect(content).toContain('isUkMobile')
    })

    it('has rate limiting (30 min window)', () => {
      const content = fs.readFileSync(
        path.join(process.cwd(), 'app/api/macrodroid/missed-call/route.ts'),
        'utf-8'
      )
      expect(content).toContain('RATE_LIMIT_WINDOW_MS')
      expect(content).toMatch(/30\s*\*\s*60/)
    })

    it('respects UK sending hours (8am-8pm)', () => {
      const content = fs.readFileSync(
        path.join(process.cwd(), 'app/api/macrodroid/missed-call/route.ts'),
        'utf-8'
      )
      expect(content).toContain('isWithinUKSendingHours')
    })

    it('logs to sms_logs for audit trail', () => {
      const content = fs.readFileSync(
        path.join(process.cwd(), 'app/api/macrodroid/missed-call/route.ts'),
        'utf-8'
      )
      expect(content).toContain('sms_logs')
      expect(content).toContain('MISSED_CALL')
    })

    it('does NOT require staff auth (public MacroDroid webhook)', () => {
      const content = fs.readFileSync(
        path.join(process.cwd(), 'app/api/macrodroid/missed-call/route.ts'),
        'utf-8'
      )
      expect(content).not.toContain('requireStaffUser')
    })
  })

  describe('SMS reply endpoint (extended)', () => {
    it('app/api/sms/reply/route.ts exists', () => {
      const filePath = path.join(process.cwd(), 'app/api/sms/reply/route.ts')
      expect(fs.existsSync(filePath)).toBe(true)
    })

    it('imports the quote-acceptance detector', () => {
      const content = fs.readFileSync(
        path.join(process.cwd(), 'app/api/sms/reply/route.ts'),
        'utf-8'
      )
      expect(content).toContain('detectQuoteAcceptance')
      expect(content).toContain('@/lib/quote-acceptance-detector')
    })

    it('checks active enquiries before jobs', () => {
      const content = fs.readFileSync(
        path.join(process.cwd(), 'app/api/sms/reply/route.ts'),
        'utf-8'
      )
      // Enquiry lookup should come before job lookup
      const enquiryIdx = content.indexOf("from('enquiries')")
      const jobIdx = content.indexOf("from('jobs')")
      expect(enquiryIdx).toBeGreaterThan(-1)
      expect(jobIdx).toBeGreaterThan(-1)
      expect(enquiryIdx).toBeLessThan(jobIdx)
    })

    it('handles all four acceptance classifications', () => {
      const content = fs.readFileSync(
        path.join(process.cwd(), 'app/api/sms/reply/route.ts'),
        'utf-8'
      )
      expect(content).toContain("'accept'")
      expect(content).toContain("'medium'")
      expect(content).toContain("'decline'")
      // unclear is the fallback — check the classification field is referenced
      expect(content).toContain('classification')
    })

    it('auto-converts enquiry to job on high-confidence acceptance', () => {
      const content = fs.readFileSync(
        path.join(process.cwd(), 'app/api/sms/reply/route.ts'),
        'utf-8'
      )
      expect(content).toContain('autoConvertEnquiry')
      expect(content).toContain('QUOTE_APPROVED')
    })

    it('logs orphan replies and notifies staff', () => {
      const content = fs.readFileSync(
        path.join(process.cwd(), 'app/api/sms/reply/route.ts'),
        'utf-8'
      )
      expect(content).toContain('ORPHAN_SMS')
    })
  })

  describe('Public start-repair adapter endpoint', () => {
    it('app/api/public/start-repair/route.ts exists', () => {
      const filePath = path.join(process.cwd(), 'app/api/public/start-repair/route.ts')
      expect(fs.existsSync(filePath)).toBe(true)
    })

    it('handles OPTIONS for CORS preflight', () => {
      const content = fs.readFileSync(
        path.join(process.cwd(), 'app/api/public/start-repair/route.ts'),
        'utf-8'
      )
      expect(content).toContain('export async function OPTIONS')
      expect(content).toContain('Access-Control-Allow-Origin')
    })

    it('does NOT require staff auth (public endpoint)', () => {
      const content = fs.readFileSync(
        path.join(process.cwd(), 'app/api/public/start-repair/route.ts'),
        'utf-8'
      )
      expect(content).not.toContain('requireStaffUser')
    })

    it('inserts as enquiry_type repair_quote', () => {
      const content = fs.readFileSync(
        path.join(process.cwd(), 'app/api/public/start-repair/route.ts'),
        'utf-8'
      )
      expect(content).toContain("enquiry_type: 'repair_quote'")
    })

    it('normalises UK phone numbers', () => {
      const content = fs.readFileSync(
        path.join(process.cwd(), 'app/api/public/start-repair/route.ts'),
        'utf-8'
      )
      expect(content).toContain('normaliseUkPhone')
    })

    it('sends acknowledgment SMS via MacroDroid', () => {
      const content = fs.readFileSync(
        path.join(process.cwd(), 'app/api/public/start-repair/route.ts'),
        'utf-8'
      )
      expect(content).toContain('sendViaMacroDroid')
      expect(content).toContain('REPAIR_REQUEST_ACK')
    })

    it('creates staff notification', () => {
      const content = fs.readFileSync(
        path.join(process.cwd(), 'app/api/public/start-repair/route.ts'),
        'utf-8'
      )
      expect(content).toContain('NEW_ENQUIRY')
    })
  })
})

describe('Quote acceptance detector module', () => {
  it('lib/quote-acceptance-detector.ts exists', () => {
    const filePath = path.join(process.cwd(), 'lib/quote-acceptance-detector.ts')
    expect(fs.existsSync(filePath)).toBe(true)
  })

  it('does NOT import any AI/LLM libraries', () => {
    const content = fs.readFileSync(
      path.join(process.cwd(), 'lib/quote-acceptance-detector.ts'),
      'utf-8'
    )
    expect(content).not.toContain('openai')
    expect(content).not.toContain('anthropic')
    expect(content).not.toContain('chatgpt')
  })

  it('exports detectQuoteAcceptance and isQuoteInquiry', () => {
    const content = fs.readFileSync(
      path.join(process.cwd(), 'lib/quote-acceptance-detector.ts'),
      'utf-8'
    )
    expect(content).toContain('export function detectQuoteAcceptance')
    expect(content).toContain('export function isQuoteInquiry')
  })
})

describe('SQL migration for new templates', () => {
  it('supabase/add-missed-call-and-acceptance-templates.sql exists', () => {
    const filePath = path.join(process.cwd(), 'supabase/add-missed-call-and-acceptance-templates.sql')
    expect(fs.existsSync(filePath)).toBe(true)
  })

  it('includes all 5 new template keys', () => {
    const content = fs.readFileSync(
      path.join(process.cwd(), 'supabase/add-missed-call-and-acceptance-templates.sql'),
      'utf-8'
    )
    expect(content).toContain("'MISSED_CALL_OPEN'")
    expect(content).toContain("'MISSED_CALL_CLOSED'")
    expect(content).toContain("'QUOTE_ACCEPTED_AUTO'")
    expect(content).toContain("'QUOTE_CONFIRM_PROMPT'")
    expect(content).toContain("'QUOTE_DECLINED_AUTO'")
  })

  it('uses ON CONFLICT for safe re-run', () => {
    const content = fs.readFileSync(
      path.join(process.cwd(), 'supabase/add-missed-call-and-acceptance-templates.sql'),
      'utf-8'
    )
    expect(content).toContain('ON CONFLICT (key) DO UPDATE')
  })
})
