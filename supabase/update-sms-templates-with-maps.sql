-- Update SMS templates to include Google Maps link
-- Run this in Supabase SQL Editor after adding google_maps_link to admin_settings

-- Add RECEIVED template for manual job entry (when customer drops off device in person)
INSERT INTO sms_templates (template_key, template_name, message_template, variables, description)
VALUES (
  'RECEIVED',
  'Device Received',
  'Hi {firstName}, thanks for choosing New Forest Device Repairs.

We''ve received your {deviceModel} and it''s now in our repair queue.

We''ll send you updates as we progress with the repair.

Track your repair: {trackingUrl}

Find us: {googleMapsLink}

New Forest Device Repairs',
  ARRAY['firstName', 'deviceModel', 'trackingUrl', 'googleMapsLink'],
  'Sent when customer drops off device in person (manual job entry)'
)
ON CONFLICT (template_key) 
DO UPDATE SET
  message_template = EXCLUDED.message_template,
  variables = EXCLUDED.variables,
  description = EXCLUDED.description,
  updated_at = NOW();

-- Update READY_TO_BOOK_IN template (for online submissions)
UPDATE sms_templates
SET 
  message_template = 'Hi {firstName}, thanks for getting in touch with New Forest Device Repairs.

We''re ready to look at your {deviceModel}.

Please bring your device to us at your convenience.

Find us: {googleMapsLink}
Opening hours: {googleOpeningHoursLink}

Track your repair: {trackingUrl}

New Forest Device Repairs',
  variables = ARRAY['firstName', 'deviceModel', 'googleMapsLink', 'googleOpeningHoursLink', 'trackingUrl'],
  updated_at = NOW()
WHERE template_key = 'READY_TO_BOOK_IN';

-- Update READY_TO_COLLECT template
UPDATE sms_templates
SET 
  message_template = 'Hi {firstName}, great news!

Your {deviceModel} is ready to collect.

Find us: {googleMapsLink}
Opening hours: {googleOpeningHoursLink}

Track your repair: {trackingUrl}

New Forest Device Repairs',
  variables = ARRAY['firstName', 'deviceModel', 'googleMapsLink', 'googleOpeningHoursLink', 'trackingUrl'],
  updated_at = NOW()
WHERE template_key = 'READY_TO_COLLECT';

-- Update DEPOSIT_REQUIRED template
UPDATE sms_templates
SET 
  message_template = 'Hi {firstName}, we need to order parts for your {deviceModel}.

A £20 deposit is required to proceed.

Pay deposit: {depositPaymentUrl}

Once paid, we''ll order the parts and continue with your repair.

Find us: {googleMapsLink}

Track your repair: {trackingUrl}

New Forest Device Repairs',
  variables = ARRAY['firstName', 'deviceModel', 'depositPaymentUrl', 'googleMapsLink', 'trackingUrl'],
  updated_at = NOW()
WHERE template_key = 'DEPOSIT_REQUIRED';
