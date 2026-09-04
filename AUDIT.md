# NFD Repairs — Full Application Audit

**Date:** 2026-09-04
**Method:** Six parallel read-only subagents reviewed API routes, frontend pages, Supabase schema/migrations, messaging/notification system, security/auth, and performance/code quality. No code was changed during the audit.

Current repo state: `main` at `b9621df`, clean working tree (only untracked `supabase/.temp/`).

---

## CRITICAL / Blocking

### C1. Anonymous public read access to the entire `jobs` table
- **File:** `supabase/schema-v3-aligned.sql:307-311`
- **Issue:** The RLS policy named "Public can view job by tracking token" uses `USING (true)` — it does **not** filter by `tracking_token`. Any anon Supabase client can `SELECT *` from `jobs`.
- **Why it matters:** Full customer PII (name, phone, email, device, password fields, tracking tokens) is exposed to anyone with the project URL and anon key (both public in the browser bundle).
- **Confidence:** Confirmed in source.
- **Fix:** Rewrite the policy to filter by `tracking_token`. Requires DB migration.

### C2. `password_requests` has unrestricted public SELECT/UPDATE
- **File:** `supabase/add-password-requests-table.sql:37-43`
- **Issue:** Policies named "Public can view/update by token" use `USING (true)` with no token check.
- **Confidence:** Confirmed.
- **Fix:** Add token-based `USING` clauses. Requires DB migration.

### C3. `/api/password/decrypt` returns plaintext device passwords with no auth
- **File:** `app/api/password/decrypt/route.ts:10-70`
- **Issue:** Anyone with a `jobId` can retrieve a decrypted device password. No auth, no rate limit, no audit log.
- **Confidence:** Confirmed.
- **Fix:** Require staff auth; remove or gate behind `requireStaffUser`. Requires code change.

### C4. `/api/password/request` returns the secret token in the JSON response
- **File:** `app/api/password/request/route.ts:125-129`
- **Issue:** The bearer token that should only travel via SMS is returned to the caller.
- **Confidence:** Confirmed.
- **Fix:** Do not return the token in the response. Requires code change.

### C5. `/api/password/cleanup` has no auth — anyone can wipe password requests
- **File:** `app/api/password/cleanup/route.ts`
- **Issue:** Intended as a cron job but has no `CRON_SECRET` check.
- **Confidence:** Confirmed.
- **Fix:** Add `CRON_SECRET` bearer check. Requires code change.

### C6. `CRON_SECRET` hardcoded in 15+ SQL/markdown files
- **Files:** `supabase/setup-collection-reminders.sql`, `setup-tracking-sync-cron.sql`, `setup-sms-drain-cron.sql`, `setup-pg-cron.sql`, `setup-auto-parts-cron.sql`, `flush-pending-sms.sql`, `diagnose-and-fix-all-crons.sql`, `CRON_SETUP_ALTERNATIVES.md`, etc.
- **Issue:** The cron secret is committed in plaintext.
- **Confidence:** Confirmed.
- **Fix:** Rotate the secret; move to Supabase Vault / env vars. Requires DB + config changes.

### C7. `supabase/.temp/pooler-url` contains a live Postgres connection string and is not gitignored
- **File:** `supabase/.temp/pooler-url:1`, `.gitignore`
- **Issue:** Real DB password in a file that `.gitignore` does not exclude.
- **Confidence:** Confirmed.
- **Fix:** Add `supabase/.temp/` to `.gitignore`; rotate the DB password if ever committed.

### C8. `QUOTE_REQUESTED` status will be rejected by DB constraint
- **Files:** `app/booking/page.tsx:222`, `app/api/jobs/create-v3/route.ts:117`, `supabase/consolidate-dropped-off-to-received.sql:23-43`
- **Issue:** The booking page sends `initial_status: 'QUOTE_REQUESTED'`, but no `valid_status` constraint includes that value.
- **Confidence:** Confirmed in source.
- **Fix:** Add `QUOTE_REQUESTED` to the constraint, or stop sending it. Requires DB or code change.

### C9. Public `/signup` route — anyone can create a staff auth account
- **File:** `app/signup/page.tsx:34-37`, `middleware.ts:74-95`
- **Issue:** Middleware redirects authenticated users away from `/signup` but does not prevent unauthenticated access.
- **Confidence:** Confirmed.
- **Fix:** Disable public signup in Supabase auth settings and remove/gate the route.

