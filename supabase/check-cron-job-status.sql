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
    status,
    start_time,
    end_time,
    runtime,
    return_message,
    error_message
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
