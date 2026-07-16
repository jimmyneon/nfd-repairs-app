-- Add SMS template for manual bookings where parts are needed but device is NOT in shop
-- This is for when staff book a repair, tell customer about £20 deposit in person,
-- but customer takes device home until parts arrive

INSERT INTO sms_templates (key, body, is_active)
VALUES (
  'MANUAL_BOOKING_PARTS_NEEDED',
  'Hi {customer_name},

Thank you for booking your {device_make} {device_model} repair with us today.

We will let you know as soon as the parts arrive. Please bring your device in at your convenience and we will get it fixed for you right away.

Track progress:
{tracking_link}

New Forest Device Repairs',
  true
)
ON CONFLICT (key) DO UPDATE SET
  body = EXCLUDED.body,
  is_active = EXCLUDED.is_active;

-- Verify template was created
SELECT key, body, is_active 
FROM sms_templates 
WHERE key = 'MANUAL_BOOKING_PARTS_NEEDED';
