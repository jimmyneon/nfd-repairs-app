# Quote V2 — Remind Me Later test plan

This feature must not be merged to production until the checklist below has been exercised against a controlled test quote.

## Production safety

- Keep `main` untouched while testing.
- Rebase this branch onto the latest `main` once concurrent app work has settled.
- Apply `supabase/add-quote-reminders.sql` before deploying the API routes that use the new columns.
- Do not enable `supabase/setup-quote-reminder-cron.sql` until the endpoint has been deployed and manually verified.
- Use a known test mobile number. Do not schedule test reminders to real customers.

## Save-for-later flow

1. Create/reuse a test repair quote with a known catalogue price.
2. Choose **Remind Me Later** and select a future date.
3. Confirm the enquiry remains a lead:
   - `status = pending`
   - `proceed_with_repair = false`
   - `commitment_type = follow_up`
   - `follow_up_date` matches the chosen date
   - `reminder_requested = true`
   - `reminder_sent_at IS NULL`
4. Confirm the server has not converted the enquiry to a job and has not reserved stock.
5. Confirm the saved quote price still matches the server-verified catalogue price.
6. Confirm one immediate SMS is sent with the quote link and the promised reminder date.
7. Double-submit the same date and confirm the endpoint returns `already_saved` without a second confirmation SMS.

## Date validation

- Reject today and past dates.
- Accept tomorrow.
- Accept a custom future date up to 180 days away.
- Reject a date more than 180 days away.
- Confirm date formatting is correct around GMT/BST changes.

## Reminder delivery

1. On a test row only, temporarily set `reminder_at` to a due timestamp.
2. Call `/api/enquiries/send-plan-reminders` with the cron secret.
3. Confirm exactly one SMS is sent.
4. Confirm `reminder_sent_at` is populated and `reminder_count = 1`.
5. Call the endpoint again and confirm no duplicate is sent.
6. Confirm the SMS links back to the same quote and says parts will be checked before a trip.

## Suppression rules

Before the reminder is due, separately test each state below and confirm no reminder is sent:

- customer clicks **I Want to Go Ahead** (`proceed_with_repair = true`)
- enquiry is converted to a job
- enquiry is dismissed/rejected
- reminder is manually cancelled
- customer phone number is missing (the reminder should cancel rather than retry forever)

## Failure/retry behaviour

- Simulate a MacroDroid failure and confirm `reminder_last_attempt_at` is written.
- Re-run within one hour and confirm the same reminder is not hammered repeatedly.
- Re-run after the retry window and confirm it can be attempted again.
- Confirm failed attempts are logged without marking the reminder as successfully sent.

## App/admin presentation

- A future follow-up must not appear as an approved repair needing immediate stock action.
- Staff should be able to see the chosen follow-up date when opening the enquiry.
- Once the customer proceeds, the normal stock-check / convert-to-job flow should take over.

## Go-live order

1. Rebase onto latest app `main` and resolve any concurrent changes.
2. Verify Vercel preview/build succeeds.
3. Apply database migration.
4. Deploy API code.
5. Run the manual controlled tests above.
6. Only then enable the cron job.
7. Verify one real test reminder end-to-end before connecting the public Quote V2 page.
