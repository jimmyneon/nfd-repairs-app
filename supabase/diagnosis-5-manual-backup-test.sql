-- DIAGNOSIS 5: Manually test the backup function with detailed output
-- This will show exactly what the backup function is doing

-- First, check current state of unscheduled COLLECTED jobs
SELECT 
    job_ref,
    status,
    collected_at,
    post_collection_sms_scheduled_at,
    skip_review_request,
    customer_flag
FROM public.jobs
WHERE status = 'COLLECTED'
    AND post_collection_sms_scheduled_at IS NULL
ORDER BY collected_at DESC;

-- Now run the backup function
SELECT backup_schedule_post_collection_sms();

-- Check if any jobs were scheduled
SELECT 
    job_ref,
    status,
    collected_at,
    post_collection_sms_scheduled_at,
    skip_review_request,
    customer_flag
FROM public.jobs
WHERE status = 'COLLECTED'
    AND post_collection_sms_scheduled_at IS NOT NULL
    AND post_collection_sms_scheduled_at > NOW() - INTERVAL '5 minutes'
ORDER BY post_collection_sms_scheduled_at DESC;

-- Expected: 
-- If first query shows jobs but second shows nothing: backup function has a bug
-- If first query shows no jobs: all jobs are already scheduled or excluded (correct)
