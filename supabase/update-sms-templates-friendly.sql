-- Update SMS templates with friendlier, more human messaging
-- Combines RECEIVED and READY_TO_BOOK_IN into one dynamic template
-- Makes messaging appropriate for customers with/without email

-- Update all SMS templates with new friendly messaging
UPDATE sms_templates SET body = 
'Hi {customer_name},

To proceed with your {device_make} {device_model} repair we just need you to complete the booking and pay the deposit.

Complete booking:
{onboarding_link}

Deposit: £{deposit_amount}

New Forest Device Repairs'
WHERE template_key = 'ONBOARDING_WITH_DEPOSIT';

UPDATE sms_templates SET body = 
'Hi {customer_name},

There''s a slight delay with your {device_make} {device_model} repair.

We''ll update you shortly.

Track progress:
{tracking_link}

New Forest Device Repairs'
WHERE template_key = 'DELAY_NOTIFICATION';

UPDATE sms_templates SET body = 
'Hi {customer_name},

Parts for your {device_make} {device_model} have now been ordered.

We''ll let you know when they arrive.

Track progress:
{tracking_link}

New Forest Device Repairs'
WHERE template_key = 'PARTS_ORDERED';

-- RECEIVED template - now dynamic based on whether customer has email
-- This replaces both RECEIVED and READY_TO_BOOK_IN
UPDATE sms_templates SET body = 
'Hi {customer_name},

Your {device_make} {device_model} has been booked in at New Forest Device Repairs.

We''ll take a look shortly and update you.

Track progress:
{tracking_link}'
WHERE template_key = 'RECEIVED';

UPDATE sms_templates SET body = 
'Hi {customer_name},

Good news — your {device_make} {device_model} is ready to collect from New Forest Device Repairs.

See you when convenient.'
WHERE template_key = 'READY_TO_COLLECT';

UPDATE sms_templates SET body = 
'Hi {customer_name},

Your {device_make} {device_model} repair is complete.

If you have any issues, please just let us know.

New Forest Device Repairs'
WHERE template_key = 'COMPLETED';

UPDATE sms_templates SET body = 
'Hi {customer_name},

Just checking if you''d like to proceed with the £{price_total} repair for your {device_make} {device_model}.

Track progress:
{tracking_link}

New Forest Device Repairs'
WHERE template_key = 'QUOTE_REMINDER';

UPDATE sms_templates SET body = 
'Hi {customer_name},

Thanks for collecting your {device_make} {device_model} from New Forest Device Repairs.

If you need anything else, just let us know.'
WHERE template_key = 'COLLECTED';

UPDATE sms_templates SET body = 
'Hi {customer_name},

The parts for your {device_make} {device_model} have arrived.

Please drop your device in when convenient.

Find us:
{google_maps_link}

New Forest Device Repairs'
WHERE template_key = 'PARTS_ARRIVED';

UPDATE sms_templates SET body = 
'Hi {customer_name},

Your {device_make} {device_model} repair has been cancelled.

If you have any questions please contact New Forest Device Repairs.'
WHERE template_key = 'CANCELLED';

UPDATE sms_templates SET body = 
'Hi {customer_name},

Your quote for repairing the {device_make} {device_model} (£{price_total}) has been approved.

Please drop your device in when convenient.

Find us:
{google_maps_link}

New Forest Device Repairs'
WHERE template_key = 'QUOTE_APPROVED';

UPDATE sms_templates SET body = 
'Hi {customer_name},

Thanks — we''ve received your £{deposit_amount} deposit for the {device_make} {device_model}.

Parts are now being ordered.

Track progress:
{tracking_link}

New Forest Device Repairs'
WHERE template_key = 'DEPOSIT_RECEIVED';

UPDATE sms_templates SET body = 
'Hi {customer_name},

Your {device_make} {device_model} is now being repaired at New Forest Device Repairs.

We''ll message when it''s ready.

Track progress:
{tracking_link}'
WHERE template_key = 'IN_REPAIR';

UPDATE sms_templates SET body = 
'Hi {customer_name},

A £{deposit_amount} deposit is required to order parts for your {device_make} {device_model}.

Pay deposit:
{deposit_link}

Track progress:
{tracking_link}

New Forest Device Repairs'
WHERE template_key = 'DEPOSIT_REQUIRED' OR template_key = 'AWAITING_DEPOSIT';

UPDATE sms_templates SET body = 
'Hi {customer_name},

We just need a few details to book in your {device_make} {device_model} repair.

Please complete booking here:
{onboarding_link}

New Forest Device Repairs'
WHERE template_key = 'ONBOARDING_REQUIRED';

UPDATE sms_templates SET body = 
'Hi {customer_name},

Your {device_make} {device_model} repair is currently delayed.

{delay_reason}
{delay_notes}

Track progress:
{tracking_link}

New Forest Device Repairs'
WHERE template_key = 'DELAYED';

-- Add note about the dynamic RECEIVED message
-- The SMS sending logic should append this line if customer has email:
-- "You'll receive updates by text and email. If you can't see our emails please check your junk folder."
