-- SMS Templates v3 - Concise, friendly, and customer-safe
-- Key changes:
-- - Uses {first_name} (falls back to "there" in code if missing)
-- - Uses {device_model} only (no "Apple iPhone 12" style duplication)
-- - Simple, friendly, non-overly-British tone
-- - Consistent sign-off on customer-facing messages
-- - Opening-hours reminder on ready-to-collect messages
-- Run this in Supabase SQL Editor to update all templates

-- RECEIVED - Device booked in (device is in the shop)
UPDATE sms_templates SET body =
'Hi {first_name}, your {device_model} is now booked in with us. If you would like to check what''s happening with it, please use this link below.

{tracking_link}

We''ll update you as soon as possible.

Many thanks,
New Forest Device Repairs'
WHERE key = 'RECEIVED';

-- QUOTE_APPROVED - Quote approved, customer needs to drop off
UPDATE sms_templates SET body =
'Hi {first_name}, your {device_model} repair is all approved. To book it in, please use this link below.

{onboarding_link}

We''ll update you as soon as possible.

Many thanks,
New Forest Device Repairs'
WHERE key = 'QUOTE_APPROVED';

-- ONBOARDING_WITH_DEPOSIT - Need booking completed + deposit
UPDATE sms_templates SET body =
'Hi {first_name}, your {device_model} repair is all approved. To book it in and pay the £{deposit_amount} deposit, please use this link below.

{onboarding_link}

Deposit: {deposit_link}

We''ll update you as soon as possible.

Many thanks,
New Forest Device Repairs'
WHERE key = 'ONBOARDING_WITH_DEPOSIT';

-- ONBOARDING_REQUIRED - Need more details
UPDATE sms_templates SET body =
'Hi {first_name}, your {device_model} repair is all approved. To book it in, we just need a few quick details. Please use this link below.

{onboarding_link}

We''ll update you as soon as possible.

Many thanks,
New Forest Device Repairs'
WHERE key = 'ONBOARDING_REQUIRED';

-- DEPOSIT_REQUIRED / AWAITING_DEPOSIT - Need deposit for parts
UPDATE sms_templates SET body =
'Hi {first_name}, we need to order parts for your {device_model}. To pay the £{deposit_amount} deposit and get that started, please use this link below.

{deposit_link}

If you would like to check what''s happening with it, please use this link below.

{tracking_link}

We''ll update you as soon as possible.

Many thanks,
New Forest Device Repairs'
WHERE key = 'DEPOSIT_REQUIRED' OR key = 'AWAITING_DEPOSIT';

-- DEPOSIT_RECEIVED - Deposit paid, parts being ordered
UPDATE sms_templates SET body =
'Hi {first_name}, your £{deposit_amount} deposit for your {device_model} has been received. Parts are on order and we''ll let you know when they arrive.

If you would like to check what''s happening with it, please use this link below.

{tracking_link}

We''ll update you as soon as possible.

Many thanks,
New Forest Device Repairs'
WHERE key = 'DEPOSIT_RECEIVED';

-- PARTS_ORDERED - Parts have been ordered
UPDATE sms_templates SET body =
'Hi {first_name}, parts for your {device_model} are on order. We''ll be in touch as soon as they arrive.

If you would like to check what''s happening with it, please use this link below.

{tracking_link}

We''ll update you as soon as possible.

Many thanks,
New Forest Device Repairs'
WHERE key = 'PARTS_ORDERED';

-- PARTS_ARRIVED - Parts arrived, bring device in
UPDATE sms_templates SET body =
'Hi {first_name}, good news — parts for your {device_model} have arrived. Please drop your device in whenever works for you.

Find us: {google_maps_link}

We''ll update you as soon as possible.

Many thanks,
New Forest Device Repairs'
WHERE key = 'PARTS_ARRIVED';

-- IN_REPAIR - Repair in progress
UPDATE sms_templates SET body =
'Hi {first_name}, your {device_model} is now being repaired. We''ll update you as soon as it''s ready.

If you would like to check what''s happening with it, please use this link below.

{tracking_link}

Many thanks,
New Forest Device Repairs'
WHERE key = 'IN_REPAIR';

-- COMPLETED - Repair complete (internal status, no SMS needed)
-- This is a backend status used after collection. No customer SMS.
UPDATE sms_templates SET body =
'Hi {first_name}, your {device_model} is all repaired and ready to go. If you notice any issues, just let us know.

Many thanks,
New Forest Device Repairs'
WHERE key = 'COMPLETED';

-- READY_TO_COLLECT - Ready for pickup (no price lines — price already communicated)
UPDATE sms_templates SET body =
'Hi {first_name}, great news — your {device_model} is all repaired and ready to collect.

Please check our opening times before popping in:
{hours_link}

Many thanks,
New Forest Device Repairs'
WHERE key = 'READY_TO_COLLECT';

-- QUOTE_REMINDER - Gentle, polite nudge to proceed (price line stripped if £0)
UPDATE sms_templates SET body =
'Hi {first_name}, just following up — would you like to go ahead with the repair for your {device_model}?
The quoted price is £{price_total}.

