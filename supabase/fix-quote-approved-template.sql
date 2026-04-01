-- Fix QUOTE_APPROVED SMS template
-- Issues fixed:
-- 1. Remove emoji (special characters don't work in SMS)
-- 2. Remove job reference (customer doesn't need it)
-- 3. Fix duplicate device name issue (only use device_model, not device_make + device_model)
-- 4. Better wording - customer approved it, we're thanking them

UPDATE sms_templates
SET 
  body = 'Hi {customer_name}, thanks for confirming you''d like to get the repair done.

Please drop off your {device_model} at your convenience.

Location & hours: {location_link}

New Forest Device Repairs',
  updated_at = NOW()
WHERE key = 'QUOTE_APPROVED';

-- Verify the template
SELECT key, body, is_active 
FROM sms_templates 
WHERE key = 'QUOTE_APPROVED';
