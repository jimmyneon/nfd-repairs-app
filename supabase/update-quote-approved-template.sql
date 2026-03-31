-- Update QUOTE_APPROVED SMS template to be simple acceptance message
-- No tracking link, just location and opening hours
-- Customer will drop off device at their convenience

-- First, check if template exists and update it
UPDATE sms_templates
SET 
  body = 'Hi {customer_name}, great news! Your {device_make} {device_model} repair quote (£{price_total}) has been approved. Please drop off your device at your convenience.

📍 NFD Repairs
Unit 4, Newfield Drive Industrial Estate
Newfield Drive, Stonehouse
Larkhall ML9 2YR

🕐 Opening Hours:
Mon-Fri: 9am-5pm
Sat: 10am-2pm
Sun: Closed

Job ref: {job_ref}

We''ll complete the details when you drop it off. See you soon!',
  updated_at = NOW()
WHERE key = 'QUOTE_APPROVED';

-- If it doesn't exist, insert it
INSERT INTO sms_templates (key, name, body, is_active, category)
SELECT 
  'QUOTE_APPROVED',
  'Quote Approved - Drop Off Instructions',
  'Hi {customer_name}, great news! Your {device_make} {device_model} repair quote (£{price_total}) has been approved. Please drop off your device at your convenience.

📍 NFD Repairs
Unit 4, Newfield Drive Industrial Estate
Newfield Drive, Stonehouse
Larkhall ML9 2YR

🕐 Opening Hours:
Mon-Fri: 9am-5pm
Sat: 10am-2pm
Sun: Closed

Job ref: {job_ref}

We''ll complete the details when you drop it off. See you soon!',
  true,
  'STATUS_UPDATE'
WHERE NOT EXISTS (
  SELECT 1 FROM sms_templates WHERE key = 'QUOTE_APPROVED'
);

-- Verify the template
SELECT key, name, LEFT(body, 100) as body_preview, is_active 
FROM sms_templates 
WHERE key = 'QUOTE_APPROVED';