No rush at all, just let us know either way.

Track your repair: {tracking_link}

Many thanks,
New Forest Device Repairs'
WHERE key = 'QUOTE_REMINDER';

-- CANCELLED - Job cancelled
UPDATE sms_templates SET body =
'Hi {first_name}, your {device_model} repair has been cancelled. If you have any questions, just let us know.

Many thanks,
New Forest Device Repairs'
WHERE key = 'CANCELLED';

-- DELAYED - Repair delayed
UPDATE sms_templates SET body =
'Hi {first_name}, there''s a slight delay with your {device_model} repair — sorry about that.

{delay_reason} {delay_notes}

We''ll update you as soon as things are moving again.

If you would like to check what''s happening with it, please use this link below.

{tracking_link}

Many thanks,
New Forest Device Repairs'
WHERE key = 'DELAYED' OR key = 'DELAY_NOTIFICATION';

-- DEPOSIT_REQUEST - Sent when staff manually sends deposit request from job card
-- Uses {deposit_link} (SumUp payment link) and {deposit_amount}
INSERT INTO sms_templates (key, body, is_active)
SELECT 'DEPOSIT_REQUEST',
'Hi {first_name}, we need to order parts for your {device_model}. To pay the £{deposit_amount} deposit and get that started, please use this link below.

{deposit_link}

If you would like to check what''s happening with it, please use this link below.

{tracking_link}

Many thanks,
New Forest Device Repairs', true
WHERE NOT EXISTS (SELECT 1 FROM sms_templates WHERE key = 'DEPOSIT_REQUEST');

-- Update if already exists
UPDATE sms_templates SET body =
'Hi {first_name}, we need to order parts for your {device_model}. To pay the £{deposit_amount} deposit and get that started, please use this link below.

{deposit_link}

If you would like to check what''s happening with it, please use this link below.

{tracking_link}

Many thanks,
New Forest Device Repairs'
WHERE key = 'DEPOSIT_REQUEST';

-- COLLECTED template removed — post-collection aftercare SMS is sent separately
-- via /api/jobs/send-collection-sms (delayed, aftercare-first with review link)
DELETE FROM sms_templates WHERE key = 'COLLECTED';

-- POST_COLLECTION_REVIEW - Sent shortly after collection
-- Uses {review_link} which is populated from admin_settings.google_review_link
INSERT INTO sms_templates (key, body, is_active)
SELECT 'POST_COLLECTION_REVIEW',
'Hi {first_name}, thanks for choosing New Forest Device Repairs. If you''re happy with your {device_model} repair, we''d really appreciate a quick Google review:

{review_link}

If anything isn''t quite right, just reply to this message and we''ll do our best to put it right.

– New Forest Device Repairs', true
WHERE NOT EXISTS (SELECT 1 FROM sms_templates WHERE key = 'POST_COLLECTION_REVIEW');

-- Update if already exists
UPDATE sms_templates SET body =
'Hi {first_name}, thanks for choosing New Forest Device Repairs. If you''re happy with your {device_model} repair, we''d really appreciate a quick Google review:

{review_link}

If anything isn''t quite right, just reply to this message and we''ll do our best to put it right.

– New Forest Device Repairs'
WHERE key = 'POST_COLLECTION_REVIEW';

-- AFTERCARE_CHECKIN - Sent 3-5 days after collection (simple check-in, no review link)
-- Only sent if customer hasn't replied or left a review
INSERT INTO sms_templates (key, body, is_active)
SELECT 'AFTERCARE_CHECKIN',
'Hi {first_name}, just checking in to make sure your {device_model} is working as expected.

If you''ve had any issues at all, just reply to this message and we''ll do our best to put it right.

Thanks, New Forest Device Repairs', true
WHERE NOT EXISTS (SELECT 1 FROM sms_templates WHERE key = 'AFTERCARE_CHECKIN');

-- Update if already exists
UPDATE sms_templates SET body =
'Hi {first_name}, just checking in to make sure your {device_model} is working as expected.

If you''ve had any issues at all, just reply to this message and we''ll do our best to put it right.

Thanks, New Forest Device Repairs'
WHERE key = 'AFTERCARE_CHECKIN';

-- Ensure all templates are active
UPDATE sms_templates SET is_active = true WHERE key IN (
  'RECEIVED', 'QUOTE_APPROVED', 'ONBOARDING_WITH_DEPOSIT', 'ONBOARDING_REQUIRED',
  'DEPOSIT_REQUIRED', 'AWAITING_DEPOSIT', 'DEPOSIT_RECEIVED', 'PARTS_ORDERED',
  'PARTS_ARRIVED', 'IN_REPAIR', 'COMPLETED', 'READY_TO_COLLECT',
  'QUOTE_REMINDER', 'CANCELLED', 'DELAYED', 'DELAY_NOTIFICATION',
  'DEPOSIT_REQUEST',
  'POST_COLLECTION_REVIEW', 'AFTERCARE_CHECKIN'
);
