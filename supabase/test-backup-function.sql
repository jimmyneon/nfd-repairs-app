-- Test the backup function manually
SELECT backup_schedule_post_collection_sms();

-- Check if the 6 missing jobs were scheduled
SELECT 
    job_ref,
    customer_name,
    collected_at,
    post_collection_sms_scheduled_at,
    post_collection_sms_sent_at
FROM public.jobs
WHERE collected_at >= '2026-04-16'
    AND post_collection_sms_scheduled_at IS NOT NULL
ORDER BY post_collection_sms_scheduled_at DESC;
/././//////A`/////////