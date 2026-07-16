-- Diagnose post-collection SMS issue - April 18th
-- Run these queries to check why SMS aren't being sent

-- 1. Check COLLECTED jobs since April 16th (after the fix was deployed)
SELECT 
    job_ref,
    customer_name,
    status,
    collected_at,
    post_collection_sms_scheduled_at,
    post_collection_sms_sent_at,
    skip_review_request,
    customer_flag,
    CASE 
        WHEN post_collection_sms_sent_at IS NOT NULL THEN '✓ SMS sent'
        WHEN post_collection_sms_scheduled_at IS NOT NULL THEN '⏳ Scheduled'
        WHEN skip_review_request = true THEN '⊗ Review disabled'
        WHEN customer_flag IN ('sensitive', 'awkward') THEN '⊗ Flagged customer'
        ELSE '⚠ NOT SCHEDULED - BUG'
    END as sms_status
FROM public.jobs
WHERE collected_at >= '2026-04-16'
ORDER BY collected_at DESC;

-- 2. Check if the cron job has run since April 16th
SELECT 
    jobid,
    runid,
    status,
    start_time,
    end_time,
    return_message
FROM cron.job_run_details
WHERE jobid = 1
    AND start_time >= '2026-04-16'
ORDER BY start_time DESC
LIMIT 20;

-- 3. Check all jobs currently scheduled but not sent
SELECT 
    job_ref,
    customer_name,
    post_collection_sms_scheduled_at,
    EXTRACT(EPOCH FROM (post_collection_sms_scheduled_at - NOW())) / 60 as minutes_until_send,
    CASE 
        WHEN post_collection_sms_scheduled_at <= NOW() THEN '🔴 OVERDUE'
        ELSE CONCAT('⏳ Will send in ', ROUND(EXTRACT(EPOCH FROM (post_collection_sms_scheduled_at - NOW())) / 60), ' min')
    END as status
FROM public.jobs
WHERE post_collection_sms_scheduled_at IS NOT NULL
    AND post_collection_sms_sent_at IS NULL
ORDER BY post_collection_sms_scheduled_at;

-- 4. Check if cron job is still active
SELECT 
    jobid,
    schedule,
    active
FROM cron.job
WHERE jobid = 1;

-- 5. Check notification config for COLLECTED status
SELECT 
    status_key,
    send_sms,
    is_active
FROM public.notification_config
WHERE status_key = 'COLLECTED';
