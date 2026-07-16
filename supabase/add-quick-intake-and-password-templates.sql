-- Quick Intake SMS template
-- Sent when staff uses super quick mode (name + phone only)
-- Includes tracking link so customer can see status and complete details
INSERT INTO sms_templates (key, body, is_active)
SELECT 'QUICK_INTAKE',
'Hi {first_name}, your device is now booked in with us. We just need a few more details — please use this link to complete your check-in:

{tracking_link}

We''ll update you as soon as possible.

Many thanks,
New Forest Device Repairs', true
WHERE NOT EXISTS (SELECT 1 FROM sms_templates WHERE key = 'QUICK_INTAKE');

-- Update if already exists
UPDATE sms_templates SET body =
'Hi {first_name}, your device is now booked in with us. We just need a few more details — please use this link to complete your check-in:

{tracking_link}

We''ll update you as soon as possible.

Many thanks,
New Forest Device Repairs'
WHERE key = 'QUICK_INTAKE';

-- Password Request SMS template
-- Sent when staff requests device password from customer via SMS
-- Includes secure link where customer can enter their password
INSERT INTO sms_templates (key, body, is_active)
SELECT 'PASSWORD_REQUEST',
'Hi {first_name}, to complete your repair we need your device passcode. Please enter it securely using this link:

{password_link}

This link expires in 24 hours. Your passcode is stored securely and deleted 7 days after collection.

Many thanks,
New Forest Device Repairs', true
WHERE NOT EXISTS (SELECT 1 FROM sms_templates WHERE key = 'PASSWORD_REQUEST');

-- Update if already exists
UPDATE sms_templates SET body =
'Hi {first_name}, to complete your repair we need your device passcode. Please enter it securely using this link:

{password_link}

This link expires in 24 hours. Your passcode is stored securely and deleted 7 days after collection.

Many thanks,
New Forest Device Repairs'
WHERE key = 'PASSWORD_REQUEST';

-- Ensure templates are active
UPDATE sms_templates SET is_active = true WHERE key IN ('QUICK_INTAKE', 'PASSWORD_REQUEST');
