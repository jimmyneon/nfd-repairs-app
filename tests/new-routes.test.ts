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

    it('has database-backed repeat caller detection (24h window)', () => {
      const content = fs.readFileSync(
        path.join(process.cwd(), 'app/api/macrodroid/missed-call/route.ts'),
        'utf-8'
      )
      expect(content).toContain('missed_call_log')
      expect(content).toMatch(/24\s*\*\s*60/) // 24 hours
    })

    it('creates REPEAT_CALLER staff notification', () => {
      const content = fs.readFileSync(
        path.join(process.cwd(), 'app/api/macrodroid/missed-call/route.ts'),
        'utf-8'
      )
      expect(content).toContain('REPEAT_CALLER')
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

    it('keeps the legacy MacroDroid incoming URL working', () => {
      const legacyRoute = path.join(process.cwd(), 'app/api/messages/incoming/route.ts')
      expect(fs.existsSync(legacyRoute)).toBe(true)

      const content = fs.readFileSync(legacyRoute, 'utf-8')
      expect(content).toContain("../../sms/reply/route")
      expect(content).toContain('handleSmsReply(request)')
    })

    it('accepts the legacy MacroDroid timestamp field', () => {
      const content = fs.readFileSync(
        path.join(process.cwd(), 'app/api/sms/reply/route.ts'),
        'utf-8'
      )
      expect(content).toContain('body.ts')
    })

    it.each([
      ['delivery-confirmation', '../../macrodroid/delivery-confirmation/route'],
      ['missed-call', '../../macrodroid/missed-call/route'],
      ['send', '../../macrodroid/sms-sent/route'],
    ])('keeps the legacy MacroDroid %s URL working', (routeName, handlerPath) => {
      const legacyRoute = path.join(process.cwd(), `app/api/messages/${routeName}/route.ts`)
      expect(fs.existsSync(legacyRoute)).toBe(true)

      const content = fs.readFileSync(legacyRoute, 'utf-8')
      expect(content).toContain(handlerPath)
      expect(content).toContain('POST')
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

  describe('Enquiry stock conversion', () => {
    it('saves Need Parts immediately instead of using temporary UI state', () => {
      const content = fs.readFileSync(
        path.join(process.cwd(), 'app/app/enquiries/page.tsx'),
        'utf-8'
      )
      expect(content).toContain("handleConvertToJob('parts_needed')")
      expect(content).not.toContain("setConvertStep('deposit_confirm')")
    })

    it('only treats enquiries with a real job link as converted and links by job id', () => {
      const content = fs.readFileSync(
        path.join(process.cwd(), 'app/app/enquiries/page.tsx'),
        'utf-8'
      )
      expect(content).toContain('Boolean(e.converted_job_id || e.converted_to_job)')
      expect(content).toContain("e.status === 'approved' || e.status === 'converted'")
      expect(content).toContain('href={`/app/jobs/${convertResult.job_id}`}')
      expect(content).not.toContain('href={`/app/jobs/${convertResult.job_ref}`}')
    })

    it('keeps customer approval separate from conversion', () => {
      const updateRoute = fs.readFileSync(
        path.join(process.cwd(), 'app/api/enquiries/update/route.ts'),
        'utf-8'
      )
      expect(updateRoute).toContain("updateFields.status = 'approved'")

      const acceptRoute = fs.readFileSync(
        path.join(process.cwd(), 'app/api/enquiries/accept/route.ts'),
        'utf-8'
      )
      expect(acceptRoute).toContain("status: 'approved'")
    })

    it('shows separate viewed, sent, follow-up, accepted and booked stages', () => {
      const content = fs.readFileSync(
        path.join(process.cwd(), 'app/app/enquiries/page.tsx'),
        'utf-8'
      )
      expect(content).toContain('Viewed · No Action')
      expect(content).toContain('Quote Sent')
      expect(content).toContain('Follow-up')
      expect(content).toContain('Accepted')
      expect(content).toContain('Booked In')
      expect(content).toContain('Dismissed')
    })

    it('reports the saved quote journey in analytics', () => {
      const summaryRoute = fs.readFileSync(
        path.join(process.cwd(), 'app/api/analytics/summary/route.ts'),
        'utf-8'
      )
      const analyticsPage = fs.readFileSync(
        path.join(process.cwd(), 'app/app/analytics/page.tsx'),
        'utf-8'
      )
      expect(summaryRoute).toContain('quote_journey: quoteJourney')
      expect(summaryRoute).toContain('no_next_action')
      expect(analyticsPage).toContain('Saved Quote Journey')
      expect(analyticsPage).toContain('No next action selected')
      expect(analyticsPage).toContain('Dismissed')
    })

    it('allows reversible dismissal but protects accepted and booked enquiries', () => {
      const content = fs.readFileSync(
        path.join(process.cwd(), 'app/app/enquiries/page.tsx'),
        'utf-8'
      )
      expect(content).toContain('handleDismissToggle')
      expect(content).toContain("enquiry.status === 'rejected' ? 'pending' : 'rejected'")
      expect(content).toContain('!isAccepted(selectedEnquiry) && !isConverted(selectedEnquiry)')
      expect(content).toContain('Restore Enquiry')
    })

    it('creates parts-needed jobs awaiting deposit', () => {
      const content = fs.readFileSync(
        path.join(process.cwd(), 'app/api/enquiries/convert-to-job/route.ts'),
        'utf-8'
      )
      expect(content).toContain("'parts_needed'")
      expect(content).toContain("'AWAITING_DEPOSIT'")
      expect(content).toContain('deposit_received: depositAlreadyPaid')
      expect(content).toContain("'DEPOSIT_REQUEST'")
    })

    it('reports the real SMS outcome and contains no incorrect shop address', () => {
      const content = fs.readFileSync(
        path.join(process.cwd(), 'app/api/enquiries/convert-to-job/route.ts'),
        'utf-8'
      )
      expect(content).toContain('sms_sent: smsSent')
      expect(content).toContain('sms_error: smsError')
      expect(content).not.toContain('123 High Street')
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
