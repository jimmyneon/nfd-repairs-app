-- Update PARTS_ARRIVED template to include live hours link
UPDATE sms_templates
SET body = 'Hi {first_name},

Good news — parts for your {device_make} {device_model} have arrived. Pop it into me at your convenience and I''ll get the repair started right away.

Our opening times:
{hours_link}

New Forest Device Repairs'
WHERE key = 'PARTS_ARRIVED';

-- Verify
SELECT key, body, is_active FROM sms_templates WHERE key = 'PARTS_ARRIVED';
