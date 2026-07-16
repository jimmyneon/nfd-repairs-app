-- Update SMS templates to include Google Maps link
-- Run this in Supabase SQL Editor after adding google_maps_link to admin_settings

-- Add RECEIVED template for manual job entry (when customer drops off device in person)
INSERT INTO sms_templates (key, body, is_active)
VALUES (
  'RECEIVED',
  'Hi {customer_name}, thanks for choosing New Forest Device Repairs.

We''ve received your {device_make} {device_model} and it''s now in our repair queue.

We''ll send you updates as we progress with the repair.

Track your repair: {tracking_link}

Find us: {google_maps_link}

New Forest Device Repairs',
  true
)
ON CONFLICT (key) 
DO UPDATE SET
  body = EXCLUDED.body,
  is_active = EXCLUDED.is_active,
  updated_at = NOW();

-- Update READY_TO_BOOK_IN template (for online submissions)
UPDATE sms_templates
SET 
  body = 'Hi {customer_name}, thanks for getting in touch with New Forest Device Repairs.

We''re ready to look at your {device_make} {device_model}.

Please bring your device to us at your convenience.

Find us: {google_maps_link}
Opening hours: {google_opening_hours_link}

Track your repair: {tracking_link}

New Forest Device Repairs',
  updated_at = NOW()
WHERE key = 'READY_TO_BOOK_IN';

-- Update READY_TO_COLLECT template
UPDATE sms_templates
SET 
  body = 'Hi {customer_name}, great news!

Your {device_make} {device_model} is ready to collect.

Find us: {google_maps_link}
Opening hours: {google_opening_hours_link}

Track your repair: {tracking_link}

New Forest Device Repairs',
  updated_at = NOW()
WHERE key = 'READY_TO_COLLECT';

-- Update DEPOSIT_REQUIRED template
UPDATE sms_templates
SET 
  body = 'Hi {customer_name}, we need to order parts for your {device_make} {device_model}.

A £20 deposit is required to proceed.

Pay deposit: {deposit_link}

Once paid, we''ll order the parts and continue with your repair.

Find us: {google_maps_link}

Track your repair: {tracking_link}

New Forest Device Repairs',
  updated_at = NOW()
WHERE key = 'DEPOSIT_REQUIRED';
