# £10 Repair Reservation — SumUp test plan

This is a separate commitment tier from both **Remind Me Later (£0)** and the existing **special-order-parts deposit** workflow.

The intended customer promise is simple: the reservation amount is credited to the final repair bill. If the customer cancels before repair work starts, the generic reservation can be refunded. Special-order-part exposure is handled separately and explicitly.

## Production safety

- Do not merge this branch until the Quote V2 reminder dependency is ready.
- Rebase the stacked branches onto the latest app `main` before final test/merge.
- Never commit `SUMUP_API_KEY` or other payment credentials.
- Configure credentials only in the deployment environment.
- Use a SumUp sandbox/test merchant where available for integration testing.
- Do not expose the paid button on the production website until a controlled checkout, webhook and refund have all been tested.

## Required configuration

- `SUMUP_API_KEY`
- `SUMUP_MERCHANT_CODE`
- optional `REPAIR_RESERVATION_AMOUNT` (defaults to 10)
- `NEXT_PUBLIC_WEBSITE_URL`
- existing `NEXT_PUBLIC_APP_URL`
- existing `MACRODROID_WEBHOOK_URL`

## Database migration

Apply `supabase/add-paid-reservations.sql` and confirm the new fields and unique indexes exist before deploying payment endpoints.

## Checkout creation

1. Use a known test repair enquiry with a valid server-verified quote.
2. Call `/api/enquiries/create-reservation-checkout` with `terms_accepted: true`.
3. Confirm SumUp creates a GBP hosted checkout for the server-configured amount (normally £10).
4. Confirm the browser cannot alter the amount by sending another value in the request.
5. Confirm the enquiry records:
   - checkout id
   - merchant checkout reference
   - amount
   - payment status
   - terms accepted timestamp/version
6. Call checkout creation again before payment and confirm the existing pending checkout is reused rather than creating a duplicate.
7. Confirm dismissed or already-converted enquiries cannot create a new reservation.

## Successful payment/webhook

1. Complete the test hosted checkout.
2. Confirm SumUp sends `CHECKOUT_STATUS_CHANGED` to the return/webhook URL.
3. Confirm our webhook re-fetches the checkout from SumUp before trusting it.
4. Confirm merchant code, checkout reference, GBP currency and exact amount are all verified.
5. Confirm only a verified `PAID` checkout changes the enquiry to:
   - `reservation_payment_status = PAID`
   - `commitment_type = paid_reservation`
   - `proceed_with_repair = true`
   - `status = approved`
6. Confirm any outstanding free reminder is cancelled.
7. Confirm one customer confirmation SMS is sent and one staff notification is created.
8. Replay the webhook and confirm no duplicate SMS/notification is generated.

## Negative payment cases

- PENDING checkout must not approve the repair.
- FAILED checkout must not approve the repair.
- EXPIRED checkout must not approve the repair.
- Wrong merchant must be rejected.
- Wrong checkout reference must be rejected.
- Wrong amount or non-GBP currency must be rejected.
- Unknown webhook event types should be ignored with a 2xx response.

## Refund test

Before public launch, add/verify the staff-only refund action and perform one full test refund. Confirm:

- transaction id is obtained from the verified SumUp checkout
- refund request is made server-side only
- local reservation status is changed only after SumUp accepts the refund
- staff can see that the reservation was refunded
- customer receives a clear confirmation
- a refunded reservation no longer counts as an approved/paid commitment unless they subsequently proceed again

## Customer wording check

Before exposing the paid option, customer-facing text must clearly say:

- the exact amount (normally £10)
- it comes off the final repair bill
- it is a repair reservation, not a guarantee that a particular part is in stock
- parts availability is checked after payment
- the generic reservation can be cancelled/refunded before repair work starts
- any special-order-part deposit is a separate decision explained before parts are ordered

## Final go-live sequence

1. Rebase onto latest `main`.
2. Vercel preview/build passes.
3. Apply database migrations.
4. Configure SumUp credentials securely.
5. Test checkout creation.
6. Test successful webhook verification.
7. Test failed/expired paths.
8. Test full refund.
9. Test customer/staff SMS and notifications.
10. Only then add the £10 button to the Quote V2 website branch.
