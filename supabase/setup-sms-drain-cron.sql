-- ============================================================
-- SETUP CRON JOB: DRAIN PENDING SMS QUEUE (every 5 minutes)
-- ============================================================
-- This is the THIRD cron job (alongside send-collection-sms
-- and auto-parts-ordered). It drains the general PENDING
-- sms_logs queue - catching any SMS that failed to send
-- in-band (e.g. MacroDroid was down, network error, etc).
--
-- Without this cron, any SMS that fails the initial send
-- stays stuck as PENDING forever.
--
-- PREREQUISITES:
--   - pg_cron extension enabled
--   - http extension enabled
--   - CRON_SECRET env var on Vercel must match the secret below
-- ============================================================

-- Enable extensions if not already enabled
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS http;

-- Remove existing job if it exists (safe re-run)
DO $$
BEGIN
    PERFORM cron.unschedule('drain-pending-sms-every-5-min');
EXCEPTION
    WHEN OTHERS THEN
        NULL;
END $$;

-- Create function to call the SMS drain endpoint
CREATE OR REPLACE FUNCTION drain_pending_sms()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_cron_secret TEXT;
    v_response TEXT;
BEGIN
    -- This secret MUST match the CRON_SECRET env var on Vercel
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

-- Schedule the cron job to run every 5 minutes
SELECT cron.schedule(
    'drain-pending-sms-every-5-min',
    '*/5 * * * *',
    'SELECT drain_pending_sms();'
);

-- Verify the cron job was created
SELECT jobid, jobname, schedule, active FROM cron.job WHERE jobname = 'drain-pending-sms-every-5-min';

-- Check cron job run history (after it runs)
-- SELECT * FROM cron.job_run_details WHERE jobid IN (
--     SELECT jobid FROM cron.job WHERE jobname = 'drain-pending-sms-every-5-min'
-- ) ORDER BY start_time DESC LIMIT 10;
