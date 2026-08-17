-- ============================================================
-- DIAGNOSE & FIX ALL CRON JOBS
-- ============================================================
-- The 2 existing cron jobs (send-collection-sms and
-- auto-parts-ordered) have been failing because:
--
--   1. CRON_SECRET was not set on Vercel (env var missing)
--      → every call returned 401 Unauthorized
--
--   2. The pg_cron SQL hardcodes the secret, but the Vercel
--      env var didn't match (or was unset)
--
-- This script:
--   1. Shows the current state of all cron jobs
--   2. Shows recent failure history
--   3. Re-creates all cron functions with the correct secret
--
-- ACTION REQUIRED BEFORE RUNNING:
--   → Set CRON_SECRET=74f5d06ea99badfeb73748de6b4efbc96f6c8aee489aafb1d2d7a573eb221263
--     in your Vercel project environment variables
--   → Redeploy the app so the env var takes effect
-- ============================================================

-- 1. Check pg_cron extension
SELECT extname, extversion FROM pg_extension WHERE extname = 'pg_cron';

-- 2. Check http extension (needed for cron to call API)
SELECT extname, extversion FROM pg_extension WHERE extname = 'http';

-- 3. List ALL cron jobs and their status
SELECT
    jobid,
    jobname,
    schedule,
    command,
    active,
    database
FROM cron.job
ORDER BY jobid;

-- 4. Check recent cron run history (last 20 runs across all jobs)
SELECT
    jobid,
    runid,
    status,
    start_time,
    end_time,
    LEFT(return_message, 200) as return_message_preview
FROM cron.job_run_details
ORDER BY start_time DESC
LIMIT 20;

-- 5. Count runs by status (last 7 days)
SELECT
    j.jobname,
    r.status,
    COUNT(*) as run_count,
    MAX(r.start_time) as last_run
FROM cron.job_run_details r
JOIN cron.job j ON r.jobid = j.jobid
WHERE r.start_time >= NOW() - INTERVAL '7 days'
GROUP BY j.jobname, r.status
ORDER BY j.jobname, r.status;

-- ============================================================
-- RE-CREATE ALL CRON FUNCTIONS (with correct secret)
-- ============================================================

-- Ensure extensions are enabled
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS http;

-- --- Cron 1: send-collection-sms (every 15 min) ---
CREATE OR REPLACE FUNCTION send_scheduled_collection_sms()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_cron_secret TEXT;
    v_response TEXT;
BEGIN
    v_cron_secret := '74f5d06ea99badfeb73748de6b4efbc96f6c8aee489aafb1d2d7a573eb221263';

    SELECT content INTO v_response
    FROM http((
        'GET',
        'https://nfd-repairs-app.vercel.app/api/jobs/send-collection-sms',
        ARRAY[http_header('Authorization', 'Bearer ' || v_cron_secret)],
        'application/json',
        ''
    )::http_request);

    RAISE NOTICE 'Collection SMS cron executed. Response: %', v_response;
END;
$$;

-- --- Cron 2: auto-parts-ordered (every 15 min) ---
CREATE OR REPLACE FUNCTION auto_parts_ordered_cron()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_cron_secret TEXT;
    v_response TEXT;
BEGIN
    v_cron_secret := '74f5d06ea99badfeb73748de6b4efbc96f6c8aee489aafb1d2d7a573eb221263';

    SELECT content INTO v_response
    FROM http((
        'GET',
        'https://nfd-repairs-app.vercel.app/api/jobs/auto-parts-ordered',
        ARRAY[http_header('Authorization', 'Bearer ' || v_cron_secret)],
        'application/json',
        ''
    )::http_request);

    RAISE NOTICE 'Auto parts ordered cron executed. Response: %', v_response;
END;
$$;

-- --- Cron 3: drain-pending-sms (every 5 min) ---
CREATE OR REPLACE FUNCTION drain_pending_sms()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_cron_secret TEXT;
    v_response TEXT;
BEGIN
    v_cron_secret := '74f5d06ea99badfeb73748de6b4efbc96f6c8aee489aafb1d2d7a573eb221263';

    SELECT content INTO v_response
    FROM http((
        'GET',
        'https://nfd-repairs-app.vercel.app/api/sms/send-all',
        ARRAY[http_header('Authorization', 'Bearer ' || v_cron_secret)],
        'application/json',
        ''
    )::http_request);

    RAISE NOTICE 'SMS drain cron executed. Response: %', v_response;
END;
$$;

-- ============================================================
-- RE-SCHEDULE ALL CRON JOBS (unschedule first for safe re-run)
-- ============================================================

DO $$
BEGIN
    PERFORM cron.unschedule('send-collection-sms-every-15-min');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$
BEGIN
    PERFORM cron.unschedule('auto-parts-ordered-every-15-min');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$
BEGIN
    PERFORM cron.unschedule('drain-pending-sms-every-5-min');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- Schedule all 3 cron jobs
SELECT cron.schedule(
    'send-collection-sms-every-15-min',
    '*/15 * * * *',
    'SELECT send_scheduled_collection_sms();'
);

SELECT cron.schedule(
    'auto-parts-ordered-every-15-min',
    '*/15 * * * *',
    'SELECT auto_parts_ordered_cron();'
);

SELECT cron.schedule(
    'drain-pending-sms-every-5-min',
    '*/5 * * * *',
    'SELECT drain_pending_sms();'
);

-- Verify all cron jobs are scheduled and active
SELECT
    jobid,
    jobname,
    schedule,
    active
FROM cron.job
ORDER BY jobname;
