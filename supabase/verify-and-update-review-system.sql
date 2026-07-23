-- =====================================================
-- REVIEW SYSTEM - VERIFY & UPDATE SQL
-- Run this in Supabase SQL Editor to verify and update
-- all review system components
-- =====================================================

-- 1. Add review_link_opened_at column (tracks when customer opens SMS link)
ALTER TABLE jobs
ADD COLUMN IF NOT EXISTS review_link_opened_at TIMESTAMPTZ;

-- 2. Add review reminder columns (if not already added)
ALTER TABLE jobs
ADD COLUMN IF NOT EXISTS review_reminder_sms_scheduled_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS review_reminder_sms_sent_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS review_reminder_sms_delivery_status TEXT,
ADD COLUMN IF NOT EXISTS review_reminder_sms_body TEXT;

-- 3. Add aftercare_sms_body if missing
ALTER TABLE jobs
ADD COLUMN IF NOT EXISTS aftercare_sms_body TEXT;

-- 4. Update POST_COLLECTION_REVIEW template (simpler, with arrow pointer)
INSERT INTO sms_templates (key, body, is_active)
SELECT 'POST_COLLECTION_REVIEW',
'Hi {first_name}, hope you''re happy with your {device_model} repair!

If so, a 5-star Google review would mean the world to our small business →
{review_link}

(Takes 60 seconds — just tap the link above)

If anything''s not right, just reply here.

– New Forest Device Repairs', true
WHERE NOT EXISTS (SELECT 1 FROM sms_templates WHERE key = 'POST_COLLECTION_REVIEW');

UPDATE sms_templates SET body =
'Hi {first_name}, hope you''re happy with your {device_model} repair!

If so, a 5-star Google review would mean the world to our small business →
{review_link}

(Takes 60 seconds — just tap the link above)

If anything''s not right, just reply here.

– New Forest Device Repairs'
WHERE key = 'POST_COLLECTION_REVIEW';

-- 5. Update AFTERCARE_CHECKIN template (with arrow pointer)
INSERT INTO sms_templates (key, body, is_active)
SELECT 'AFTERCARE_CHECKIN',
'Hi {first_name}, just checking in — how''s your {device_model} getting on? Any issues at all, just reply here and we''ll sort it.

If you''re happy with the repair, a quick review really helps us →
{review_link}

New Forest Device Repairs', true
WHERE NOT EXISTS (SELECT 1 FROM sms_templates WHERE key = 'AFTERCARE_CHECKIN');

UPDATE sms_templates SET body =
'Hi {first_name}, just checking in — how''s your {device_model} getting on? Any issues at all, just reply here and we''ll sort it.

If you''re happy with the repair, a quick review really helps us →
{review_link}

New Forest Device Repairs'
WHERE key = 'AFTERCARE_CHECKIN';

-- 6. Update REVIEW_REMINDER template (with arrow pointer)
INSERT INTO sms_templates (key, body, is_active)
SELECT 'REVIEW_REMINDER',
'Hi {first_name}, just a quick follow-up — if you haven''t had a chance yet, we''d really appreciate a review. It takes 2 mins and means a lot to our small business →
{review_link}

– New Forest Device Repairs', true
WHERE NOT EXISTS (SELECT 1 FROM sms_templates WHERE key = 'REVIEW_REMINDER');

UPDATE sms_templates SET body =
'Hi {first_name}, just a quick follow-up — if you haven''t had a chance yet, we''d really appreciate a review. It takes 2 mins and means a lot to our small business →
{review_link}

– New Forest Device Repairs'
WHERE key = 'REVIEW_REMINDER';

-- 7. Ensure all templates are active
UPDATE sms_templates SET is_active = true WHERE key IN (
  'POST_COLLECTION_REVIEW', 'AFTERCARE_CHECKIN', 'REVIEW_REMINDER'
);

-- =====================================================
-- VERIFICATION QUERIES (run these separately to check)
-- =====================================================

-- Check: Are the columns added?
-- SELECT column_name, data_type FROM information_schema.columns
-- WHERE table_name = 'jobs' AND column_name IN (
--   'review_link_opened_at',
--   'review_reminder_sms_scheduled_at',
--   'review_reminder_sms_sent_at',
--   'aftercare_sms_body',
--   'post_collection_sms_scheduled_at',
--   'post_collection_sms_sent_at',
--   'review_platforms_completed'
-- );

-- Check: Are the SMS templates correct?
-- SELECT key, body, is_active FROM sms_templates
-- WHERE key IN ('POST_COLLECTION_REVIEW', 'AFTERCARE_CHECKIN', 'REVIEW_REMINDER');

-- Check: Recent jobs with review status
-- SELECT job_ref, customer_name, status,
--   post_collection_sms_scheduled_at,
--   post_collection_sms_sent_at,
--   aftercare_sms_scheduled_at,
--   aftercare_sms_sent_at,
--   review_reminder_sms_scheduled_at,
--   review_reminder_sms_sent_at,
--   review_link_opened_at,
--   review_platforms_completed
-- FROM jobs
-- WHERE status IN ('COLLECTED', 'COMPLETED')
-- ORDER BY updated_at DESC LIMIT 20;

-- Check: Jobs where SMS was scheduled but never sent (cron not working)
-- SELECT job_ref, customer_name, post_collection_sms_scheduled_at
-- FROM jobs
-- WHERE post_collection_sms_scheduled_at IS NOT NULL
--   AND post_collection_sms_sent_at IS NULL
--   AND post_collection_sms_scheduled_at < NOW() - INTERVAL '1 hour'
-- ORDER BY post_collection_sms_scheduled_at DESC;

-- Check: Jobs where aftercare was scheduled but never sent
-- SELECT job_ref, customer_name, aftercare_sms_scheduled_at
-- FROM jobs
-- WHERE aftercare_sms_scheduled_at IS NOT NULL
--   AND aftercare_sms_sent_at IS NULL
--   AND aftercare_sms_scheduled_at < NOW() - INTERVAL '1 hour'
-- ORDER BY aftercare_sms_scheduled_at DESC;

-- Check: Review link opens (are people clicking?)
-- SELECT job_ref, customer_name, review_link_opened_at, review_platforms_completed
-- FROM jobs
-- WHERE review_link_opened_at IS NOT NULL
-- ORDER BY review_link_opened_at DESC LIMIT 20;

-- Check: Jobs with review clicks
-- SELECT job_ref, customer_name, review_platforms_completed, review_link_opened_at
-- FROM jobs
-- WHERE review_platforms_completed IS NOT NULL
--   AND array_length(review_platforms_completed, 1) > 0
-- ORDER BY updated_at DESC LIMIT 20;
