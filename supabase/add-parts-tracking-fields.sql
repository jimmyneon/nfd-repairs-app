-- Add parts tracking fields to jobs table
-- Run this in Supabase SQL Editor

-- Add columns for parts tracking info (staff enters these when ordering parts)
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS parts_supplier TEXT;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS parts_tracking_number TEXT;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS parts_tracking_url TEXT;

-- Track whether a reassurance SMS has been sent for long-running PARTS_ORDERED status
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS parts_reassurance_sms_sent_at TIMESTAMPTZ;

-- Note: parts_ordered_at and parts_expected_at columns already exist in the schema

-- Add PARTS_REASSURANCE SMS template
-- This is sent automatically after 3 days in PARTS_ORDERED status with no change
INSERT INTO sms_templates (key, body, is_active)
VALUES (
  'PARTS_REASSURANCE',
  'Hi {{first_name}}, just an update on your {{device_make}} {{device_model}} repair ({{job_ref}}) - we''re still waiting for parts to arrive. They''re on order and we''ll text you the moment they arrive and your repair starts. No action needed from you. Track here: {{tracking_link}}',
  true
)
ON CONFLICT (key) DO UPDATE SET
  body = EXCLUDED.body,
  is_active = true;

-- Verify the columns were added
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'jobs' 
AND column_name IN ('parts_supplier', 'parts_tracking_number', 'parts_tracking_url', 'parts_reassurance_sms_sent_at', 'parts_ordered_at', 'parts_expected_at')
ORDER BY column_name;
