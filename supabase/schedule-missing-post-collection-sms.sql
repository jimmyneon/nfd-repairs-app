-- Manually schedule post-collection SMS for jobs collected since April 1st that weren't scheduled
-- This fixes the 8 jobs that missed scheduling due to the bug

UPDATE public.jobs
SET 
    post_collection_sms_scheduled_at = NOW() + INTERVAL '3 hours',
    post_collection_email_scheduled_at = NOW() + INTERVAL '3 hours'
WHERE status = 'COLLECTED'
    AND collected_at >= '2026-04-01'
    AND post_collection_sms_scheduled_at IS NULL
RETURNING 
    job_ref, 
    customer_name, 
    collected_at, 
    post_collection_sms_scheduled_at as scheduled_time;
