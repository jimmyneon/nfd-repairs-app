-- Fix: Replace {device_model} with {device_summary} in all SMS templates
-- so customers never see "your To be added is now booked in with us".
--
-- {device_summary} is a sanitised variable: when device details aren't known
-- yet (quick intake / finish later), it renders as "device" instead of
-- "To be added" or "Unknown". When details ARE known, it renders as
-- "{make} {model}" (e.g. "Apple iPhone 12").
--
-- The code-side fix (safeDeviceLabel in lib/sms-template.ts) also sanitises
-- {device_model} directly, but updating the templates to use {device_summary}
-- makes the intent explicit and keeps templates self-documenting.

-- QUICK_INTAKE - already uses "your device" (generic), but ensure DB matches
UPDATE sms_templates SET body =
'Hi {first_name}, your device is now booked in with us. We just need a few more details — please use this link to complete your check-in:

{tracking_link}

We''ll update you as soon as possible.

Many thanks,
New Forest Device Repairs'
WHERE key = 'QUICK_INTAKE';

-- RECEIVED - Device booked in (device is in the shop)
UPDATE sms_templates SET body =
'Hi {first_name}, your {device_summary} is now booked in with us. If you would like to check what''s happening with it, please use this link below.

{tracking_link}

We''ll update you as soon as possible.

Many thanks,
New Forest Device Repairs'
WHERE key = 'RECEIVED';

-- QUOTE_APPROVED - Quote approved, customer needs to drop off
UPDATE sms_templates SET body =
'Hi {first_name}, your {device_summary} repair is all approved. To book it in, please use this link below.

{onboarding_link}

We''ll update you as soon as possible.

Many thanks,
New Forest Device Repairs'
WHERE key = 'QUOTE_APPROVED';

-- ONBOARDING_WITH_DEPOSIT - Need booking completed + deposit
UPDATE sms_templates SET body =
'Hi {first_name}, your {device_summary} repair is all approved. To book it in and pay the £{deposit_amount} deposit, please use this link below.

{onboarding_link}

Deposit: {deposit_link}

We''ll update you as soon as possible.

Many thanks,
New Forest Device Repairs'
WHERE key = 'ONBOARDING_WITH_DEPOSIT';

-- ONBOARDING_REQUIRED - Need more details
UPDATE sms_templates SET body =
'Hi {first_name}, your {device_summary} repair is all approved. To book it in, we just need a few quick details. Please use this link below.

{onboarding_link}

We''ll update you as soon as possible.

Many thanks,
New Forest Device Repairs'
WHERE key = 'ONBOARDING_REQUIRED';

-- DEPOSIT_REQUIRED / AWAITING_DEPOSIT - Need deposit for parts
UPDATE sms_templates SET body =
'Hi {first_name}, we need to order parts for your {device_summary}. To pay the £{deposit_amount} deposit and get that started, please use this link below.

{deposit_link}

If you would like to check what''s happening with it, please use this link below.

{tracking_link}

We''ll update you as soon as possible.

Many thanks,
New Forest Device Repairs'
WHERE key IN ('DEPOSIT_REQUIRED', 'AWAITING_DEPOSIT');

-- DEPOSIT_RECEIVED - Deposit paid, parts being ordered
UPDATE sms_templates SET body =
'Hi {first_name}, your £{deposit_amount} deposit for your {device_summary} has been received. Parts are on order and we''ll let you know when they arrive.

If you would like to check what''s happening with it, please use this link below.

{tracking_link}

We''ll update you as soon as possible.

Many thanks,
New Forest Device Repairs'
WHERE key = 'DEPOSIT_RECEIVED';

-- PARTS_ORDERED - Parts have been ordered
UPDATE sms_templates SET body =
'Hi {first_name}, parts for your {device_summary} are on order. We''ll be in touch as soon as they arrive.

If you would like to check what''s happening with it, please use this link below.

{tracking_link}

We''ll update you as soon as possible.

Many thanks,
New Forest Device Repairs'
WHERE key = 'PARTS_ORDERED';

-- PARTS_ARRIVED - Parts arrived, bring device in
UPDATE sms_templates SET body =
'Hi {first_name}, good news — parts for your {device_summary} have arrived. Please drop your device in whenever works for you.

Find us: {google_maps_link}

We''ll update you as soon as possible.

Many thanks,
New Forest Device Repairs'
WHERE key = 'PARTS_ARRIVED';

-- IN_REPAIR - Repair in progress
UPDATE sms_templates SET body =
'Hi {first_name}, your {device_summary} is now being repaired. We''ll update you as soon as it''s ready.

