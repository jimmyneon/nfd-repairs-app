-- Add DELAYED status to the job status enum and create SMS template
-- This status is used when there's a delay in the repair process (waiting for parts, unexpected issues, etc.)

-- Add DELAYED SMS template
INSERT INTO sms_templates (key, body, is_active)
VALUES (
  'DELAYED',
  'Hi {customer_name}, we wanted to update you on your {device_make} {device_model} repair.

Unfortunately, there''s been a delay in the repair process. We''ll keep you updated on progress.

If you have any questions, please don''t hesitate to contact us.

Track your repair: {tracking_link}

New Forest Device Repairs',
  true
)
ON CONFLICT (key) 
DO UPDATE SET
  body = EXCLUDED.body,
  is_active = EXCLUDED.is_active,
  updated_at = NOW();
