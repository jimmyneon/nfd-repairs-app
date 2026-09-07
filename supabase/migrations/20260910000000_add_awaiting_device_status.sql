-- Add AWAITING_DEVICE status for jobs where parts are in stock
-- but the customer hasn't brought the device in yet.
-- This replaces QUOTE_APPROVED for the "in stock" conversion path.
-- QUOTE_APPROVED is kept for backward compatibility with existing jobs.

-- Update the status constraint to include AWAITING_DEVICE
ALTER TABLE jobs DROP CONSTRAINT IF EXISTS jobs_status_check;
ALTER TABLE jobs ADD CONSTRAINT jobs_status_check CHECK (
  status IN (
    'QUOTE_REQUESTED', 'QUOTE_APPROVED', 'AWAITING_DEVICE',
    'RECEIVED', 'DIAGNOSTIC', 'AWAITING_DEPOSIT',
    'PARTS_ORDERED', 'PARTS_ARRIVED', 'IN_REPAIR',
    'DELAYED', 'READY_TO_COLLECT', 'IN_STORAGE',
    'COLLECTED', 'COMPLETED', 'CANCELLED'
  )
);

-- Migrate existing QUOTE_APPROVED jobs (where parts are in stock, device not received)
-- to AWAITING_DEVICE for consistency
UPDATE jobs
SET status = 'AWAITING_DEVICE'
WHERE status = 'QUOTE_APPROVED'
  AND device_in_shop = false
  AND (parts_required = false OR parts_required IS NULL);

-- Add notification_config entry for AWAITING_DEVICE
INSERT INTO notification_config (status_key, send_sms, is_active)
SELECT 'AWAITING_DEVICE', true, true
WHERE NOT EXISTS (
  SELECT 1 FROM notification_config WHERE status_key = 'AWAITING_DEVICE'
);

-- Add SMS template for AWAITING_DEVICE
INSERT INTO sms_templates (key, body, is_active)
SELECT 'AWAITING_DEVICE',
'Hi {first_name}, great news — we have the parts in stock for your {device_model} repair!

Just bring your device in whenever suits you during opening hours — no appointment needed.

Directions and hours: {google_maps_link}
Track your repair: {tracking_link}

New Forest Device Repairs', true
WHERE NOT EXISTS (SELECT 1 FROM sms_templates WHERE key = 'AWAITING_DEVICE');

-- Ensure the template is active and up to date
UPDATE sms_templates SET body =
'Hi {first_name}, great news — we have the parts in stock for your {device_model} repair!

Just bring your device in whenever suits you during opening hours — no appointment needed.

Directions and hours: {google_maps_link}
Track your repair: {tracking_link}

New Forest Device Repairs',
is_active = true
WHERE key = 'AWAITING_DEVICE';
