-- Add RECEIVED_WITH_PARTS SMS template
-- Sent when a job is booked in with parts needed toggle on
-- Different from standard RECEIVED: mentions parts are ordered and customer can pop in when convenient

INSERT INTO sms_templates (key, body, is_active)
VALUES (
  'RECEIVED_WITH_PARTS',
  'Hi {first_name}, your {device_make} {device_model} repair is booked in and we''ve ordered the parts. We''ll text you the moment they arrive. Once they''re in, pop in at your convenience and we''ll get the repair done.

Our opening hours: {hours_link}

Track your repair: {tracking_link}

New Forest Device Repairs',
  true
)
ON CONFLICT (key) DO UPDATE SET
  body = EXCLUDED.body,
  is_active = true;

-- Verify it was created
SELECT key, LEFT(body, 120) as body_preview, is_active 
FROM sms_templates 
WHERE key = 'RECEIVED_WITH_PARTS';
