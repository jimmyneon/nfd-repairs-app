-- SMS Templates for Warranty Workflow
-- Run this in Supabase SQL Editor

-- 1. Warranty Approved - Bring Device In (No Parts Needed)
INSERT INTO sms_templates (key, body, is_active)
VALUES (
  'WARRANTY_APPROVED',
  'Hi {customer_name}, good news! We''ve approved your warranty request for your {device_make} {device_model}.

Please bring your device to our shop at your earliest convenience and we''ll get this sorted out for you.

Find us: {google_maps_link}

New Forest Device Repairs',
  true
)
ON CONFLICT (key) 
DO UPDATE SET
  body = EXCLUDED.body,
  is_active = EXCLUDED.is_active,
  updated_at = NOW();

-- 2. Warranty Approved - Parts Required
INSERT INTO sms_templates (key, body, is_active)
VALUES (
  'WARRANTY_APPROVED_PARTS',
  'Hi {customer_name}, good news! We''ve approved your warranty request for your {device_make} {device_model}.

We need to order parts for this repair. We''ll let you know as soon as they arrive and you can bring your device in.

We''ll keep you updated on the parts delivery.

New Forest Device Repairs',
  true
)
ON CONFLICT (key) 
DO UPDATE SET
  body = EXCLUDED.body,
  is_active = EXCLUDED.is_active,
  updated_at = NOW();

-- 3. Warranty Parts Arrived - Bring Device In
INSERT INTO sms_templates (key, body, is_active)
VALUES (
  'WARRANTY_PARTS_ARRIVED',
  'Hi {customer_name}, the parts for your {device_make} {device_model} warranty repair have arrived!

Please bring your device to our shop at your earliest convenience and we''ll get this sorted out for you.

Find us: {google_maps_link}

New Forest Device Repairs',
  true
)
ON CONFLICT (key) 
DO UPDATE SET
  body = EXCLUDED.body,
  is_active = EXCLUDED.is_active,
  updated_at = NOW();

-- 4. Warranty Declined
INSERT INTO sms_templates (key, body, is_active)
VALUES (
  'WARRANTY_DECLINED',
  'Hi {customer_name}, we''ve reviewed your warranty request for your {device_make} {device_model}.

Unfortunately, this issue isn''t covered under our warranty. {decline_reason}

If you''d like us to repair this as a paid job, please give us a call on 07410381247.

New Forest Device Repairs',
  true
)
ON CONFLICT (key) 
DO UPDATE SET
  body = EXCLUDED.body,
  is_active = EXCLUDED.is_active,
  updated_at = NOW();

-- 5. Warranty Needs More Info
INSERT INTO sms_templates (key, body, is_active)
VALUES (
  'WARRANTY_NEEDS_INFO',
  'Hi {customer_name}, we''re reviewing your warranty request for your {device_make} {device_model}.

We need a bit more information to process this. {info_needed}

Please reply to this message with the details.

New Forest Device Repairs',
  true
)
ON CONFLICT (key) 
DO UPDATE SET
  body = EXCLUDED.body,
  is_active = EXCLUDED.is_active,
  updated_at = NOW();

-- Add comments
COMMENT ON TABLE sms_templates IS 'SMS message templates with placeholder support';