If you would like to check what''s happening with it, please use this link below.

{tracking_link}

Many thanks,
New Forest Device Repairs'
WHERE key = 'IN_REPAIR';

-- COMPLETED - Repair complete (internal status, no SMS needed)
UPDATE sms_templates SET body =
'Hi {first_name}, your {device_summary} is all repaired and ready to go. If you notice any issues, just let us know.

Many thanks,
New Forest Device Repairs'
WHERE key = 'COMPLETED';

-- READY_TO_COLLECT - Ready for pickup
UPDATE sms_templates SET body =
'Hi {first_name}, great news — your {device_summary} is all repaired and ready to collect.

Please check our opening times before setting off:
{hours_link}

Many thanks,
New Forest Device Repairs'
WHERE key = 'READY_TO_COLLECT';

-- QUOTE_REMINDER - Gentle, polite nudge to proceed
UPDATE sms_templates SET body =
'Hi {first_name}, just following up — would you like to go ahead with the repair for your {device_summary}?
The quoted price is £{price_total}.

No rush at all, just let us know either way.

Track your repair: {tracking_link}

Many thanks,
New Forest Device Repairs'
WHERE key = 'QUOTE_REMINDER';

-- CANCELLED - Job cancelled
UPDATE sms_templates SET body =
'Hi {first_name}, your {device_summary} repair has been cancelled. If you have any questions, just let us know.

Many thanks,
New Forest Device Repairs'
WHERE key = 'CANCELLED';

-- DELAYED - Repair delayed
UPDATE sms_templates SET body =
'Hi {first_name}, there''s a slight delay with your {device_summary} repair — sorry about that.

{delay_reason} {delay_notes}

We''ll update you as soon as things are moving again.

If you would like to check what''s happening with it, please use this link below.

{tracking_link}

Many thanks,
New Forest Device Repairs'
WHERE key IN ('DELAYED', 'DELAY_NOTIFICATION');

-- DEPOSIT_REQUEST - Sent when staff manually sends deposit request
UPDATE sms_templates SET body =
'Hi {first_name}, we need to order parts for your {device_summary}. To pay the £{deposit_amount} deposit and get that started, please use this link below.

{deposit_link}

If you would like to check what''s happening with it, please use this link below.

{tracking_link}

Many thanks,
New Forest Device Repairs'
WHERE key = 'DEPOSIT_REQUEST';

-- POST_COLLECTION_REVIEW
UPDATE sms_templates SET body =
'Hi {first_name}, hope you''re happy with your {device_summary} repair!

If so, a 5-star Google review would mean the world to our small business →
{review_link}

(Takes 60 seconds — just tap the link above)

If anything''s not right, just reply here.

– New Forest Device Repairs'
WHERE key = 'POST_COLLECTION_REVIEW';

-- AFTERCARE_CHECKIN
UPDATE sms_templates SET body =
'Hi {first_name}, just checking in — how''s your {device_summary} getting on? Any issues at all, just reply here and we''ll sort it.

If you''re happy with the repair, a quick review really helps us →
{review_link}

New Forest Device Repairs'
WHERE key = 'AFTERCARE_CHECKIN';

-- RECEIVED_WITH_PARTS - Device booked in and parts need ordering
UPDATE sms_templates SET body =
'Hi {first_name}, your {device_summary} is now booked in with us. We need to order parts for this repair and will be in touch once they arrive.

If you would like to check what''s happening with it, please use this link below.

{tracking_link}

We''ll update you as soon as possible.

Many thanks,
New Forest Device Repairs'
WHERE key = 'RECEIVED_WITH_PARTS';

-- Ensure all templates are active
UPDATE sms_templates SET is_active = true WHERE key IN (
  'QUICK_INTAKE', 'RECEIVED', 'RECEIVED_WITH_PARTS', 'QUOTE_APPROVED',
  'ONBOARDING_WITH_DEPOSIT', 'ONBOARDING_REQUIRED',
  'DEPOSIT_REQUIRED', 'AWAITING_DEPOSIT', 'DEPOSIT_RECEIVED', 'PARTS_ORDERED',
  'PARTS_ARRIVED', 'IN_REPAIR', 'COMPLETED', 'READY_TO_COLLECT',
  'QUOTE_REMINDER', 'CANCELLED', 'DELAYED', 'DELAY_NOTIFICATION',
  'DEPOSIT_REQUEST', 'POST_COLLECTION_REVIEW', 'AFTERCARE_CHECKIN'
);