---

## HIGH Priority

### H1. API routes use service-role key with no authentication
- **Files:** ~54 of ~61 route files under `app/api/**` use `SUPABASE_SERVICE_ROLE_KEY`; only 3 call `requireStaffUser`.
- **Issue:** Unauthenticated routes bypass RLS and can read/write any table.
- **Confidence:** Confirmed.
- **Fix:** Add `requireStaffUser` (with role check) or `CRON_SECRET` to every privileged route.

### H2. `requireStaffUser` does not check a staff role
- **File:** `lib/api-auth.ts:5-26`
- **Issue:** Only verifies a signed-in Supabase user exists. Combined with C9, any account is "staff".
- **Fix:** Add a `staff`/`admin` role check.

### H3. Middleware does not protect API routes
- **File:** `middleware.ts:93-95`
- **Issue:** Matcher is `['/app/:path*', '/login', '/signup']` only. No `/api/*` protection.
- **Fix:** Extend matcher or add per-route auth.

### H4. Wide CORS `*` on state-changing public endpoints
- **Files:** `app/api/enquiries/update/route.ts:10`, `app/api/analytics/track/route.ts:8`, `app/api/enquiries/accept/route.ts:8`, `app/api/contact-card/text-me/route.ts:4`, `app/api/public/business-enquiry/route.ts:9`, and others.
- **Fix:** Restrict CORS to known origins.

### H5. SMS/email `*_sent_at` timestamps written even on delivery failure
- **Files:** `app/api/jobs/send-collection-sms/route.ts:175-228`, `send-aftercare-sms/route.ts:132-151`, `send-collection-reminders/route.ts:246-270`, `auto-parts-ordered/route.ts:193-216`.
- **Issue:** Failed messages are never retried.
- **Fix:** Only write `*_sent_at` when `deliveryStatus === 'SENT'`.

### H6. Callers ignore `sendEmail()` and SMS fetch failures
- **Files:** `app/api/jobs/create-v3/route.ts:529-542`, `enquiries/convert-to-job/route.ts:234-249`, `public/intake/[token]/route.ts:130-141`, `enquiries/update/route.ts:335-344`, `app/app/jobs/[id]/page.tsx:580-588`.
- **Issue:** Failed emails are logged as `SENT`.
- **Fix:** Check `result.success` and log `FAILED` when appropriate.

### H7. No fetch timeout on MacroDroid webhooks
- **Files:** All SMS-sending routes.
- **Issue:** A slow/down MacroDroid webhook hangs the Vercel function until the serverless timeout.
- **Fix:** Add `AbortSignal.timeout(10000)` to every MacroDroid `fetch`.

### H8. Cron endpoints exceed Vercel serverless timeout
- **Files:** `send-collection-sms/route.ts` GET, `send-collection-reminders/route.ts`, `auto-parts-ordered/route.ts`, `sms/send-all/route.ts`.
- **Issue:** `vercel.json` has no `maxDuration` or `crons` config. Default 60s limit is easily exceeded.
- **Fix:** Set `export const maxDuration = 300` on cron routes, cap batch sizes, or move to a queue.

### H9. `job_events.type` constraint rejects `ERROR` and `PRICE_UPDATE`
- **Files:** `supabase/schema-v3-aligned.sql:96-100` vs `app/api/jobs/create-v3/route.ts:388,469`, `app/api/jobs/[jobId]/route.ts:102`.
- **Fix:** Extend the constraint or use `SYSTEM` with descriptive messages.

### H10. Cancellation reasons in UI rejected by DB constraint
- **Files:** `components/CancellationReasonModal.tsx:14-20` vs `supabase/add-new-statuses-and-cancellation.sql:32-43`.
- **Fix:** Align the constraint with the UI.

### H11. `email_templates` has two conflicting schemas
- **Files:** `notification-config-schema.sql:35-44` vs `initialize-notification-system.sql:31-40`.
- **Fix:** Pick one schema; remove the other.

### H12. No React error boundaries
- **Issue:** No `error.tsx`, `global-error.tsx`, or class boundary found anywhere.
- **Fix:** Add `app/error.tsx` and `app/global-error.tsx`.

### H13. `next.config.js` disables TypeScript and ESLint build checks
- **File:** `next.config.js:6-11`
- **Fix:** Re-enable after cleaning obvious issues.

