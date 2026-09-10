# Devin handoff — Quote V2 / Remind Me Later rollout

## Goal

Finish, test and deploy the new **Remind Me Later** flow for NFD repair quotes.

The desired customer journey is:

1. Customer gets their repair price through the existing quote system.
2. If ready now, they use **I Want to Go Ahead** as normal.
3. If not ready, they choose **Remind Me Later**.
4. Ask: **“When are you hoping to get the repair done?”**
5. Save that intended repair date against the existing repair enquiry. This is **not an appointment, booking, stock reservation or repair approval**.
6. Send an immediate confirmation SMS with the saved quote link.
7. Automatically send one service reminder **2 days before** the intended repair date.
8. The customer can return through the saved quote or reply to the SMS.
9. When they actually want to proceed, staff must still check stock/parts in the repair app.
10. If parts are in stock, continue through the existing job flow. If a special-order part is needed, use the **existing repair-app deposit flow** at that point.

Do **not** add a generic £10 reservation/payment to the first rollout. The separate SumUp experiment was deliberately shelved. The existing parts-deposit workflow is the right place to take money when NFD actually has stock exposure.

---

## Current repositories / branches

### Repair app
Repository: `jimmyneon/nfd-repairs-app`

Feature candidate: `feature/quote-reminders-ready`

Important: this candidate was deliberately rebuilt from production `main` and contains only new reminder/migration/test files, but **main has moved again since then**. At handoff time:

- current `main`: `25642e9a749a73b4c8709ffd40583f5eded35527`
- feature merge-base: `2e15eb4221ca60566cd73e59a31865c70b1695fe`
- `feature/quote-reminders-ready` is 1 feature commit ahead but currently 5 commits behind `main`

Therefore **do not blindly merge the branch**. Rebase/port the six feature files onto the latest `main`, resolve against current production code, then rebuild/test.

Files in the app feature candidate:

- `app/api/enquiries/plan-later/route.ts`
- `app/api/enquiries/send-plan-reminders/route.ts`
- `supabase/add-quote-reminders.sql`
- `supabase/setup-quote-reminder-cron.sql`
- `supabase/sync-quote-option-display.sql`
- `TEST_QUOTE_REMINDERS.md`

An earlier version of the reminder implementation passed a Vercel build. The final port onto latest `main` must be built/tested again after rebasing.

### Public website
Repository: `jimmyneon/nfdr`

Feature/preview branch: `feature/quote-v2`

At handoff time this branch is also behind current website `main`:

- current website `main`: `60a03a07e42f406ca17bd2b85c5395d222c3fd7e`
- feature merge-base: `c5c5e1053fec4ca3c35444ac91b3da0ebdd8f9f7`
- branch is currently 6 commits ahead / 3 behind

Do **not** copy the old `quote-v2/index.html` over `/quote/` as-is because production quote files have gained fixes since that preview was made (including the fixed-option guard). Rebuild the V2 preview from the **latest live `/quote/index.html`**, then add only the Remind Me Later layer.

Feature files currently on the website branch:

- `js/quote-v2-followup.js`
- `quote-v2/index.html`
- `QUOTE_V2_TEST_PLAN.md`
- `.github/workflows/quote-v2-check.yml`

The Quote V2 validation workflow previously passed: JS syntax valid, preview noindex, and production `/quote/` did not load the experimental script. Re-run after rebuilding from latest `main`.

### Shelved payment experiment

Branch: `feature/sumup-reservations`

PR #7 was closed intentionally. **Do not merge/deploy it in this rollout.**

---

## Database changes to apply in Supabase

These SQL files already exist on the app feature branch and should be reviewed/ported to latest `main` first.

### 1. `supabase/add-quote-reminders.sql`

Adds reminder lifecycle fields to `enquiries`, including:

- `commitment_type`
- `planned_repair_date`
- `reminder_requested`
- `reminder_at`
- `reminder_sent_at`
- `reminder_cancelled_at`
- `reminder_last_attempt_at`
- `reminder_count`

Also creates indexes for due reminders / planned dates.

### 2. `supabase/sync-quote-option-display.sql`

There is an existing data/UI inconsistency:

- the quote system saves the richer `part_option`
- the Enquiries UI often displays legacy `screen_option`

