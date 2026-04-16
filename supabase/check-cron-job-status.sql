-- Check if Supabase pg_cron is set up and running
-- Run this in Supabase SQL Editor

-- 1. Check if pg_cron extension is enabled
SELECT 
    extname as extension_name,
    extversion as version
FROM pg_extension
WHERE extname = 'pg_cron';

-- 2. Check if cron job exists
SELECT 
    jobid,
    schedule,
    command,
    nodename,
    nodeport,
    database,
    active
FROM cron.job
WHERE command ILIKE '%send-collection-sms%';

-- 3. Check cron job run history (last 10 runs)
SELECT 
    jobid,
    runid,
    status,
    start_time,
    end_time,
    return_message
FROM cron.job_run_details
WHERE jobid IN (
    SELECT jobid 
    FROM cron.job 
    WHERE command ILIKE '%send-collection-sms%'
)
ORDER BY start_time DESC
LIMIT 10;

-- 4. Check all cron jobs
SELECT * FROM cron.job;

-- 5. Check if http extension is enabled (needed for cron to call API)
SELECT 
    extname as extension_name,
    extversion as version
FROM pg_extension
WHERE extname = 'http';

-- 6. Check if there are jobs scheduled to be sent (overdue or upcoming)
SELECT 
    job_ref,
    customer_name,
    post_collection_sms_scheduled_at,
    post_collection_sms_sent_at,
    CASE 
        WHEN post_collection_sms_sent_at IS NOT NULL THEN 'Already sent'
        WHEN post_collection_sms_scheduled_at <= NOW() THEN 'OVERDUE - should send now'
        ELSE CONCAT('Scheduled for ', TO_CHAR(post_collection_sms_scheduled_at, 'YYYY-MM-DD HH24:MI'))
    END as status
FROM public.jobs
WHERE post_collection_sms_scheduled_at IS NOT NULL
ORDER BY post_collection_sms_scheduled_at DESC
LIMIT 20;

-- 7. Check recent COLLECTED jobs that haven't been scheduled (last 7 days)
SELECT 
    job_ref,
    customer_name,
    status,
    collected_at,
    post_collection_sms_scheduled_at,
    post_collection_sms_sent_at,
    skip_review_request,
    customer_flag
FROM public.jobs
WHERE status = 'COLLECTED'
    AND collected_at >= NOW() - INTERVAL '7 days'
    AND post_collection_sms_scheduled_at IS NULL
ORDER BY collected_at DESC;