### H14. `dangerouslySetInnerHTML` in email-templates preview
- **File:** `app/app/email-templates/page.tsx:281-283`
- **Fix:** Sanitize before preview or use an iframe sandbox.

### H15. No security headers in `next.config.js`
- **File:** `next.config.js:4-19`
- **Fix:** Add a `headers()` block (CSP, HSTS, X-Frame-Options, etc.).

### H16. HTML injection in outgoing enquiry emails
- **File:** `app/api/enquiries/update/route.ts:285-330`
- **Fix:** Escape all interpolated values.

---

## MEDIUM Priority

### M1. PostgREST filter injection via unsanitised `.or()` strings
- **Files:** `app/api/quotes/search/route.ts:41`, `app/api/reviews/track-open/route.ts:34`, `reviews/track-click/route.ts:39`, `reviews/status/route.ts:34`, `components/CustomerSearchModal.tsx:89,108`.
- **Fix:** Sanitise/escape input or use parameterised filters.

### M2. Race conditions on read-then-write flows
- **Files:** `create-v3` duplicate check, `enquiries/update` reserve check, `auth/verify` token update, `password/submit`, SMS `PENDING`→`SENT` transitions.
- **Fix:** Use `.upsert()` with conflict targets or atomic conditional updates.

### M3. No rate limiting anywhere
- **Fix:** Add rate limiting via Vercel KV / Upstash.

### M4. `select('*')` used in 72 places; no pagination on dashboards
- **Files:** `app/app/jobs/page.tsx:151`, `history/page.tsx:71`, `enquiries/page.tsx:177`, `warranty/page.tsx:128`, `send-in-requests/page.tsx:59`, many API routes.
- **Fix:** Use explicit column lists and `.range()` pagination.

### M5. Realtime: 4 channels on jobs dashboard, all trigger full re-fetches
- **File:** `app/app/jobs/page.tsx:65-93`
- **Fix:** Reduce channel count; use targeted payloads; debounce.

### M6. Missing `useMemo`/`useCallback`/`React.memo`
- Only 13 memoization matches in the whole repo.
- **Fix:** Memoize derived state and wrap hot components.

### M7. Supabase client uses stale `Database` type
- **Files:** `lib/supabase.ts:2`, `lib/supabase-browser.ts:2` import from `lib/types.ts`, not `lib/types-v3.ts`.
- **Fix:** Switch imports to `types-v3.ts` and consolidate.

### M8. Dual type definition files (`lib/types.ts` vs `lib/types-v3.ts`)
- **Fix:** Delete the legacy file or merge.

### M9. Supabase errors swallowed across frontend
- **Files:** `app/t/[token]/page.tsx:124-184`, `app/app/history/page.tsx:68-80`, `enquiries/page.tsx:174-181`, `email-templates/page.tsx:46-56`, `jobs/[id]/edit/page.tsx:54-80`.
- **Fix:** Branch on `error`; show retry UI.

### M10. `alert()` used for errors; `console.log` in production
- 80+ `console.log/error` matches; `alert()` in booking, walk-in, edit job.
- **Fix:** Replace with inline `role="alert"` banners; strip or guard logs.

### M11. Accessibility: icon-only buttons, unassociated labels, non-modal dialogs
- **Files:** `components/SlideUpPanel.tsx`, `PwaInstallPrompt.tsx:85-90`, forms across `booking`, `walk-in`, `password`, `edit job`.
- **Fix:** Add `aria-label`, `htmlFor`/`id`, `role="dialog"`, focus traps.

### M12. `send-tracking-sms` does not use shared template renderer
- **File:** `app/api/jobs/send-tracking-sms/route.ts:46-65`
- **Issue:** Uses `.replace()` (single replacement); `{{first_name}}` placeholders can leak.
- **Fix:** Use `renderSmsTemplate`; align column names.

### M13. Scheduling edge case: review SMS scheduled in the past
- **File:** `app/api/jobs/schedule-collection-sms/route.ts:147-162`
- **Fix:** If calculated time is in the past, push to next allowed window.

### M14. `isWithinAllowedHours()` uses UTC, not UK time
- **File:** `app/api/jobs/schedule-collection-sms/route.ts:267-271`
- **Fix:** Use `Intl.DateTimeFormat` with `Europe/London` timezone.

### M15. `array_length()` used on JSONB column
- **File:** `supabase/verify-and-update-review-system.sql:151`
- **Fix:** Use `jsonb_array_length()`.

