-- DIAGNOSIS 6: Why did the 14:00 backup run not schedule the jobs?
-- The jobs were collected at 13:39-13:42, so 14:00 backup should have caught them

-- Check the exact state of jobs at 14:00
-- We can't go back in time, but we can check if there's something wrong with the backup function logic

-- Test: Temporarily unschedule one job and see if backup function catches it
UPDATE public.jobs
SET post_collection_sms_scheduled_at = NULL
WHERE job_ref = 'NFD-20260420-002';

-- Now check if backup function would schedule it
SELECT 
    job_ref,
    status,
    collected_at,
    post_collection_sms_scheduled_at,
    skip_review_request,
    customer_flag,
    CASE 
        WHEN status = 'COLLECTED' 
            AND post_collection_sms_scheduled_at IS NULL 
            AND skip_review_request = false 
            AND (customer_flag IS NULL OR customer_flag NOT IN ('sensitive', 'awkward'))
        THEN 'YES - Should be scheduled by backup'
        ELSE 'NO - Would be skipped'
    END as would_backup_schedule
FROM public.jobs
WHERE job_ref = 'NFD-20260420-002';

-- Run backup function
SELECT backup_schedule_post_collection_sms();

-- Check if it was scheduled
SELECT 
    job_ref,
    post_collection_sms_scheduled_at
FROM public.jobs
WHERE job_ref = 'NFD-20260420-002';
