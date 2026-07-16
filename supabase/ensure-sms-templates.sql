-- Ensure all required SMS templates exist
-- Run this in Supabase SQL Editor to create/update all templates

-- DEPOSIT_REQUIRED - When parts need to be ordered
INSERT INTO sms_templates (key, body, is_active)
VALUES (
  'DEPOSIT_REQUIRED',
  'Hi {customer_name}, we need to order parts for your {device_make} {device_model}.

A £{deposit_amount} deposit is required to proceed.

Pay deposit: {deposit_link}

Once paid, we''ll order the parts and continue with your repair.

Track your repair: {tracking_link}

New Forest Device Repairs',
  true
)
ON CONFLICT (key) 
DO UPDATE SET
  body = EXCLUDED.body,
  is_active = EXCLUDED.is_active,
  updated_at = NOW();

-- RECEIVED - Manual job entry (customer drops off in person)
INSERT INTO sms_templates (key, body, is_active)
VALUES (
  'RECEIVED',
  'Hi {customer_name}, thanks for choosing New Forest Device Repairs.

We''ve received your {device_make} {device_model} and it''s now in our repair queue.

We''ll send you updates as we progress with the repair.

Track your repair: {tracking_link}

New Forest Device Repairs',
  true
)
ON CONFLICT (key) 
DO UPDATE SET
  body = EXCLUDED.body,
  is_active = EXCLUDED.is_active,
  updated_at = NOW();

-- READY_TO_BOOK_IN - Online submissions (no parts needed)
INSERT INTO sms_templates (key, body, is_active)
VALUES (
  'READY_TO_BOOK_IN',
  'Hi {customer_name}, thanks for getting in touch with New Forest Device Repairs.

We''re ready to look at your {device_make} {device_model}.

Please bring your device to us at your convenience.

Track your repair: {tracking_link}

New Forest Device Repairs',
  true
)
ON CONFLICT (key) 
DO UPDATE SET
  body = EXCLUDED.body,
  is_active = EXCLUDED.is_active,
  updated_at = NOW();

-- ONBOARDING_REQUIRED - When customer needs to complete onboarding
INSERT INTO sms_templates (key, body, is_active)
VALUES (
  'ONBOARDING_REQUIRED',
  'Hi {customer_name}, we need a few more details for your {device_make} {device_model} repair.

Please complete your booking: {onboarding_link}

This will only take a minute.

New Forest Device Repairs',
  true
)
ON CONFLICT (key) 
DO UPDATE SET
  body = EXCLUDED.body,
  is_active = EXCLUDED.is_active,
  updated_at = NOW();

-- ONBOARDING_WITH_DEPOSIT - Onboarding needed + deposit required
INSERT INTO sms_templates (key, body, is_active)
VALUES (
  'ONBOARDING_WITH_DEPOSIT',
  'Hi {customer_name}, we need to order parts for your {device_make} {device_model}.

First, please complete your booking: {onboarding_link}

Then pay the £{deposit_amount} deposit to proceed.

New Forest Device Repairs',
  true
)
ON CONFLICT (key) 
DO UPDATE SET
  body = EXCLUDED.body,
  is_active = EXCLUDED.is_active,
  updated_at = NOW();

-- READY_TO_COLLECT - Repair complete
INSERT INTO sms_templates (key, body, is_active)
VALUES (
  'READY_TO_COLLECT',
  'Hi {customer_name}, great news!

Your {device_make} {device_model} is ready to collect.

Track your repair: {tracking_link}

New Forest Device Repairs',
  true
)
ON CONFLICT (key) 
DO UPDATE SET
  body = EXCLUDED.body,
  is_active = EXCLUDED.is_active,
  updated_at = NOW();

-- IN_REPAIR - Repair in progress
INSERT INTO sms_templates (key, body, is_active)
VALUES (
  'IN_REPAIR',
  'Hi {customer_name}, your {device_make} {device_model} is now being repaired.

We''ll update you when it''s ready to collect.

Track your repair: {tracking_link}

New Forest Device Repairs',
  true
)
ON CONFLICT (key) 
DO UPDATE SET
  body = EXCLUDED.body,
  is_active = EXCLUDED.is_active,
  updated_at = NOW();

-- PARTS_ORDERED - Parts have been ordered
INSERT INTO sms_templates (key, body, is_active)
VALUES (
  'PARTS_ORDERED',
  'Hi {customer_name}, we''ve ordered the parts for your {device_make} {device_model}.

We''ll let you know when they arrive and we can start the repair.

Track your repair: {tracking_link}

New Forest Device Repairs',
  true
)
ON CONFLICT (key) 
DO UPDATE SET
  body = EXCLUDED.body,
  is_active = EXCLUDED.is_active,
  updated_at = NOW();
