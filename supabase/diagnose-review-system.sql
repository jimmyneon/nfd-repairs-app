-- =====================================================
-- REVIEW SYSTEM DIAGNOSTICS
-- Run these one by one in Supabase SQL Editor
-- =====================================================

-- 1. SMS TEMPLATES — Are they all there and active?
SELECT key, is_active, LEFT(body, 80) as body_preview
FROM sms_templates
WHERE key IN ('POST_COLLECTION_REVIEW', 'AFTERCARE_CHECKIN', 'REVIEW_REMINDER')
ORDER BY key;

-- 2. COLUMNS — Are all the review columns present?
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'jobs'
  AND column_name IN (
    'post_collection_sms_scheduled_at',
    'post_collection_sms_sent_at',
    'post_collection_sms_delivery_status',
    'aftercare_sms_scheduled_at',
    'aftercare_sms_sent_at',
    'aftercare_sms_delivery_status',
    'aftercare_sms_body',
    'review_reminder_sms_scheduled_at',
    'review_reminder_sms_sent_at',
    'review_reminder_sms_delivery_status',
    'review_reminder_sms_body',
    'review_link_opened_at',
    'review_platforms_completed',
    'last_review_platform_requested',
    'post_collection_email_scheduled_at',
    'post_collection_email_sent_at'
  )
ORDER BY column_name;

-- 3. RECENT COLLECTED/COMPLETED JOBS — What's the review status?
SELECT
  job_ref,
  customer_name,
  status,
  repair_outcome,
  skip_review_request,
  customer_flag,
  post_collection_sms_scheduled_at,
  post_collection_sms_sent_at,
  post_collection_sms_delivery_status,
  aftercare_sms_scheduled_at,
  aftercare_sms_sent_at,
  review_reminder_sms_scheduled_at,
  review_reminder_sms_sent_at,
  review_link_opened_at,
  review_platforms_completed
FROM jobs
WHERE status IN ('COLLECTED', 'COMPLETED')
ORDER BY updated_at DESC
LIMIT 30;

-- 4. JOBS SCHEDULED BUT NEVER SENT — These prove cron isn't picking them up
SELECT
  job_ref,
  customer_name,
  post_collection_sms_scheduled_at,
  extract(epoch FROM (now() - post_collection_sms_scheduled_at))/3600 as hours_overdue
FROM jobs
WHERE post_collection_sms_scheduled_at IS NOT NULL
  AND post_collection_sms_sent_at IS NULL
ORDER BY post_collection_sms_scheduled_at DESC
LIMIT 20;

-- 5. AFTERCARE SCHEDULED BUT NEVER SENT
SELECT
  job_ref,
  customer_name,
  aftercare_sms_scheduled_at,
  extract(epoch FROM (now() - aftercare_sms_scheduled_at))/3600 as hours_overdue
FROM jobs
WHERE aftercare_sms_scheduled_at IS NOT NULL
  AND aftercare_sms_sent_at IS NULL
ORDER BY aftercare_sms_scheduled_at DESC
LIMIT 20;

-- 6. REVIEW REMINDER SCHEDULED BUT NEVER SENT
SELECT
  job_ref,
  customer_name,
  review_reminder_sms_scheduled_at,
  extract(epoch FROM (now() - review_reminder_sms_scheduled_at))/3600 as hours_overdue
FROM jobs
WHERE review_reminder_sms_scheduled_at IS NOT NULL
  AND review_reminder_sms_sent_at IS NULL
ORDER BY review_reminder_sms_scheduled_at DESC
LIMIT 20;

-- 7. JOBS WITH NO SCHEDULING AT ALL — Should have been scheduled on collection
SELECT
  job_ref,
  customer_name,
  status,
  updated_at,
  repair_outcome,
  skip_review_request,
  customer_flag
FROM jobs
WHERE status IN ('COLLECTED', 'COMPLETED')
  AND post_collection_sms_scheduled_at IS NULL
  AND post_collection_sms_sent_at IS NULL
  AND (skip_review_request IS NULL OR skip_review_request = false)
  AND (customer_flag IS NULL OR customer_flag NOT IN ('sensitive', 'awkward'))
  AND (repair_outcome IS NULL OR repair_outcome = 'repaired')
ORDER BY updated_at DESC
LIMIT 20;

-- 8. RECENT JOB EVENTS — See if schedule-collection-sms or cron ran
SELECT
  je.created_at,
  j.job_ref,
  je.type,
  LEFT(je.message, 120) as message_preview
FROM job_events je
JOIN jobs j ON je.job_id = j.id
WHERE je.message ILIKE '%review%'
   OR je.message ILIKE '%aftercare%'
   OR je.message ILIKE '%collection%'
   OR je.message ILIKE '%SMS%'
   OR je.message ILIKE '%cron%'
ORDER BY je.created_at DESC
LIMIT 30;

-- 9. JOBS WHERE SMS WAS SENT — Check delivery status
SELECT
  job_ref,
  customer_name,
  post_collection_sms_sent_at,
  post_collection_sms_delivery_status,
  review_link_opened_at,
  review_platforms_completed
FROM jobs
WHERE post_collection_sms_sent_at IS NOT NULL
ORDER BY post_collection_sms_sent_at DESC
LIMIT 20;

-- 10. REVIEW LINK OPENS — Are people clicking?
SELECT
  job_ref,
  customer_name,
  review_link_opened_at,
  review_platforms_completed,
  post_collection_sms_sent_at
FROM jobs
WHERE review_link_opened_at IS NOT NULL
ORDER BY review_link_opened_at DESC
LIMIT 20;

-- 11. SUMMARY COUNTS — Quick overview
SELECT
  COUNT(*) FILTER (WHERE status IN ('COLLECTED','COMPLETED')) as total_collected,
  COUNT(*) FILTER (WHERE post_collection_sms_scheduled_at IS NOT NULL) as sms_scheduled,
  COUNT(*) FILTER (WHERE post_collection_sms_sent_at IS NOT NULL) as sms_sent,
  COUNT(*) FILTER (WHERE post_collection_sms_scheduled_at IS NOT NULL AND post_collection_sms_sent_at IS NULL) as sms_scheduled_not_sent,
  COUNT(*) FILTER (WHERE aftercare_sms_scheduled_at IS NOT NULL AND aftercare_sms_sent_at IS NULL) as aftercare_not_sent,
  COUNT(*) FILTER (WHERE review_reminder_sms_scheduled_at IS NOT NULL AND review_reminder_sms_sent_at IS NULL) as reminder_not_sent,
  COUNT(*) FILTER (WHERE review_link_opened_at IS NOT NULL) as link_opened,
  COUNT(*) FILTER (WHERE review_platforms_completed IS NOT NULL AND array_length(review_platforms_completed, 1) > 0) as review_clicked
FROM jobs
WHERE status IN ('COLLECTED', 'COMPLETED');
