-- Add SMS templates for new job statuses
-- QUOTE_APPROVED, DROPPED_OFF, COLLECTED

-- 1. QUOTE_APPROVED - Repair quote approved, customer needs to drop off device
INSERT INTO sms_templates (key, name, body, is_active, category)
VALUES (
  'QUOTE_APPROVED',
  'Quote Approved - Drop Off Device',
  'Great news! Your repair quote for {device_make} {device_model} has been approved. Please drop off your device at New Forest Device Repairs. Find us: {google_maps_link} Track: {tracking_link}',
  true,
  'status_update'
)
ON CONFLICT (key) DO UPDATE SET
  body = EXCLUDED.body,
  updated_at = NOW();

-- 2. DROPPED_OFF - Device received in shop (for API/online jobs)
INSERT INTO sms_templates (key, name, body, is_active, category)
VALUES (
  'DROPPED_OFF',
  'Device Dropped Off',
  'Thanks for dropping off your {device_make} {device_model}! We''ve received it and will begin the repair process. Track: {tracking_link}',
  true,
  'status_update'
)
ON CONFLICT (key) DO UPDATE SET
  body = EXCLUDED.body,
  updated_at = NOW();

-- 3. COLLECTED - Customer has collected their device
INSERT INTO sms_templates (key, name, body, is_active, category)
VALUES (
  'COLLECTED',
  'Device Collected',
  'Thank you for collecting your {device_make} {device_model}! We hope you''re happy with the repair. If you have any issues, please contact us.',
  true,
  'status_update'
)
ON CONFLICT (key) DO UPDATE SET
  body = EXCLUDED.body,
  updated_at = NOW();

-- 4. Update PARTS_ARRIVED template to reflect new flow (no longer says "drop off")
UPDATE sms_templates 
SET body = 'Great news! Parts for your {device_make} {device_model} have arrived. We''re ready to start your repair. Track: {tracking_link}'
WHERE key = 'PARTS_ARRIVED';

-- 5. Add DELAYED template if it doesn't exist
INSERT INTO sms_templates (key, name, body, is_active, category)
VALUES (
  'DELAYED',
  'Repair Delayed',
  'Your {device_make} {device_model} repair is experiencing a delay. We''ll contact you shortly with more information. Track: {tracking_link}',
  true,
  'status_update'
)
ON CONFLICT (key) DO UPDATE SET
  body = EXCLUDED.body,
  updated_at = NOW();
