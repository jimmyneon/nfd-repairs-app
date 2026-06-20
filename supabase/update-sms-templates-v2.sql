-- Updated SMS templates - friendlier, more conversational, aftercare-first
-- Uses {first_name} for warmer tone
-- Run this in Supabase SQL Editor to update all templates

-- RECEIVED - Device booked in (replaces old READY_TO_BOOK_IN too)
UPDATE sms_templates SET body = 
'Hi {first_name},

Your {device_make} {device_model} is booked in with us.

We''ll get that sorted for you as soon as we can.

Track progress:
{tracking_link}'
WHERE key = 'RECEIVED';

-- ONBOARDING_WITH_DEPOSIT - Need booking completed + deposit
UPDATE sms_templates SET body = 
'Hi {first_name},

To get started on your {device_make} {device_model} we just need you to complete the booking and pay the deposit.

Complete booking:
{onboarding_link}

Deposit: £{deposit_amount}

New Forest Device Repairs'
WHERE key = 'ONBOARDING_WITH_DEPOSIT';

-- ONBOARDING_REQUIRED - Need more details
UPDATE sms_templates SET body = 
'Hi {first_name},

We just need a few details to book in your {device_make} {device_model} repair.

It''ll only take a minute:
{onboarding_link}

New Forest Device Repairs'
WHERE key = 'ONBOARDING_REQUIRED';

-- DEPOSIT_REQUIRED / AWAITING_DEPOSIT - Need deposit for parts
UPDATE sms_templates SET body = 
'Hi {first_name},

We need to order parts for your {device_make} {device_model} — a £{deposit_amount} deposit gets that started.

Pay deposit:
{deposit_link}

Track progress:
{tracking_link}

New Forest Device Repairs'
WHERE key = 'DEPOSIT_REQUIRED' OR key = 'AWAITING_DEPOSIT';

-- DEPOSIT_RECEIVED - Deposit paid, parts being ordered
UPDATE sms_templates SET body = 
'Hi {first_name},

Got your £{deposit_amount} deposit — thanks! Parts for your {device_make} {device_model} are being ordered now.

We''ll let you know when they arrive.

Track progress:
{tracking_link}

New Forest Device Repairs'
WHERE key = 'DEPOSIT_RECEIVED';

-- PARTS_ORDERED - Parts have been ordered
UPDATE sms_templates SET body = 
'Hi {first_name},

Parts for your {device_make} {device_model} are on order.

We''ll be in touch as soon as they arrive.

Track progress:
{tracking_link}

New Forest Device Repairs'
WHERE key = 'PARTS_ORDERED';

-- PARTS_ARRIVED - Parts arrived, bring device in
UPDATE sms_templates SET body = 
'Hi {first_name},

Good news — parts for your {device_make} {device_model} have arrived.

Drop your device in whenever suits you.

Find us:
{google_maps_link}

New Forest Device Repairs'
WHERE key = 'PARTS_ARRIVED';

-- IN_REPAIR - Repair in progress
UPDATE sms_templates SET body = 
'Hi {first_name},

Your {device_make} {device_model} is being repaired now.

We''ll message you when it''s ready.

Track progress:
{tracking_link}'
WHERE key = 'IN_REPAIR';

-- COMPLETED - Repair complete (immediate notification)
UPDATE sms_templates SET body = 
'Hi {first_name},

Your {device_make} {device_model} is all repaired and ready to go.

If you spot any issues at all, just give us a shout — we''ll sort it.

New Forest Device Repairs'
WHERE key = 'COMPLETED';

-- READY_TO_COLLECT - Ready for pickup
UPDATE sms_templates SET body = 
'Hi {first_name},

Your {device_make} {device_model} is ready to collect!

Pop in whenever suits you.

Find us:
{google_maps_link}

See you soon!'
WHERE key = 'READY_TO_COLLECT';

-- QUOTE_APPROVED - Quote approved, bring device in
UPDATE sms_templates SET body = 
'Hi {first_name},

Your quote for the {device_make} {device_model} (£{price_total}) is approved.

Drop your device in whenever you''re ready.

Find us:
{google_maps_link}

New Forest Device Repairs'
WHERE key = 'QUOTE_APPROVED';

-- QUOTE_REMINDER - Gentle nudge to proceed
UPDATE sms_templates SET body = 
'Hi {first_name},

Just checking — would you like to go ahead with the £{price_total} repair for your {device_make} {device_model}?

No rush, just let us know.

Track progress:
{tracking_link}

New Forest Device Repairs'
WHERE key = 'QUOTE_REMINDER';

-- CANCELLED - Job cancelled
UPDATE sms_templates SET body = 
'Hi {first_name},

Your {device_make} {device_model} repair has been cancelled.

If you''ve got any questions, just give us a call — happy to help.

New Forest Device Repairs'
WHERE key = 'CANCELLED';

-- DELAYED - Repair delayed
UPDATE sms_templates SET body = 
'Hi {first_name},

There''s a slight delay with your {device_make} {device_model} repair — sorry about that.

{delay_reason} {delay_notes}

We''ll update you as soon as things are moving again.

Track progress:
{tracking_link}

New Forest Device Repairs'
WHERE key = 'DELAYED' OR key = 'DELAY_NOTIFICATION';

-- COLLECTED template removed — post-collection aftercare SMS is sent separately
-- via /api/jobs/send-collection-sms (delayed, aftercare-first with review link)
DELETE FROM sms_templates WHERE key = 'COLLECTED';
