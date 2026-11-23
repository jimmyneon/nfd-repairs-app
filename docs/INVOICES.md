# PDF and recurring invoices

Open **Invoices** from the repairs menu, or **Invoice** on a job.

- Customers can download an invoice once a priced job is ready to collect, in storage, collected or completed. The first access creates one numbered invoice. Repeated visits reuse it, including after tracking expiry.
- Repair status emails and post-collection emails include the PDF and a download link. Existing channel preferences still apply; no additional invoice email is sent automatically for a repair.
- Custom invoices have editable drafts, light/dark email previews, PDF preview, staff-only test email, an issue action, a PDF download and an explicit customer email action. The editor preserves decimal typing and unsaved values on request failures, and accepts a website hostname or pasted bank spacing in setup. Issuing fixes customer, item and business details. Record custom payments separately; repair payments come from the job and its source enquiry. Void incorrect invoices and create a corrected custom invoice rather than rewriting issued documents.
- Settings contain the legal identity, address, default bank details, payment instructions and footer. Each bank invoice or recurring schedule can instead keep separate bank details that never update the business defaults or other invoices. Bank transfer invoices cannot be issued, or their schedules activated, without an account name, six-digit sort code and eight-digit account number. They contain no checkout link.
- Recurring schedules are monthly. They can create only or create and email, pause/resume, and stop at a chosen service end date. `{period}` in descriptions expands to the chargeable dates. The final partial period is prorated. A 31st billing date returns to the 31st after February.

## Deployment

Apply `supabase/migrations/20261123132119_pdf_recurring_invoices.sql` before deploying source. It adds only new billing tables, functions and a sequence. All are service-role only; privileged APIs also require the existing `staff_allowlist`. Nothing alters existing repair or payment records.

The repair app's native Supabase scheduler calls `/api/invoices/run` at **06:00 Europe/London**, including GMT/BST changes. Apply `supabase/setup-invoice-cron.sql` after storing the existing Vercel `CRON_SECRET` in Supabase Vault as `nfdr_invoice_cron_secret`. The SQL schedules 05:00 and 06:00 UTC checks, but dispatches only when the UK clock reads 06:00. The dispatch function is callable only by the database owner/scheduler, checks HTTP and delivery failures, and never exposes the credential. If the Vercel secret is rotated, update the Vault value too. No ChatGPT automation is required.

The existing Vercel daily 09:00 UTC invoice cron remains a catch-up/retry path using the same idempotent invoice and email claims. `RESEND_API_KEY`, the normal Supabase service credentials and the correct `NEXT_PUBLIC_APP_URL` must already exist. The cron creates at most one due occurrence per schedule per run, with bounded batches of ten schedules. Manual **Process due invoices** uses the same idempotent path. Paused schedules do not generate invoices. The UI reports the next date, 06:00 UK processing time, active/paused state and delivery errors. Check `cron.job_run_details` for `billing-invoices-0600-london` if the primary dispatch fails.

Invoice sequence numbers are unique; gaps after rolled-back work are normal. Items and seller details are snapshots. Payment credits remain live when downloading. No VAT is charged; VAT accounting and credit-note workflows are outside this feature.

Email delivery claims an atomic five-minute lease and uses a stable Resend idempotency key for uncertain retries. Automatic retries stop after 23 hours if a first-send attempt has an uncertain outcome, avoiding duplicate delivery beyond the provider's idempotency window. Staff can deliberately resend a copy. Check the delivery error before resending an uncertain attempt.

Customer invoice URLs contain unguessable 64-character capability tokens. They are private links; public responses never include capability keys, delivery leases or delivery errors. Staff drafts never appear in public downloads. Existing long tracking links also authorise their job's invoice for the record lifetime, matching the existing published diagnostic report behaviour.

## Validation

`tests/invoices.test.ts` executes the migration and functions against PostgreSQL WASM, including access grants, snapshot immutability, job eligibility, monthly date handling, final-period proration, email claims and duplicate prevention. It exercises guarded routes and creates A4 single-page and long multipage PDFs for visual inspection. The full existing test suite and a Next.js production build also run.

Do not put real customer, bank or recipient details in repository fixtures. Enter them through the private app or authorised database tools. No customer email was sent during implementation.

The embedded invoice email has no image logo and uses a two-column item layout, responsive spacing and explicit dark-mode colours. PDF invoices retain their existing branding. The preview endpoint never issues an invoice; test emails can only go to the authenticated allowlisted staff user. Issued preview requests load the saved invoice and live payment credits.
