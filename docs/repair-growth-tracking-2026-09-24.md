# Repair growth tracking — 24 September 2026

## Delivered in this batch

- Main quote analytics recognises successful `repair_request_submitted` events as submitted visits and form submissions, alongside the legacy event.
- Quote UX includes direct-link, search, restored and resumed visits without requiring a step-one event. Category abandonment only counts visits that entered the category step.
- Separate workshop outcomes count distinct submitted references and unique jobs rather than treating repeat visits as extra jobs.
- Jobs can link via `jobs.quote_request_id` or `enquiries.converted_job_id`; multiple jobs from one request remain visible.
- Arrivals include DROPPED_OFF. Completed counts mean COLLECTED or COMPLETED. Completed-and-marked-paid additionally requires the existing full-payment flag.
- Requests with missing enquiry records are displayed as unmatched; database failures return an error instead of zero outcomes.
- The report selects requests by submission date and shows their jobs' current outcomes, so later arrivals/completions improve the original cohort.
- Website analytics now follows anonymous browser visits from landing page → model selected → price viewed → continue → enquiry submitted → accepted → booked job.
- Landing-page reporting shows visits, price views, continues, enquiries and booked jobs so traffic quality can be judged page by page.

## Validation

23 analytics regression tests passed, including direct links, resumed requests, repeated references, multiple jobs, forward-only links, stale references, missing records, paid versus unpaid completions, staff authentication and query errors. TypeScript checking passed against the complete current application sources plus the deployment repairs below, using existing installed dependencies. No live customer enquiry or notification was created by testing.

## Measurement limits

This is website-event attribution, not a full cash or accounts report. Analytics blocked in a visitor's browser will not appear. The app's payment flag may have been automatically backfilled for historical collected/completed jobs. Closed status does not prove a successful repair. The main dashboard's older saved-enquiry cohort remains separate from the new unique-job panel.

## Search Console priorities

Source: supplied Performance-on-Search-2026-09-24.xlsx. Although Filters says 'Last 3 months', the Chart sheet contains 9–21 September only: 37 clicks and 3,911 impressions. This predates the 24 September website fixes and cannot measure their impact.

All 37 clicks are UK; UK impressions are 2,101 (1.76% CTR). US impressions are 1,694 with no clicks. Mobile contributes 25 of 37 clicks. Judge local progress with a UK filter rather than the blended all-country CTR.

The first priority-page pass is now complete:

| Page | Previous signal | Work completed |
| --- | --- | --- |
| /phone-repair-cost/ | 0 clicks / 507 impressions / position 11.97 | Reworked around current catalogue pricing and added live iPhone, Samsung Galaxy and Pixel price finders. |
| /samsung-charging-port-repair/ | 0 / 354 / 4.71 | Kept the live price finder, removed broad price/time/warranty promises, corrected charging-fault wording and fixed catalogue brand routing. |
| /areas/lymington/ | 0 / 282 / 5.18 | Clarified workshop/local intent and removed stale static review-count/rating markup. |
| /phone-repair-brockenhurst/ | 0 / 241 / 7.47 | Clarified that the workshop is in Lymington, removed stale same-day/from-price claims and preselected the phone quote route. |
| /phone-repair-near-me/ | 1 / 239 / 6.93 | Cleaned stale pricing/warranty/nearest claims and corrected brand-specific quote links. |

Quote-link CI now validates category-only and category+brand routes as well as model/repair links, and separately validates every live price-finder category/brand target. This caught and corrected the Samsung finder brand mismatch.

Do not make more large SEO changes immediately. Let the 24 September changes collect enough fresh UK traffic to compare impressions, CTR, price views, enquiries and booked jobs against this baseline.

## Still outstanding from the growth plan

- Confirm delivery of an actual email/mobile repair request with an authorised test contact; simulated UI checks do not prove message delivery.
- Audit/correct outdated business listings using the relevant owner accounts.
- Establish two useful repair posts per week using real repair examples.
- Prepare the referral pilot and eligible-customer follow-up for approval before sending messages.
- Review UK search clicks, unique requests, arrivals and completed jobs after sufficient new traffic accumulates; do not claim success from this older export.

## Listing correction prepared

The Yell listing at https://www.yell.com/biz/new-forest-device-repairs-lymington-9852921/ still presents 8 Priestlands Place, SO41 9GA, and advertises free diagnosis/no-fix-no-fee. The official contact page https://newforestdevicerepairs.co.uk/contact-us/ instead gives **5a New Street, Lymington, SO41 9BH**, access via 5 New Street at the front. Telephone remains **07410 381247**.

The owner-account update should replace the address, remove the unqualified diagnosis/no-fix-no-fee promises, check current hours against the owner's live Google listing, and point visitors to https://www.newforestdevicerepairs.co.uk/quote/. Suggested description: “Independent phone, tablet, laptop and games-console repairs in Lymington. See available repair prices online, or contact us for help identifying the fault. We explain the repair options, likely timing and applicable warranty before work goes ahead.” No Yell account change or message has been made.

## Deployment recovery

Vercel also reported failure on the preceding main commit, `2ddb806`. Checking its complete sources found missing quote-action-token helper imports, calls to a nonexistent two-argument link builder, and a duplicate narrowed status comparison. Restore the existing quote-link generation for the two send paths; preserve all staff authentication/rate-limit checks and the prior notification suppression change. The incomplete token fragment had no corresponding helper, link consumer or database migration in main. A full token rollout must be coordinated separately, rather than invented merely to make the build compile. Remove the unreachable duplicate status branch.
