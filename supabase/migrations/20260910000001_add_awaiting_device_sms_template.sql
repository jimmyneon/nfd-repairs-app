-- Add AWAITING_DEVICE SMS template and notification config
-- This status represents a proceeded quote where parts are in stock
-- but the customer has not yet brought their device in.

-- 1. SMS template for AWAITING_DEVICE status
INSERT INTO sms_templates (key, body, is_active)
VALUES (
  'AWAITING_DEVICE',
  'Hi {customer_name}, great news — we have the parts in stock for your {device_make} {device_model} repair!

Just bring your device in whenever suits you during opening hours — no appointment needed.

Directions and hours: {google_maps_link}
Track your repair: {tracking_link}

New Forest Device Repairs',
  true
)
ON CONFLICT (key) DO UPDATE SET
  body = EXCLUDED.body,
  is_active = true;

-- 2. Notification config for AWAITING_DEVICE status
INSERT INTO notification_config (status_key, status_label, send_sms, send_email, is_active)
VALUES ('AWAITING_DEVICE', 'Awaiting Device', true, false, true)
ON CONFLICT (status_key) DO UPDATE SET
  send_sms = true,
  send_email = false,
  is_active = true;

-- 3. Update PARTS_ARRIVED template to be possession-aware
-- (queue-status-sms already skips this when device_in_shop, so this template
-- is only sent when device is NOT in shop — customer needs to bring it in)
UPDATE sms_templates
SET body = 'Hi {customer_name}, good news! The parts for your {device_make} {device_model} have arrived.

Please bring your device in whenever suits you during opening hours — no appointment needed.

Directions and hours: {google_maps_link}
Track your repair: {tracking_link}

New Forest Device Repairs'
WHERE key = 'PARTS_ARRIVED';

-- Verify
SELECT key, LEFT(body, 80) as body_preview, is_active
FROM sms_templates
WHERE key IN ('AWAITING_DEVICE', 'PARTS_ARRIVED')
ORDER BY key;

SELECT status_key, send_sms, is_active
FROM notification_config
WHERE status_key = 'AWAITING_DEVICE';
