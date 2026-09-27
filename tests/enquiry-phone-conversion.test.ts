import { describe, expect, it } from 'vitest'
import fs from 'fs'
import path from 'path'

describe('accepted enquiry phone requirement', () => {
  it('rejects job conversion cleanly before inserting a job', () => {
    const content = fs.readFileSync(
      path.join(process.cwd(), 'app/api/enquiries/convert-to-job/route.ts'),
      'utf-8'
    )

    const guardIndex = content.indexOf("code: 'CUSTOMER_PHONE_REQUIRED'")
    const insertIndex = content.indexOf(".from('jobs')\n      .insert(jobData)")

    expect(guardIndex).toBeGreaterThan(-1)
    expect(insertIndex).toBeGreaterThan(guardIndex)
    expect(content).toContain('customer_phone: customerPhone')
  })

  it('prompts staff to add the phone and only shows conversion controls once present', () => {
    const content = fs.readFileSync(
      path.join(process.cwd(), 'app/app/enquiries/page.tsx'),
      'utf-8'
    )

    expect(content).toContain('Phone number needed before creating the job')
    expect(content).toContain('Add phone number')
    expect(content).toContain('Boolean(selectedEnquiry.customer_phone?.trim())')
    expect(content).toContain('setSelectedEnquiry(current => current?.id === editingEnquiry.id')
  })
})
