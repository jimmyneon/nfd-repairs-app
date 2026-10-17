# Customer diagnostic reports

## Audit and behaviour

The production workflow is `jobs` → staff `/app/jobs/[id]` → customer `/t/[token]`.
Previously, `jobs.diagnostic_report` was private free text, saved together with
`diagnosis_notes`. Tracking intentionally excluded both fields. The separate
`/repair/[id]` route uses legacy `repairs` and `magic_links`; its newly added report
endpoint returned an HTML attachment and was not rendered in the dashboard.

Staff now have Save Draft and Publish to Customer in the existing diagnostic
panel. Findings, conclusion, recommendations and outcome are separate fields.
Published snapshots retain device/customer/reference metadata and previous
versions. Editing a draft does not change the last published report. Saving no
longer overwrites internal `diagnosis_notes`. Existing private text is available
in the editor for review, never automatically published.

The main customer screen reads the latest publication and offers a real PDF.
Publication is immediately available from the API; open screens refresh within
30 seconds. Normal tracking still expires as before, but the same long tracking
token continues to authorise report-only access after expiry, independent of
status. Deleting the repair under the business retention policy also deletes its
reports. Treat the tracking URL as a private bearer capability; rotating the
job's long token revokes the old link. No public Supabase grants are added.

Legacy published reports remain readable, now with real PDF downloads. Legacy
magic-link authentication still expires and must be renewed; report visibility
is independent of the legacy repair's status. The legacy dashboard now validates
expiry and performs server-side reads only after checking repair ownership.
Only explicit customer-safe fields are passed to the dashboard; legacy internal
repair notes are excluded.

## Required database migration

Apply `supabase/migrations/20261017094717_published_job_diagnostic_reports.sql`
to the **NFD Repairs production database**, after confirming the existing
`jobs`, `job_events`, and `staff_allowlist`/`is_staff` security setup from the
September migrations. Use the established Supabase migration process or SQL
Editor. This creates one additive table and one service-role-only, invoker
transaction function. It does not alter or publish historical reports.

The new table is needed because the legacy `repair_diagnostic_reports` endpoint
belongs to `repairs`, not production `jobs`; no corresponding table creation
exists in this repository. The live database could not be inspected through the
connected account: its project listing contains only the bowls and darts
projects. Do not assume that this migration has been applied.

Before migration, customer pages continue normally with no publications, and
staff can save the existing private findings field. Structured sections and
publishing remain disabled with a clear setup message. After migration these
features become available without another application deployment.

## Verification

`tests/diagnostic-reports.test.ts` executes the real migration and transaction
function in PGlite PostgreSQL. Next.js route handlers use a SQL-backed Supabase
transport adapter; staff authentication and rate limiting are mocked. Its 21
cases cover an unrepairable Steam Deck OLED, private draft saves, immediate
publication, complete report contents, PDF bytes/A4 pagination, all terminal
and reopened statuses, expired normal tracking, latest/previous publications,
cross-repair denial, direct database permission denial, transaction rollback,
legacy published reports, expired magic-link authentication, and migration
fallback. No customer records are created or edited in production.

The dedicated tests plus public-route-security tests pass (65 tests), as do
TypeScript, lint and a production build with placeholder environment values.
A generated four-page A4 report was rendered and visually inspected, including
its final conclusion/recommendation/outcome sections. Embedded fonts ensure
consistent output and support common technical symbols. Downloads use same-origin
fetch, PDF blobs and standard download links; physical Android/iPhone testing
and a production staff/customer smoke test remain outstanding.

The unchanged main baseline has 17 failing tests (375 passing): 13 missed-call
mock failures, 2 enquiry assertion failures, 1 route assertion failure and 1
stale dependency assertion in build.test.ts. These failures predate this change.
The diagnostic suite is included in repair-flow CI.
