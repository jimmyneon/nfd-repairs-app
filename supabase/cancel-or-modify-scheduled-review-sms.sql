-- ============================================
-- CANCEL OR MODIFY SCHEDULED REVIEW SMS
-- ============================================

-- 1. VIEW ALL SCHEDULED REVIEW SMS (not sent yet)
-- ============================================
SELECT 
    job_ref,
    customer_name,
    customer_phone,
    post_collection_sms_scheduled_at as scheduled_time,
    skip_review_request,
    CASE 
        WHEN post_collection_sms_scheduled_at < NOW() THEN 'Ready to send (waiting for cron)'
        ELSE 'Scheduled for future'
    END as status
FROM jobs
WHERE post_collection_sms_scheduled_at IS NOT NULL
    AND post_collection_sms_sent_at IS NULL
ORDER BY post_collection_sms_scheduled_at;

-- 2. CANCEL REVIEW SMS FOR A SPECIFIC JOB
-- ============================================
-- Replace 'NFD-20260330-001' with the actual job_ref you want to cancel

/*
UPDATE jobs
SET skip_review_request = true
WHERE job_ref = 'NFD-20260330-001'
RETURNING job_ref, customer_name, skip_review_request;
*/

-- 3. UNSCHEDULE (REMOVE SCHEDULED TIME) FOR A SPECIFIC JOB
-- ============================================
-- This removes the scheduled time completely

/*
UPDATE jobs
SET post_collection_sms_scheduled_at = NULL
WHERE job_ref = 'NFD-20260330-001'
RETURNING job_ref, customer_name, post_collection_sms_scheduled_at;
*/

-- 4. CHANGE THE SCHEDULED TIME FOR A SPECIFIC JOB
-- ============================================
-- Example: Change to send tomorrow at 2pm

/*
UPDATE jobs
SET post_collection_sms_scheduled_at = CURRENT_DATE + INTERVAL '1 day' + INTERVAL '14 hours'
WHERE job_ref = 'NFD-20260330-001'
RETURNING job_ref, customer_name, post_collection_sms_scheduled_at;
*/

-- 5. CANCEL ALL PENDING REVIEW SMS
-- ============================================
-- This will cancel all scheduled review SMS that haven't been sent yet

/*
UPDATE jobs
SET skip_review_request = true
WHERE post_collection_sms_scheduled_at IS NOT NULL
    AND post_collection_sms_sent_at IS NULL
RETURNING job_ref, customer_name;
*/

-- 6. VERIFY THE CHANGE
-- ============================================
-- Run this after making changes to verify

SELECT 
    job_ref,
    customer_name,
    post_collection_sms_scheduled_at,
    skip_review_request,
    post_collection_sms_sent_at
FROM jobs
WHERE job_ref IN ('NFD-20260330-001', 'NFD-20260330-003', 'NFD-20260330-004', 'NFD-20260327-002')
ORDER BY job_ref;