This SQL backfills `screen_option = part_option` where appropriate and adds a trigger so future repair enquiries remain compatible with the existing UI. Keep `part_option`; do not replace or discard it.

### 3. `supabase/setup-quote-reminder-cron.sql`

Creates the scheduled call to the reminder endpoint.

Do **not** enable the cron until the route has been deployed and manually tested against a controlled due reminder.

Use the existing secure cron secret at execution/deployment time. Do not commit a real secret to Git.

---

## Intended data/state behaviour

When customer chooses Remind Me Later:

- keep `enquiry_type = repair_quote`
- set `commitment_type = remind_later`
- set `planned_repair_date = customer chosen target repair date`
- set `reminder_requested = true`
- set `reminder_at = planned_repair_date minus 2 calendar days`
- keep `status = pending`
- keep `proceed_with_repair = false`
- do not set `repair_reserved`
- do not create a job
- do not reserve stock
- do not request/take a deposit

The current implementation uses a target-date range of roughly **3 to 180 days ahead** so a two-day lead reminder is meaningful.

Store/display as much of the actual quote selection as possible:

- device category
- make
- model
- repair type
- `quote_key`
- `part_option`
- compatible `screen_option`
- `quoted_price`
- `display_price`
- warranty / ETA where already supplied by catalogue
- planned repair date
- reminder date
- customer name/mobile

The customer’s selected option and reminder choice must be obvious when staff opens the enquiry.

---

## Immediate SMS

After saving Remind Me Later, send one confirmation SMS containing:

- customer first name
- device/repair
- selected option if available
- saved quote/price if available
- intended repair date
- reminder date (2 days beforehand)
- saved quote link
- clear wording that nothing is booked and nothing is payable yet
- clear wording that if a part needs ordering NFD will confirm that before asking for a deposit

This is a **service message**, not marketing.

Double-tapping/repeating the same request should be idempotent and must not send duplicate confirmation texts.

---

## Reminder SMS

Two days before the intended repair date, send one neutral service reminder containing the saved quote link.

It should make it easy for the customer to proceed but must not claim that:

- an appointment exists
- stock has been reserved
- the repair has been booked
- a deposit has been paid

A failed SMS should set/retain an attempt timestamp and avoid rapid repeated retries. Current design throttles retries for at least one hour.

Once sent successfully, mark `reminder_sent_at` and increment `reminder_count` so it cannot send again.

A reminder must be suppressed if the enquiry has already:

- proceeded/been approved
- converted to a job
- been dismissed/rejected
- had the reminder explicitly cancelled

---

## CRITICAL: inbound SMS acceptance currently bypasses stock check

This is the main unfinished workflow issue.

Existing route: `app/api/sms/reply/route.ts`

Current global behaviour for an active repair quote is roughly:

- high-confidence `YES` / `go ahead` / `book me in` -> immediately auto-convert enquiry to a job
- medium replies -> asks customer to reply YES
- decline -> rejects enquiry
- unclear -> logs to enquiry / notifies staff

For **Remind Me Later** leads, immediate auto-conversion is wrong because NFD still needs to check whether the part is in stock or must be ordered.

### Preferred fix

Special-case active enquiries where `commitment_type = 'remind_later'`.

If a reminder customer sends a high-confidence acceptance such as YES / GO AHEAD:

1. **Do not auto-create a job.**
2. Mark the enquiry as ready for staff action, e.g. `status='approved'`, `proceed_with_repair=true` (or the current equivalent that makes the Enquiries UI show the accepted repair / stock-check buttons).
3. Cancel any outstanding reminder (`reminder_cancelled_at` or equivalent).
4. Create a staff notification: customer wants to proceed; check stock/parts.
5. Send a customer acknowledgement such as: “Thanks — we’ll check parts availability and text you with the next step.”
6. Staff then uses the existing **In Stock / Need Parts** decision in Enquiries.
7. If Need Parts, the existing job/deposit workflow handles the deposit request.

Do not change global SMS acceptance behaviour for unrelated quote paths unless deliberately reviewing that whole system. Keep this rollout scoped where possible.

If a free-text reply is unclear, it should remain attached to the repair enquiry and surface for staff review.

---

## Enquiries UI / visibility

Current Enquiries screen already has useful journey concepts such as:

- Viewed · No Action
- Quote Sent
- Accepted
- Follow-up
- Booked In

