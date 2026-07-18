-- Update ALL SMS templates to use {hours_link} instead of {google_maps_link}
-- and add "Please check live hours before setting off" where customer needs to visit

-- Set the opening_hours_link in admin_settings to the short link
INSERT INTO admin_settings (key, value, description)
VALUES ('opening_hours_link', 'https://nfdr.uk/h', 'Short link to live opening hours (redirects to Google Maps)')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

-- PARTS_ARRIVED - customer needs to drop off device
UPDATE sms_templates SET body =
'Hi {first_name},

Good news — parts for your {device_make} {device_model} have arrived. Pop it into me at your convenience and I''ll get the repair started right away.

Please check our live hours before setting off: {hours_link}

New Forest Device Repairs'
WHERE key = 'PARTS_ARRIVED';

-- READY_TO_COLLECT - customer needs to collect device
UPDATE sms_templates SET body =
'Hi {first_name}, great news — your {device_make} {device_model} is all repaired and ready to collect.

Please check our live hours before setting off: {hours_link}

Many thanks,
New Forest Device Repairs'
WHERE key = 'READY_TO_COLLECT';

-- QUOTE_APPROVED - customer needs to drop off device
UPDATE sms_templates SET body =
'Hi {first_name},

Your repair quote for {device_make} {device_model} has been approved. Drop off your device at your convenience.

Please check our live hours before setting off: {hours_link}

Job ref: {job_ref}'
WHERE key = 'QUOTE_APPROVED';

-- RECEIVED - customer may need to visit
UPDATE sms_templates SET body =
'Hi {first_name},

We''ve received your {device_make} {device_model} and it''s now in for diagnostic. We''ll be in touch soon with an update.

Track your repair: {tracking_link}

New Forest Device Repairs'
WHERE key = 'RECEIVED';

-- DIAGNOSTIC - customer may need to come in
UPDATE sms_templates SET body =
'Hi {first_name},

Diagnostic complete on your {device_make} {device_model}. {repair_summary}

Let me know if you''d like to go ahead with the repair.

New Forest Device Repairs'
WHERE key = 'DIAGNOSTIC';

-- AWAITING_DEPOSIT - customer needs to come in to pay
UPDATE sms_templates SET body =
'Hi {first_name},

To order parts for your {device_make} {device_model}, a £{deposit_amount} deposit is required.

Pay online: {deposit_link}

Or pop in to the shop to pay. Please check our live hours before setting off: {hours_link}

New Forest Device Repairs'
WHERE key = 'AWAITING_DEPOSIT';

-- PARTS_ORDERED - reassurance
UPDATE sms_templates SET body =
'Hi {first_name},

Just an update on your {device_make} {device_model} — parts have been ordered and we''ll let you know as soon as they arrive.

Track your repair: {tracking_link}

New Forest Device Repairs'
WHERE key = 'PARTS_ORDERED';

-- IN_REPAIR
UPDATE sms_templates SET body =
'Hi {first_name},

Your {device_make} {device_model} is now in for repair. We''ll be in touch as soon as it''s ready for collection.

Track your repair: {tracking_link}

New Forest Device Repairs'
WHERE key = 'IN_REPAIR';

-- DELAYED
UPDATE sms_templates SET body =
'Hi {first_name},

There''s a delay with your {device_make} {device_model} repair. {delay_reason}

{delay_notes}

We''ll update you as soon as things progress. Sorry for the inconvenience.

New Forest Device Repairs'
WHERE key = 'DELAYED';

-- COMPLETED
UPDATE sms_templates SET body =
'Hi {first_name},

Your {device_make} {device_model} repair is complete. We hope you''re happy with the service!

If you have a moment, a review would mean a lot: {review_link}

New Forest Device Repairs'
WHERE key = 'COMPLETED';

-- COLLECTION_REMINDER_1
UPDATE sms_templates SET body =
'Hi {first_name}, just a friendly reminder that your {device_make} {device_model} is ready to collect. Pop in at your convenience.

Please check our live hours before setting off: {hours_link}

Any questions, just reply here.

New Forest Device Repairs'
WHERE key = 'COLLECTION_REMINDER_1';

-- COLLECTION_REMINDER_2
UPDATE sms_templates SET body =
'Hi {first_name}, your {device_make} {device_model} has been ready to collect for a couple of weeks now. Please try to pop in within 30 days of it being ready.

Please check our live hours before setting off: {hours_link}

Any questions, just reply here.

New Forest Device Repairs'
WHERE key = 'COLLECTION_REMINDER_2';

-- COLLECTION_REMINDER_3
UPDATE sms_templates SET body =
'Hi {first_name}, your {device_make} {device_model} is coming up to our 30-day holding limit. After 30 days it will be moved to long-term storage. Please pop in to collect it in the next 10 days to avoid this.

Please check our live hours before setting off: {hours_link}

Any questions, just reply here.

New Forest Device Repairs'
WHERE key = 'COLLECTION_REMINDER_3';

-- COLLECTION_REMINDER_4
UPDATE sms_templates SET body =
'Hi {first_name}, this is a quick reminder that your {device_make} {device_model} will be moved to long-term storage in a couple of days if not collected. It will still be safe with us, but please pop in as soon as you can.

Please check our live hours before setting off: {hours_link}

Any questions, just reply here.

New Forest Device Repairs'
WHERE key = 'COLLECTION_REMINDER_4';

-- COLLECTION_REMINDER_5
UPDATE sms_templates SET body =
'Hi {first_name}, your {device_make} {device_model} is currently in our long-term storage. It will still be here for another 30 days, but after 90 days it may be recycled. Please pop in to collect it when you can.

Please check our live hours before setting off: {hours_link}

Any questions, just reply here.

New Forest Device Repairs'
WHERE key = 'COLLECTION_REMINDER_5';

-- COLLECTION_REMINDER_6
UPDATE sms_templates SET body =
'Hi {first_name}, this is our final reminder about your {device_make} {device_model}. If it isn''t collected in the next 5 days, it may be recycled or disposed of. Please reply here if you need to make arrangements.

Please check our live hours before setting off: {hours_link}

New Forest Device Repairs'
WHERE key = 'COLLECTION_REMINDER_6';

-- PARTS_IN_STOCK (new inquiry template)
INSERT INTO sms_templates (key, body, is_active)
VALUES (
  'PARTS_IN_STOCK',
  'Hi {first_name},

We''ve got the parts for your {device_make} {device_model} in stock! Pop it in any time at your convenience and we''ll get it sorted.

Please check our live hours before setting off: {hours_link}

New Forest Device Repairs',
  true
)
ON CONFLICT (key) DO UPDATE SET body = EXCLUDED.body;

-- SPECIAL_ORDER_PARTS (new inquiry template)
INSERT INTO sms_templates (key, body, is_active)
VALUES (
  'SPECIAL_ORDER_PARTS',
  'Hi {first_name},

Thanks for approving the quote for your {device_make} {device_model}! I''m ordering the parts in now — they usually arrive next day. We just need a £{deposit_amount} deposit to get the order placed.

Pay online here:
{deposit_link}

Or pop in to the shop to pay. Please check our live hours before setting off: {hours_link}

New Forest Device Repairs',
  true
)
ON CONFLICT (key) DO UPDATE SET body = EXCLUDED.body;

-- Verify all templates
SELECT key, LEFT(body, 100) as body_preview, is_active FROM sms_templates ORDER BY key;
