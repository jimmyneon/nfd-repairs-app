-- Undo the incorrect manual scheduling for April 8-10 jobs
-- This will clear the scheduled times so we can schedule the correct jobs

UPDATE public.jobs
SET 
    post_collection_sms_scheduled_at = NULL,
    post_collection_email_scheduled_at = NULL
WHERE status = 'COLLECTED'
    AND collected_at >= '2026-04-08'
    AND post_collection_sms_scheduled_at = '2026-04-11 14:04:21.049879+00'
RETURNING 
    job_ref, 
    customer_name, 
    collected_at;
