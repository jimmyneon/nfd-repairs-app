# Quote and payment flow recheck — 14 October 2026

The Need Parts payment-link release is live, but the complete quote/payment
reorganisation is not yet live. This audit compares current main, public website
assets, production schema/templates and mocked application handlers. No customer
message, card charge, Klarna purchase or refund was sent.

## Confirmed and corrected in this follow-up

| Stage | Finding and correction |
| --- | --- |
| Price catalogue | Live canonical JSON has 8,850 unique quote keys; retired overrides contain no rules or added rows. |
| Need Parts SMS/email | Repair-specific website link and deposit/full card or eligible Klarna choices are present. |
| Automatic status replies | Collection, turnaround, done-check and update replies still used SumUp. They now share repair-specific payment text and stop asking when payment is recorded. |
| Public tracking | Legacy reassurance text contained SumUp. Tracking now links to this repair's payment page and recognises recorded payment. |
| Deposit receipt | Template claimed parts were already ordered and its tracking variable was not populated by the webhook. Corrected wording and tracking URL. Ordering remains an explicit staff action. |
| In-shop deposit | Staff-marked deposits had no payments row and the online page charged the whole total again. The due, checkout and payment-link calculations now credit the recorded deposit without double-counting an online deposit. A live read-only sample reproduced the old error before release. |
| Unknown price / cancellation | A zero/unconfirmed total could look fully paid or still permit a deposit; cancelled repairs could be charged. Both are blocked, with a clear website explanation. |
| Provider confirmation | Only settled sessions fulfil payment. Delayed successful payments are handled. Paid webhook redelivery can repair failed job flag updates. |

## Still incomplete — do not describe the whole journey as verified

1. **Versioned quote and payment ledger:** production has no quote_version,
   quote_snapshot or price_verified columns, nor the new refund/outbox schema.
   Prepared app PR #29 and website PR #39 remain drafts. Automatic approval
   review previously rejected the broad production migration; it was not applied.
2. **Concurrent or old checkout links:** deposit and full-payment sessions can
   coexist; reused sessions are not tied to a quote version/current amount.
   Atomic payment reservations and invalidation remain in the pending redesign.
3. **Refunds:** legacy refund handling does not provide the prepared net ledger
   or reliable job-flag reconciliation, including partial refunds.
4. **Savings flow:** legacy funds require a mobile number, can use the primary
   quote rather than all selected extras, and need atomic top-up/redemption and
   verified-price handling. Quote changes and unknown-price journeys remain
   incomplete. No successful live fund payment exists in the inspected ledger.
5. **Earlier enquiry payments:** legacy enquiry full-payment calculations use
   the primary repair price; conversion does not fully carry prepayment state.
   No currently unconverted paid enquiry was found, but the path needs the
   pending redesign before it is promoted.
6. **Receipts and reliable delivery:** full-payment and email-only receipts,
   retryable message delivery and staff readiness controls need the pending
   outbox/workflow implementation. Deposit payment must not imply an order
   has actually been placed.
7. **Provider/account verification:** live Stripe payment-method configuration,
   webhook subscriptions, actual Klarna eligibility, purchases and refunds have
   not been exercised. Passing handler simulations is not a live purchase test.

## Validation

- Real conversion/email and payment-handler tests use isolated mocks.
- Scenarios include deposit, full payment, in-shop deposit plus online balance,
  capped deposit, delayed payment, failed update/redelivery, unknown price,
  cancellation, unreadable payment history and receipt tracking.
- Website script simulations cover both buttons, balance, paid state, bad link
  and unavailable payment.
- TypeScript and production build are checked before release.
- The broader suite has 17 existing failures in missed-call mocks, two enquiry
  workflow source assertions, an auth-import assertion and a lint configuration
  assertion; these are not counted as passing.

Pending redesign:
- https://github.com/jimmyneon/nfd-repairs-app/pull/29
- https://github.com/jimmyneon/nfdr/pull/39
- https://github.com/jimmyneon/nfd-repairs-app/blob/52614adcccd21bd290e96f8aae87d7c3ed2a7494/supabase/migrations/20261014101437_quote_payment_journey.sql