### M16. Synchronous `net.http_post` in notification trigger
- **File:** `supabase/fix-push-notification-trigger.sql:5-36`
- **Fix:** Use `pg_net` async or a queue table.

### M17. Hardcoded Evri API key in source
- **File:** `lib/trackers.ts:327,337,372`
- **Fix:** Move to env var.

### M18. No `updated_at` trigger on `jobs`
- **Fix:** Attach the trigger.

### M19. `closed_at` not set on manual completion
- **Fix:** Set `closed_at` in all completion paths.

### M20. Legacy/dead code in production routes
- **Files:** `app/app/jobs/page-old.tsx`, `app/app/enquiries/page-old.tsx`, `app/app/test-notifications/page.tsx`, `app/api/test-sms/route.ts`.
- **Fix:** Delete or move behind a feature flag.

### M21. QR libraries (`qrcode`, `jsqr`) eagerly bundled
- **Fix:** Use `next/dynamic` to lazy-load.

---

## LOW Priority / Nice-to-have

- **L1.** `repair_token` cookie lacks `__Host-` prefix and explicit `Path`.
- **L2.** Magic-link flow leaks email existence; logs the full magic link.
- **L3.** DPD tracking URL doesn't `encodeURIComponent` the tracking number.
- **L4.** WCAG colour contrast of `JOB_STATUS_COLORS` palette is unverified.
- **L5.** `ImHereButton` GPS errors show only generic message.
- **L6.** `RepairDashboard` "Report Issue" button is non-functional.
- **L7.** `auto_close_collected_jobs` can insert duplicate events.
- **L8.** Base schema files use `DROP TABLE ... CASCADE` — destructive if re-run.
- **L9.** 121 `CREATE INDEX` statements across migrations, many duplicated.
- **L10.** Missing indexes on commonly filtered columns.
- **L11.** `vercel.json` has no `crons` section.
- **L12.** VAPID env var names inconsistent between routes.
- **L13.** `NotificationSetup` gives no user feedback when push subscription fails.
- **L14.** `staff_later` super-quick mode uses the same `RECEIVED` SMS as `confirm_now`.
- **L15.** Two backup schedulers can both set `post_collection_sms_scheduled_at` without checking each other.

---

## Working Well

- Job reference trigger fix (`MAX`-based) is applied and verified.
- `create-v3` retries duplicate `job_ref` collisions (up to 3 times).
- Super-quick mode phone validation is in place.
- Dashboard tiles are compact and show customer names.
- Realtime reloads are debounced (300ms) on the jobs dashboard.
- Success page no longer auto-redirects; has manual navigation.
- `renderSmsTemplate` has a safety net that strips unresolved placeholders.
- `email/send` route is the one robust caller that checks `result.success`.
- Delay reasons are consistent between UI and DB constraint.
- Legacy `/onboard/[token]` correctly redirects to `/walk-in/complete/[token]`.
- Most data-fetching pages show a centered spinner during load.
- Public `intake/[token]` route validates token format and masks `device_password`.

---

## Recommended Test Plan

1. **RLS verification:** Run `SELECT * FROM jobs` using only the anon key.
2. **Password endpoint check:** `curl POST /api/password/decrypt` with no auth header.
3. **`QUOTE_REQUESTED` insert:** Submit a booking and check for DB constraint errors.
4. **Cron timeout:** Check Vercel function logs for timeout errors.
5. **Failed SMS retry:** Find a job where MacroDroid returned non-2xx and check `*_sent_at`.
6. **Email failure logging:** Trigger a failed email and check `email_logs.status`.
7. **Cancellation reasons:** Try `UNECONOMICAL` from the UI.
8. **`npm audit`:** Run an authoritative dependency audit.
9. **DB introspection:** `supabase db pull` and compare actual schema against migrations.
10. **Cron secret rotation:** After rotating, confirm all cron jobs still authenticate.

---

## Summary of Priorities

| Priority | Count | Theme |
|----------|-------|-------|
| Critical | 9 | RLS holes, plaintext secrets, unauthenticated password endpoints, open signup, status constraint mismatch |
| High | 16 | Unauthenticated API routes, silent notification failures, cron timeouts, no error boundaries, disabled build checks, HTML injection |
| Medium | 21 | Race conditions, no rate limiting, over-fetching, accessibility, type drift, scheduling bugs, missing indexes |
| Low | 15 | Cookie hardening, colour contrast, dead code, duplicate events, env var naming |
