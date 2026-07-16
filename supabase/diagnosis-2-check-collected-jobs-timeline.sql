-- DIAGNOSIS 2: Timeline of COLLECTED jobs vs when they were scheduled
-- This shows if there's a gap between collection and scheduling

SELECT 
    job_ref,
    customer_name,
    collected_at,
    post_collection_sms_scheduled_at,
    EXTRACT(EPOCH FROM (post_collection_sms_scheduled_at - collected_at)) / 60 as minutes_between,
    skip_review_request,
    customer_flag,
    CASE 
        WHEN post_collection_sms_scheduled_at IS NULL AND skip_review_request = true THEN 'OK - Review disabled'
        WHEN post_collection_sms_scheduled_at IS NULL AND customer_flag IN ('sensitive', 'awkward') THEN 'OK - Flagged customer'
        WHEN post_collection_sms_scheduled_at IS NULL THEN '⚠ PROBLEM - Should be scheduled'
        WHEN EXTRACT(EPOCH FROM (post_collection_sms_scheduled_at - collected_at)) / 60 < 60 THEN '✓ Scheduled quickly (< 1hr)'
        WHEN EXTRACT(EPOCH FROM (post_collection_sms_scheduled_at - collected_at)) / 60 < 120 THEN '⚠ Scheduled slowly (1-2hrs)'
        ELSE '⚠ Scheduled very slowly (> 2hrs)'
    END as scheduling_status
FROM public.jobs
WHERE collected_at >= '2026-04-21'
ORDER BY collected_at ASC;

-- Expected: Jobs should be scheduled within 1 hour of collection
-- If > 1 hour: backup cron is missing runs or not working
-- If NULL: both primary and backup failed