The Remind Me Later lead should **not** appear as an urgent stock/action item before the customer proceeds.

It should be visibly identifiable, for example:

- badge/status: `REMIND LATER`
- target repair date: `20 Sep`
- reminder date: `18 Sep`
- quote option and price visible

When the reminder customer later accepts, then move it into **Action Needed / Accepted** so staff checks stock.

The feature implementation already stores a readable note/compatibility option, but improve the UI directly if practical so this does not rely solely on notes.

---

## Website V2 behaviour

After price is shown, replace/rework the old payday action into something like:

**Remind Me Later — £0**

Panel wording should be based around:

> When are you hoping to get the repair done?

Suggested quick choices can include:

- next week
- two weeks
- custom date

Then show the calculated reminder concept clearly, e.g.:

> We’ll give you a shout 2 days beforehand.

Explain:

- quote is saved
- nothing to pay now
- this is not an appointment
- stock is not reserved yet
- if a special-order part is needed, NFD will contact them before requesting any deposit

Keep **I Want to Go Ahead** as the primary action for customers ready now.

Do not reintroduce the generic £20/£10 reservation into this first release.

---

## Test sequence before public activation

Use `TEST_QUOTE_REMINDERS.md` as the starting checklist, then complete a real end-to-end test using a mobile number controlled by NFD.

Minimum acceptance test:

1. Rebase/port app feature onto latest `main`.
2. Build/deploy app preview and confirm Vercel succeeds.
3. Apply `add-quote-reminders.sql` in Supabase.
4. Apply `sync-quote-option-display.sql` in Supabase.
5. Do **not** enable cron yet.
6. Rebuild website Quote V2 from the latest `/quote/index.html` and latest production JS versions.
7. Keep preview `noindex` and unlinked while testing.
8. Create a real fixed-price quote with an option/part quality and a controlled mobile number.
9. Choose Remind Me Later with an intended repair date at least several days ahead.
10. Confirm the existing enquiry now contains the correct device, repair, option, quote key, display/quoted price, planned repair date and calculated reminder date.
11. Confirm it is still pending/not booked/not converted/no deposit.
12. Confirm exactly one immediate confirmation SMS arrives.
13. Repeat the same request and prove no duplicate confirmation SMS is sent.
14. Change the target date and prove the schedule updates cleanly.
15. Create or temporarily adjust a controlled due reminder and manually call `send-plan-reminders` with the cron secret.
16. Confirm exactly one reminder SMS arrives and the DB marks it sent.
17. Call sender again and prove no duplicate SMS.
18. Test failure/retry throttling if practical.
19. Test suppression after approval/conversion/rejection.
20. Test an inbound acceptance reply from the reminder SMS and prove it **does not auto-create a job**; it should instead surface as accepted/action-needed for the stock decision.
21. Test an unclear reply and confirm it appears against the enquiry for staff.
22. Only after all of the above passes, apply/enable `setup-quote-reminder-cron.sql`.
23. Run one final real-device scheduled test.
24. Then merge/deploy the customer-facing quote change to the normal `/quote/` route.

---

## Production safety

The public website is hosted through Hostinger Git deployment from `jimmyneon/nfdr` `main`, so commits to website `main` can go live quickly.

For this feature:

- do not develop large changes directly on website `main`
- preserve current production quote code until the V2 flow passes end-to-end
- rebuild V2 from latest `main` before merge
- inspect the final diff before merging
- keep a normal Git history; no destructive history rewrite is needed

The repair app also changes frequently through Devin. Always refresh/rebase against current `main` immediately before final merge.

---

## Out of scope / deliberately deferred

- Generic £10 SumUp reservation checkout
- Generic £20 payday deposit
- Calendar events for tentative leads (repair app should remain the source of truth; these are not appointments)
- Broad rewrite of all inbound SMS automation unless required for the reminder-specific stock-check safety fix

---

## Definition of done

This feature is done when a real customer can:

**get quote -> choose Remind Me Later -> choose intended repair date -> receive saved-quote confirmation -> receive exactly one reminder 2 days before -> respond/go ahead -> appear in Enquiries for stock check -> only receive a deposit request if staff decides parts must be ordered.**

No part of that journey should claim a booking, reserved stock or payment before those things actually exist.
