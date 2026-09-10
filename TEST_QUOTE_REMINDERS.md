# Quote V2 Remind Me Later — test plan

Production activation order matters. Do not enable the public V2 CTA or reminder cron until the database migration and app routes are deployed and checked.

## Expected customer journey

1. Customer gets a real repair quote.
2. Customer chooses **Remind Me Later** rather than approving the repair.
3. Customer chooses the date they hope to get the repair done (minimum 3 days, maximum 180 days).
4. The enquiry remains a lead: `status=pending`, `proceed_with_repair=false`, `commitment_type=remind_later`.
5. The chosen date is stored as `planned_repair_date`.
6. `reminder_at` is exactly two days earlier at 09:00 UTC (09:00 GMT / 10:00 BST).
7. Customer receives one immediate confirmation text containing the saved quote link.
8. Two days before the target date, the cron sends one neutral repair reminder.
9. If the customer proceeds before then, is converted to a job, or is dismissed, the reminder must not send.
10. Any deposit is handled only after staff checks stock/parts through the existing repair-app workflow.

## Database checks

Apply `supabase/add-quote-reminders.sql` first, then confirm these columns exist on `enquiries`:

- `commitment_type`
- `planned_repair_date`
- `reminder_requested`
- `reminder_at`
- `reminder_sent_at`
- `reminder_cancelled_at`
- `reminder_last_attempt_at`
- `reminder_count`

## Controlled test

Use a test repair quote with a real mobile you control.

- Pick a target repair date 7 days ahead.
- Confirm the enquiry stores the correct device, repair, `screen_option` / `part_option`, quote key, display price and target date.
- Confirm it is **not** approved/reserved/booked.
- Confirm `reminder_at` is 2 calendar days before `planned_repair_date`.
- Confirm exactly one immediate `QUOTE_REMIND_LATER_SAVED` SMS is sent.
- Repeat the same request and confirm idempotency prevents a second confirmation SMS.
- Change the target date and confirm the schedule resets cleanly.

## Reminder sender checks

Before enabling cron, call `/api/enquiries/send-plan-reminders` using the cron secret against a controlled due row.

Confirm:

- one SMS is sent;
- `reminder_sent_at` is populated;
- `reminder_count` increments once;
- the saved quote link works;
- a second call does not send another SMS;
- a failed MacroDroid attempt sets `reminder_last_attempt_at` and cannot retry for one hour;
- a missing phone cancels that reminder rather than looping forever;
- `proceed_with_repair=true`, `converted_to_job=true`, `status=rejected`, or `reminder_cancelled_at` all suppress the reminder.

## Cron activation

Only after the controlled sender test passes:

1. Deploy the reminder endpoint.
2. Replace the placeholder cron secret in `supabase/setup-quote-reminder-cron.sql` with the existing secure cron secret at execution time (do not commit the real secret).
3. Run that SQL in Supabase.
4. Confirm `send-quote-plan-reminders-every-15-min` appears active in `cron.job`.
5. Run one final real-device test before enabling the public website CTA.
