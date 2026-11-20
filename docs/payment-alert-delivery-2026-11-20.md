# Staff alerts for online payments

The 20 November £75 repair payment was paid in the ledger and had an unread
`PAYMENT` notification, but no phone alert reached the owner. The configured
central NF Hub `/api/send` endpoint returned HTTP 500 during a controlled test.
The webhook previously ignored HTTP errors and Supabase insert errors, then
skipped notifications on Stripe redelivery because the payment was already paid.

Payment alerts now check the notification service's response, including whether
any device received the message. If NF Hub fails, they use the existing
MacroDroid **staff notification** webhook, which accepted a live request with
HTTP 200 / `OK`. Its body must be a bare deep link because the phone macro opens
the request body as a URL. The title and message are passed separately as
`nfdr_payment_title` and `nfdr_payment_message` URL parameters, correctly encoded.
To display these on the phone, define matching string variables in MacroDroid
and select them in the notification action's title and message fields. If a
variable whitelist is enabled on the trigger, allow these two variables.
The app cannot remotely change the phone macro; until it is updated, the macro
retains its existing wording. Keep the existing tap action using the POST body.
If this macro also handles non-payment alerts, only use the payment variables
for payment requests and reset them after use to avoid showing stale text.

The payment UUID is also the bell notification UUID, making insertion safe to
repeat without resetting read state. After a delivery service accepts the alert,
`payments.metadata.staff_alert_sent_at` and `staff_alert_channel` record that
acknowledgement while preserving existing metadata. A paid Stripe redelivery
retries an unacknowledged alert. If both channels fail, the webhook returns 500
so Stripe can retry; it does not reverse the paid status or repeat fund credits.
As with most push services, acceptance is not proof of display on the handset.

The NF Hub server error itself needs investigation using that service's runtime
logs and configuration. There was no signed-in hosting session available during
this repair. No authentication was weakened. The old database-triggered web push
request also returned 401, and there were no browser push subscriptions; the
payment fallback therefore does not depend on that route.

Validation: 38 targeted payment/delivery tests and TypeScript checking passed.
Tests cover NF Hub errors/timeouts/zero deliveries, the raw-URL fallback,
both-channel failure, database errors, preserving metadata, skipping acknowledged
redeliveries, and retrying notification failures after the payment is already paid.
