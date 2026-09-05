-- Add SMS templates for the missed-call bridge and customer response automation.
-- These support the consolidated repair app (replacing the old AI Steve / NFDRai app).
--
-- Run in Supabase SQL editor. Safe to re-run (uses ON CONFLICT upsert).

-- MISSED_CALL_OPEN — sent when a customer calls and we're currently open
INSERT INTO sms_templates (key, body, is_active)
VALUES (
  'MISSED_CALL_OPEN',
  'Sorry we missed your call!

We''re currently OPEN until {close_time}.

Need help? Here''s the quickest way:

REPAIR QUOTES & APPOINTMENTS:
https://www.newforestdevicerepairs.co.uk/repair-request

QUESTIONS & STATUS CHECKS:
Text us or visit: https://www.newforestdevicerepairs.co.uk/start

Find us: {maps_link}

Many thanks,
John — New Forest Device Repairs',
  true
)
ON CONFLICT (key) DO UPDATE SET body = EXCLUDED.body, is_active = EXCLUDED.is_active, updated_at = NOW();

-- MISSED_CALL_CLOSED — sent when a customer calls outside opening hours
INSERT INTO sms_templates (key, body, is_active)
VALUES (
  'MISSED_CALL_CLOSED',
  'Sorry we missed your call!

We''re currently closed. We''ll be open {next_open}.

Need help? Here''s the quickest way:

REPAIR QUOTES & APPOINTMENTS:
https://www.newforestdevicerepairs.co.uk/repair-request

QUESTIONS & STATUS CHECKS:
Text us or visit: https://www.newforestdevicerepairs.co.uk/start

Find us: {maps_link}

Many thanks,
John — New Forest Device Repairs',
  true
)
ON CONFLICT (key) DO UPDATE SET body = EXCLUDED.body, is_active = EXCLUDED.is_active, updated_at = NOW();

-- QUOTE_ACCEPTED_AUTO — sent automatically when a customer texts "yes" to accept a quote
INSERT INTO sms_templates (key, body, is_active)
VALUES (
  'QUOTE_ACCEPTED_AUTO',
  'Hi {first_name},

Great news — your {device_make} {device_model} repair is booked in!

Pop in with your device whenever you''re ready — no appointment needed.

Opening hours: {hours_link}
Find us: {maps_link}
Track your repair: {tracking_link}

See you soon,
New Forest Device Repairs',
  true
)
ON CONFLICT (key) DO UPDATE SET body = EXCLUDED.body, is_active = EXCLUDED.is_active, updated_at = NOW();

-- QUOTE_CONFIRM_PROMPT — sent when a customer gives a vague reply (e.g. "ok thanks")
-- and we need an explicit yes/no before booking
INSERT INTO sms_templates (key, body, is_active)
VALUES (
  'QUOTE_CONFIRM_PROMPT',
  'Hi {first_name},

Just to confirm — would you like to go ahead with the {device_make} {device_model} repair at £{quoted_price}?

Reply YES to book it in, or let me know if you have any questions.

New Forest Device Repairs',
  true
)
ON CONFLICT (key) DO UPDATE SET body = EXCLUDED.body, is_active = EXCLUDED.is_active, updated_at = NOW();

-- QUOTE_DECLINED_AUTO — sent when a customer clearly declines the quote
INSERT INTO sms_templates (key, body, is_active)
VALUES (
  'QUOTE_DECLINED_AUTO',
  'Hi {first_name},

No problem at all. If you change your mind or need anything else in the future, just give us a call or text.

Take care,
New Forest Device Repairs',
  true
)
ON CONFLICT (key) DO UPDATE SET body = EXCLUDED.body, is_active = EXCLUDED.is_active, updated_at = NOW();

-- Verify
SELECT key, LEFT(body, 60) as body_preview, is_active
FROM sms_templates
WHERE key IN ('MISSED_CALL_OPEN', 'MISSED_CALL_CLOSED', 'QUOTE_ACCEPTED_AUTO', 'QUOTE_CONFIRM_PROMPT', 'QUOTE_DECLINED_AUTO')
ORDER BY key;
