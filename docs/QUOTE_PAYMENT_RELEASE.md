# Quote, parts confirmation and payment release

This is coordinated website/app work. Do not merge/deploy either change or apply the migration until approved. Website work stacks on nfdr PR #38; retain that existing consolidation.

## Behaviour
- Start repair without paying; exact quality, colour, extra repairs/accessories and complete total are retained.
- Staff confirms price, availability, deposit and expected timing once. Unchanged accepted details do not require another approval; changed price, part or scope needs current-version acceptance.
- One secure website repair link offers drop-off, £20 ordering deposit deducted from balance, full outstanding card payment, savings and timing/question/cancellation responses.
- Cash/card on collection remains normal. Full captured payment satisfies the deposit. Payment makes parts ready to order; only staff's actual order action sets parts ordered.
- All shop money, online receipts, source-enquiry payments and allocated savings share net coverage. Receipt processing and refund recalculation are transactional. Refunds pending/failed/succeeded are distinguished.
- Saving starts with a priced quote; no-price requests need a personalised price first. Savings do not reserve stock/freeze prices. Staff reconfirms parts/current price before allocation. Card-only top-ups; email-only customers supported.
- Ignored ordering confirmations get one daytime reminder. No parts are automatically ordered. Cancellation requests suspend acceptance and notify staff; refund/order review remains explicit.

## Release prerequisites
1. Review website pricing PR #38 and website journey PR, plus this app PR. Confirm the website JSON includes accessory prices and discount policy.
2. Configure STAFF_EMAILS for authorised staff, or trusted app_metadata.role staff/admin/owner. Authentication alone no longer permits money actions. Never use user_metadata for roles.
3. Review/apply `20261014101437_quote_payment_journey.sql` in an isolated staging database first. It requires the existing payments/fund migrations. A recorded online/refunded receipt prevents synthetic legacy deposit backfill; old refunded rows contribute no repair credit until provider reconciliation confirms the real net refund; ambiguous history requires receipt review. Inspect duplicate active funds before adding the unique index. The migration preserves explicit historical deposits with recorded amount/receipt time; unexplained fully-paid flags require staff reconciliation against receipts before collection. No paid amount is invented from an unexplained full-paid flag.
4. Configure Stripe secret/webhook keys in the correct environment. Subscribe the webhook to completed/async completed/expired Checkout, PaymentIntent succeeded, charge refunded and refund lifecycle events. Run the reconciliation route every ten minutes; verify the Vercel plan supports that cron frequency or use the existing authenticated external scheduler. Notification outbox attempts are bounded and failures remain visible in the database.
5. Klarna advance capture is disabled by default. Card payments are captured upfront. Klarna is available on full outstanding payments at repair completion, or before completion ONLY if `KLARNA_ADVANCE_CAPTURE_APPROVED=true` after Stripe/Klarna confirms that capture timing is suitable for this repair service. Do not assume account/customer eligibility. Deposits and funds are card-only; no manual-authorisation feature is enabled.
6. Set `DISABLE_CUSTOMER_MESSAGES=true` for all staging/provider tests. Use a separate test database and Stripe test keys; never copy live customer records. Vercel automatic deployments of this review branch are explicitly disabled in vercel.json; main remains unchanged.
7. Coordinate the migration, published canonical JSON and both applications; incompatible old cached pages must not regain payment access. The app fails closed if confirmation/acceptance or required schema is missing.

## Verification
Website canonical catalogue equality (8,850 raw / 8,319 visible rows), 37 quote-system checks and search regression pass. App TypeScript passes. Next production build passes with inert Supabase placeholder settings and messages disabled; this is build verification, not production configuration or provider settlement.

The new/updated targeted suites exercise real SQL transactions using isolated PGlite/Postgres plus mocked Stripe/notification services. Customer HTML rendering uses jsdom and mocked API payloads from the actual paired website checkout. Check out website beside app as `../site`, or set NFD_SITE_TEST_ROOT, to run customer-pages tests. That cross-repository suite runs locally and in the new coordinated workflow. CI checks out the paired website branch; an explicitly configured but missing website fails verification.

The full existing app suite has known baseline failures in missed-call mocks, a check-status source assertion and ignored-ESLint build assertion. Baseline snapshot independently rerun: 336 pass / 18 fail. Current full suite: 348 pass / 15 fail; all 15 remaining failures also fail in the baseline. Targeted journey/repair-flow suites: 115 passed, including the final migration-backfill regression; no new journey failures are accepted. Superseded source-only conversion checks were replaced by actual handler/transaction tests.

No genuine Stripe payment, Klarna purchase, provider refund or SMS/email delivery has been performed: test credentials and an isolated provider environment are unavailable. Existing test-payments-e2e.mjs synthesises completed events; do not count it as provider end-to-end.

Before release, complete provider test-mode card success/decline/3DS, eligible/ineligible Klarna, deposit then balance, full payment then conversion, stale/revised sessions, two-tab deposit/full races, shop deposit, payment during conversion, missing/duplicate/out-of-order webhooks, database outage then recovery, pending/failed/partial/full refunds, fund top-up/allocation/refund concurrency, email-only messages and collection with cash/card. Check one total/net paid/outstanding balance and truthful order state across every screen. Verify dashboard refund/recovery fallback and no test messages reach customers.

## Operational recovery
Staff can view the job's payment ledger or `/app/payments` for savings before job creation. Stripe Dashboard remains authoritative if app actions fail. The reconciliation endpoint retrieves actual provider sessions/refunds and can recover a Checkout created before its session ID was saved. Staff can close an unpaid provider checkout before recording shop cash/card; processing payments retain their reservation until reconciled. No success URL/query string alone marks paid. Required-payment checks use money, not manually toggled flags.

SQL financial functions are invoker/service-role only. The jobs guard is a SECURITY DEFINER trigger (fixed empty search_path, no callable public/authenticated execution grant) solely so an already-authorised job update can derive coverage without granting clients payment-table access. It never grants access to a job row and cannot be called as a public RPC.
