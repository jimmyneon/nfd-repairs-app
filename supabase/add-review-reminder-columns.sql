-- Add review reminder SMS tracking columns to jobs table
-- Run this in Supabase SQL Editor
--
-- Review reminder SMS: sent 5 days after collection, ONLY if the customer
-- hasn't already clicked a review link (tracked via review_platforms_completed).

ALTER TABLE jobs
ADD COLUMN IF NOT EXISTS review_reminder_sms_scheduled_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS review_reminder_sms_sent_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS review_reminder_sms_delivery_status TEXT,
ADD COLUMN IF NOT EXISTS review_reminder_sms_body TEXT;

-- Also add aftercare_sms_body if it doesn't exist (was missing from original migration)
ALTER TABLE jobs
ADD COLUMN IF NOT EXISTS aftercare_sms_body TEXT;

-- Insert the REVIEW_REMINDER SMS template (if it doesn't exist)
INSERT INTO sms_templates (key, body, is_active)
VALUES (
  'REVIEW_REMINDER',
  'Hi {first_name}, just a quick follow-up — if you haven''t had a chance yet, we''d really appreciate a review. It takes 2 mins and means a lot to our small business →
{review_link}

– New Forest Device Repairs',
  true
)
ON CONFLICT (key) DO UPDATE
SET body = EXCLUDED.body,
    is_active = true;

-- Update the AFTERCARE_CHECKIN template to include the review link variable
-- (the template engine will replace {review_link} with the actual link)
UPDATE sms_templates
SET body = 'Hi {first_name}, just checking in — how''s your {device_model} getting on? Any issues at all, just reply here and we''ll sort it.

If you''re happy with the repair, a quick review really helps us →
{review_link}

New Forest Device Repairs'
WHERE key = 'AFTERCARE_CHECKIN' AND is_active = true;
