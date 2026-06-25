-- SMS Templates v3 - Refined for brevity, consistency, and brand voice
-- Key changes from v2:
-- - Shorter messages (closer to single SMS segment where possible)
-- - Consistent sign-off (only on messages that need it)
-- - More natural, conversational tone
-- - Tracking link included only where it adds value
-- - Maps link only when customer needs to travel
-- - Removed redundant "New Forest Device Repairs" sign-offs from short messages
--   (the tracking page and caller ID already establish brand)
-- Run this in Supabase SQL Editor to update all templates

-- RECEIVED - Device booked in (device is in the shop)
UPDATE sms_templates SET body =
'Hi {first_name}, your {device_make} {device_model} is booked in with us. We''ll get it sorted as soon as we can.

Track progress: {tracking_link}'
WHERE key = 'RECEIVED';

-- QUOTE_APPROVED - Quote approved, customer needs to drop off
UPDATE sms_templates SET body =
'Hi {first_name}, your quote for the {device_make} {device_model} (£{price_total}) is all approved.

Drop it in whenever you''re ready:
{google_maps_link}'
WHERE key = 'QUOTE_APPROVED';

-- ONBOARDING_WITH_DEPOSIT - Need booking completed + deposit
UPDATE sms_templates SET body =
'Hi {first_name}, to get started on your {device_make} {device_model} we just need the booking completed and the deposit.

Booking: {onboarding_link}
Deposit: £{deposit_amount}'
WHERE key = 'ONBOARDING_WITH_DEPOSIT';

-- ONBOARDING_REQUIRED - Need more details
UPDATE sms_templates SET body =
'Hi {first_name}, we just need a few quick details to book in your {device_make} {device_model} repair.

Takes a minute: {onboarding_link}'
WHERE key = 'ONBOARDING_REQUIRED';

-- DEPOSIT_REQUIRED / AWAITING_DEPOSIT - Need deposit for parts
UPDATE sms_templates SET body =
'Hi {first_name}, we need to order parts for your {device_make} {device_model}. A £{deposit_amount} deposit gets that started.

Pay here: {deposit_link}

Track: {tracking_link}'
WHERE key = 'DEPOSIT_REQUIRED' OR key = 'AWAITING_DEPOSIT';

-- DEPOSIT_RECEIVED - Deposit paid, parts being ordered
UPDATE sms_templates SET body =
'Got your £{deposit_amount} deposit, thanks {first_name}! Parts for your {device_make} {device_model} are being ordered now. We''ll let you know when they arrive.

Track: {tracking_link}'
WHERE key = 'DEPOSIT_RECEIVED';

-- PARTS_ORDERED - Parts have been ordered
UPDATE sms_templates SET body =
'Hi {first_name}, parts for your {device_make} {device_model} are on order. We''ll be in touch as soon as they arrive.

Track: {tracking_link}'
WHERE key = 'PARTS_ORDERED';

-- PARTS_ARRIVED - Parts arrived, bring device in
UPDATE sms_templates SET body =
'Hi {first_name}, good news — parts for your {device_make} {device_model} have arrived. Drop your device in whenever suits you.

Find us: {google_maps_link}'
WHERE key = 'PARTS_ARRIVED';

-- IN_REPAIR - Repair in progress
UPDATE sms_templates SET body =
'Hi {first_name}, your {device_make} {device_model} is being repaired now. We''ll message you when it''s ready.

Track: {tracking_link}'
WHERE key = 'IN_REPAIR';

-- COMPLETED - Repair complete (internal status, no SMS needed)
-- This is a backend status used after collection. No customer SMS.
UPDATE sms_templates SET body =
'Hi {first_name}, your {device_make} {device_model} is all repaired and ready to go. If you spot any issues, just give us a shout.'
WHERE key = 'COMPLETED';

-- READY_TO_COLLECT - Ready for pickup
UPDATE sms_templates SET body =
'Hi {first_name}, your {device_make} {device_model} is ready to collect! Pop in whenever suits you.

Find us: {google_maps_link}'
WHERE key = 'READY_TO_COLLECT';

-- QUOTE_REMINDER - Gentle nudge to proceed
UPDATE sms_templates SET body =
'Hi {first_name}, just checking — would you like to go ahead with the £{price_total} repair for your {device_make} {device_model}? No rush, just let us know.

Track: {tracking_link}'
WHERE key = 'QUOTE_REMINDER';

-- CANCELLED - Job cancelled
UPDATE sms_templates SET body =
'Hi {first_name}, your {device_make} {device_model} repair has been cancelled. If you''ve got any questions, just give us a call.'
WHERE key = 'CANCELLED';

-- DELAYED - Repair delayed
UPDATE sms_templates SET body =
'Hi {first_name}, there''s a slight delay with your {device_make} {device_model} repair — sorry about that.

{delay_reason} {delay_notes}

We''ll update you as soon as things are moving again.

Track: {tracking_link}'
WHERE key = 'DELAYED' OR key = 'DELAY_NOTIFICATION';

-- COLLECTED template removed — post-collection aftercare SMS is sent separately
-- via /api/jobs/send-collection-sms (delayed, aftercare-first with review link)
DELETE FROM sms_templates WHERE key = 'COLLECTED';

-- Ensure all templates are active
UPDATE sms_templates SET is_active = true WHERE key IN (
  'RECEIVED', 'QUOTE_APPROVED', 'ONBOARDING_WITH_DEPOSIT', 'ONBOARDING_REQUIRED',
  'DEPOSIT_REQUIRED', 'AWAITING_DEPOSIT', 'DEPOSIT_RECEIVED', 'PARTS_ORDERED',
  'PARTS_ARRIVED', 'IN_REPAIR', 'COMPLETED', 'READY_TO_COLLECT',
  'QUOTE_REMINDER', 'CANCELLED', 'DELAYED', 'DELAY_NOTIFICATION'
);
