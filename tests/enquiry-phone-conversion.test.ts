import { describe, expect, it } from 'vitest'
import fs from 'fs'
import path from 'path'

describe('accepted enquiry contact requirement', () => {
  it('accepts either phone or email and preserves a missing phone as null', () => {
    const content = fs.readFileSync(
      path.join(process.cwd(), 'app/api/enquiries/convert-to-job/route.ts'),
      'utf-8'
    )

    const guardIndex = content.indexOf("code: 'CUSTOMER_CONTACT_REQUIRED'")
    const insertIndex = content.indexOf(".from('jobs')\n      .insert(jobData)")

    expect(guardIndex).toBeGreaterThan(-1)
    expect(insertIndex).toBeGreaterThan(guardIndex)
    expect(content).toContain('if (!customerPhone && !customerEmail)')
    expect(content).toContain('customer_phone: customerPhone || null')
    expect(content).toContain('customer_email: customerEmail || null')
  })

  it('does not block conversion controls when an accepted enquiry has no phone', () => {
    const content = fs.readFileSync(
      path.join(process.cwd(), 'app/app/enquiries/page.tsx'),
      'utf-8'
    )

    expect(content).not.toContain('Phone number needed before creating the job')
    expect(content).not.toContain('Boolean(selectedEnquiry.customer_phone?.trim())')
    expect(content).toContain("selectedEnquiry.enquiry_type === 'repair_quote' && isAccepted(selectedEnquiry)")
    expect(content).toContain('setSelectedEnquiry(current => current?.id === editingEnquiry.id')
  })
})
