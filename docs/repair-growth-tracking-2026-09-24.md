# Repair growth tracking — 24 September 2026

## Delivered in this batch

- Main quote analytics recognises successful `repair_request_submitted` events as submitted visits and form submissions, alongside the legacy event.
- Quote UX includes direct-link, search, restored and resumed visits without requiring a step-one event. Category abandonment only counts visits that entered the category step.
- Separate workshop outcomes count distinct submitted references and unique jobs rather than treating repeat visits as extra jobs.
- Jobs can link via `jobs.quote_request_id` or `enquiries.converted_job_id`; multiple jobs from one request remain visible.
- Arrivals include DROPPED_OFF. Completed counts mean COLLECTED or COMPLETED. Completed-and-marked-paid additionally requires the existing full-payment flag.
- Requests with missing enquiry records are displayed as unmatched; database failures return an error instead of zero outcomes.
- The report selects requests by submission date and shows their jobs' current outcomes, so later arrivals/completions improve the original cohort.

## Validation

23 analytics regression tests passed, including direct links, resumed requests, repeated references, multiple jobs, forward-only links, stale references, missing records, paid versus unpaid completions, staff authentication and query errors. TypeScript checking passed in an isolated checkout using existing installed dependencies, with the current analytics sources overlaid. No live customer enquiry or notification was created by testing.

## Measurement limits

This is website-event attribution, not a full cash or accounts report. Analytics blocked in a visitor's browser will not appear. The app's payment flag may have been automatically backfilled for historical collected/completed jobs. Closed status does not prove a successful repair. The main dashboard's older saved-enquiry cohort remains separate from the new unique-job panel.

## Search Console priorities

Source: supplied Performance-on-Search-2026-09-24.xlsx. Although Filters says 'Last 3 months', the Chart sheet contains 9–21 September only: 37 clicks and 3,911 impressions. This predates the 24 September website fixes and cannot measure their impact.

All 37 clicks are UK; UK impressions are 2,101 (1.76% CTR). US impressions are 1,694 with no clicks. Mobile contributes 25 of 37 clicks. Judge local progress with a UK filter rather than the blended all-country CTR.

Candidates for the next page review (all-country page totals; the export cannot join country to page):

| Page | Clicks | Impressions | Average position |
| --- | ---: | ---: | ---: |
| /phone-repair-cost/ | 0 | 507 | 11.97 |
| /samsung-charging-port-repair/ | 0 | 354 | 4.71 |
| /areas/lymington/ | 0 | 282 | 5.18 |
| /phone-repair-brockenhurst/ | 0 | 241 | 7.47 |
| /phone-repair-near-me/ | 1 | 239 | 6.93 |

Review local intent, truthful titles/descriptions, clear New Milton workshop location and relevant quote links before adding more similar pages. The small sample is a prioritisation signal, not proof that any title is the cause.

## Still outstanding from the growth plan

- Confirm delivery of an actual email/mobile repair request with an authorised test contact; simulated UI checks do not prove message delivery.
- Audit/correct outdated business listings using the relevant owner accounts.
- Finish priority service-page/local-search review, coordinating with any other active website changes.
- Establish two useful repair posts per week using real repair examples.
- Prepare the referral pilot and eligible-customer follow-up for approval before sending messages.
- Review UK search clicks, unique requests, arrivals and completed jobs after sufficient new traffic accumulates; do not claim success from this older export.
