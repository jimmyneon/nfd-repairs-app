-- Update QUOTE_APPROVED SMS template to be simple acceptance message
-- Uses google_maps_link from admin_settings (shows location & hours on business profile)
-- Customer will drop off device at their convenience

-- First, check if template exists and update it
UPDATE sms_templates
SET 
  body = 'Hi {customer_name}, great news! Your {device_make} {device_model} repair quote (£{price_total}) has been approved. 

Drop off your device at your convenience.

📍 Location & hours: {google_maps_link}

Job ref: {job_ref}',
  updated_at = NOW()
WHERE key = 'QUOTE_APPROVED';

-- If it doesn't exist, insert it
INSERT INTO sms_templates (key, body, is_active)
SELECT 
  'QUOTE_APPROVED',
  'Hi {customer_name}, great news! Your {device_make} {device_model} repair quote (£{price_total}) has been approved. 

Drop off your device at your convenience.

📍 Location & hours: {google_maps_link}

Job ref: {job_ref}',
  true
WHERE NOT EXISTS (
  SELECT 1 FROM sms_templates WHERE key = 'QUOTE_APPROVED'
);

-- Verify the template
SELECT key, LEFT(body, 100) as body_preview, is_active 
FROM sms_templates 
WHERE key = 'QUOTE_APPROVED';
