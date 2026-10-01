import { describe, expect, it } from 'vitest'
import fs from 'fs'
import path from 'path'
import './public-quote-options.test'

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


describe('secure quote return path', () => {
  it('keeps post-submit options behind the secure quote token', () => {
    const optionsRoute = fs.readFileSync(
      path.join(process.cwd(), 'app/api/public/quote/[ref]/options/route.ts'),
      'utf-8'
    )
    expect(optionsRoute).toContain("const token = new URL(request.url).searchParams.get('t')")
    expect(optionsRoute).toContain('token !== enquiry.quote_action_token')
    expect(optionsRoute).toContain('verifyRequestedAddOns')
    expect(optionsRoute).toContain('verifyRequestedAccessories')
  })

  it('lets an already accepted quote return to a saved option manager', () => {
    const page = fs.readFileSync(
      path.join(process.cwd(), 'app/quote/approve/[jobId]/page.tsx'),
      'utf-8'
    )
    expect(page).toContain('useParams')
    expect(page).toContain('Your repair request is already saved')
    expect(page).toContain('Save selected extras')
    expect(page).toContain('/options?t=')
  })

  it('carries saved accessories into the created job and total', () => {
    const conversion = fs.readFileSync(
      path.join(process.cwd(), 'app/api/enquiries/convert-to-job/route.ts'),
      'utf-8'
    )
    expect(conversion).toContain('const accessories = Array.isArray(enquiry.accessories)')
    expect(conversion).toContain('accessoryIssues')
    expect(conversion).toContain('additionalRepairsTotal + accessoriesTotal')
  })
})


describe('preferred drop-off on secure quote', () => {
  it('normalizes the returned ref before fetching and shows the saved preferred day', () => {
    const page = fs.readFileSync(
      path.join(process.cwd(), 'app/quote/approve/[jobId]/page.tsx'),
      'utf-8'
    )
    const route = fs.readFileSync(
      path.join(process.cwd(), 'app/api/public/quote/[ref]/route.ts'),
      'utf-8'
    )

    expect(page).toContain('normalizePublicQuoteRef')
    expect(page).toContain('Preferred drop-off:')
    expect(page).toContain('Preference only — not a fixed appointment.')
    expect(route).toContain('dropoff_preference')
    expect(route).toContain('dropoff_date')
  })
})


describe('public quote live-schema regression', () => {
  it('does not select the removed quoted_price_high enquiry column', () => {
    const route = fs.readFileSync(
      path.join(process.cwd(), 'app/api/public/quote/[ref]/route.ts'),
      'utf-8'
    )
    expect(route).not.toContain('quoted_price_high')
    expect(route).toContain('dropoff_preference')
    expect(route).toContain('dropoff_date')
  })
})


describe('secure quote customer messaging and live status', () => {
  it('restores the parts-check process messaging on the secure quote page', () => {
    const page = fs.readFileSync(
      path.join(process.cwd(), 'app/quote/approve/[jobId]/page.tsx'),
      'utf-8'
    )
    expect(page).toContain('What happens next')
    expect(page).toContain('We check the part')
    expect(page).toContain('We message you with the next step')
    expect(page).toContain('No fixed appointment is needed unless we tell you otherwise.')
    expect(page).toContain('No extra charge')
    expect(page).toContain('Repair total stays')
  })

  it('returns live parts and job status through the same secure quote link', () => {
    const route = fs.readFileSync(
      path.join(process.cwd(), 'app/api/public/quote/[ref]/route.ts'),
      'utf-8'
    )
    expect(route).toContain('converted_job_id')
    expect(route).toContain('customer_update: buildCustomerUpdate(linkedJob)')
    expect(route).toContain('We’re checking the part')
    expect(route).toContain('Parts confirmed — ready to bring it in')
    expect(route).toContain('We need to order the part')
    expect(route).toContain('Your part has been ordered')
    expect(route).toContain('Your part has arrived')
  })

  it('stores the staff-entered expected parts date when converting an enquiry', () => {
    const conversion = fs.readFileSync(
      path.join(process.cwd(), 'app/api/enquiries/convert-to-job/route.ts'),
      'utf-8'
    )
    expect(conversion).toContain('parts_expected_at: requiresParts && earliest_date')
  })

  it('keeps later customer-selected options synced to an already-created job', () => {
    const optionsRoute = fs.readFileSync(
      path.join(process.cwd(), 'app/api/public/quote/[ref]/options/route.ts'),
      'utf-8'
    )
    expect(optionsRoute).toContain('converted_job_id')
    expect(optionsRoute).toContain('linkedJob.additional_issues')
    expect(optionsRoute).toContain('price_total: basePrice + additionsTotal')
  })
})
