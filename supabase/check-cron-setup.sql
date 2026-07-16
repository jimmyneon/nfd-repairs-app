-- ============================================
-- CHECK CRON JOB SETUP FOR REVIEW SMS
-- ============================================

-- 1. CHECK IF PG_CRON EXTENSION IS ENABLED
-- ============================================
SELECT 
    '=== PG_CRON EXTENSION ===' as section,
    extname as extension_name,
    extversion as version,
    '✓ INSTALLED' as status
FROM pg_extension
WHERE extname = 'pg_cron';

-- 2. CHECK ALL CRON JOBS
-- ============================================
SELECT 
    '=== ALL CRON JOBS ===' as section,
    jobid,
    jobname,
    schedule,
    command,
    active,
    CASE WHEN active THEN '✓ ACTIVE' ELSE '✗ INACTIVE' END as status
FROM cron.job
ORDER BY jobid;

-- 3. CHECK SPECIFICALLY FOR REVIEW/COLLECTION SMS CRON
-- ============================================
SELECT 
    '=== REVIEW/COLLECTION SMS CRON ===' as section,
    jobid,
    jobname,
    schedule,
    command,
    active,
    CASE 
        WHEN active THEN '✓ ACTIVE - Will send scheduled review SMS'
        ELSE '✗ INACTIVE - Review SMS will not be sent automatically'
    END as status
FROM cron.job
WHERE jobname LIKE '%collection%' 
   OR jobname LIKE '%review%'
   OR command LIKE '%collection%'
   OR command LIKE '%review%';

-- 4. CHECK CRON JOB RUN HISTORY (Last 10 runs)
-- ============================================
SELECT 
    '=== RECENT CRON RUNS ===' as section,
    jobid,
    runid,
    job_pid,
    database,
    username,
    command,
    status,
    return_message,
    start_time,
    end_time
FROM cron.job_run_details
ORDER BY start_time DESC
LIMIT 10;

-- 5. CHECK IF HTTP EXTENSION IS ENABLED (needed for cron to call API)
-- ============================================
SELECT 
    '=== HTTP EXTENSION ===' as section,
    extname as extension_name,
    extversion as version,
    CASE 
        WHEN extname = 'http' THEN '✓ INSTALLED - Cron can call external APIs'
        ELSE 'Status'
    END as status
FROM pg_extension
WHERE extname = 'http';

-- 6. SUMMARY - IS CRON WORKING?
-- ============================================
SELECT 
    '=== CRON SYSTEM SUMMARY ===' as section,
    (SELECT COUNT(*) FROM pg_extension WHERE extname = 'pg_cron') as pg_cron_installed,
    (SELECT COUNT(*) FROM pg_extension WHERE extname = 'http') as http_extension_installed,
    (SELECT COUNT(*) FROM cron.job WHERE active = true) as active_cron_jobs,
    (SELECT COUNT(*) FROM cron.job WHERE (jobname LIKE '%collection%' OR jobname LIKE '%review%') AND active = true) as review_cron_active,
    CASE 
        WHEN (SELECT COUNT(*) FROM pg_extension WHERE extname = 'pg_cron') = 0 THEN '✗ pg_cron not installed'
        WHEN (SELECT COUNT(*) FROM cron.job WHERE (jobname LIKE '%collection%' OR jobname LIKE '%review%') AND active = true) = 0 THEN '⚠ No active review/collection cron job'
        ELSE '✓ Cron system ready'
    END as overall_status;
