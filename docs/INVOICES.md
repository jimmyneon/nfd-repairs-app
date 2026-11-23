# PDF and recurring invoices

Open **Invoices** from the repairs menu, or **Invoice** on a job.

- Customers can download an invoice once a priced job is ready to collect, in storage, collected or completed. The first access creates one numbered invoice. Repeated visits reuse it, including after tracking expiry.
- Repair status emails and post-collection emails include the PDF and a download link. Existing channel preferences still apply; no additional invoice email is sent automatically for a repair.
- Custom invoices have editable drafts, a live HTML preview, an issue action, a PDF download and an explicit email action. Issuing fixes customer, item and business details. Record custom payments separately; repair payments come from the job and its source enquiry. Void incorrect invoices and create a corrected custom invoice rather than rewriting issued documents.
- Settings contain the legal identity, address, bank details, payment instructions and footer. Bank transfer invoices cannot be issued, or their schedules activated, without an account name, six-digit sort code and eight-digit account number. They contain no checkout link.
- Recurring schedules are monthly. They can create only or create and email, pause/resume, and stop at a chosen service end date. `{period}` in descriptions expands to the chargeable dates. The final partial period is prorated. A 31st billing date returns to the 31st after February.

## Deployment

Apply `supabase/migrations/20261123132119_pdf_recurring_invoices.sql` before deploying source. It adds only new billing tables, functions and a sequence. All are service-role only; privileged APIs also require the existing `staff_allowlist`. Nothing alters existing repair or payment records.

The existing Vercel cron configuration calls `/api/invoices/run` daily at 09:00 UTC using the existing `CRON_SECRET`. `RESEND_API_KEY`, the normal Supabase service credentials and the correct `NEXT_PUBLIC_APP_URL` must already exist. The cron creates at most one due occurrence per schedule per run, with bounded batches of ten schedules. Manual **Process due invoices** uses the same idempotent path. Paused schedules do not generate invoices. The UI reports the next date, active/paused state and delivery errors.

Invoice sequence numbers are unique; gaps after rolled-back work are normal. Items and seller details are snapshots. Payment credits remain live when downloading. No VAT is charged; VAT accounting and credit-note workflows are outside this feature.

Email delivery claims an atomic five-minute lease and uses a stable Resend idempotency key for uncertain retries. Automatic retries stop after 23 hours if a first-send attempt has an uncertain outcome, avoiding duplicate delivery beyond the provider's idempotency window. Staff can deliberately resend a copy. Check the delivery error before resending an uncertain attempt.

Customer invoice URLs contain unguessable 64-character capability tokens. They are private links; public responses never include capability keys, delivery leases or delivery errors. Staff drafts never appear in public downloads. Existing long tracking links also authorise their job's invoice for the record lifetime, matching the existing published diagnostic report behaviour.

## Validation

`tests/invoices.test.ts` executes the migration and functions against PostgreSQL WASM, including access grants, snapshot immutability, job eligibility, monthly date handling, final-period proration, email claims and duplicate prevention. It exercises guarded routes and creates A4 single-page and long multipage PDFs for visual inspection. The full existing test suite and a Next.js production build also run.

Do not put real customer, bank or recipient details in repository fixtures. Enter them through the private app or authorised database tools. No customer email was sent during implementation.
