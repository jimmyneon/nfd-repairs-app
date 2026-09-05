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
-- Sets a 30-second HTTP timeout (default is 5s, which is too short
-- for Vercel functions that may take 10-20s to process a batch)
CREATE OR REPLACE FUNCTION drain_pending_sms()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_cron_secret TEXT;
    v_response TEXT;
BEGIN
    v_cron_secret := 'REPLACE_WITH_CRON_SECRET_FROM_VAULT';

    -- Set HTTP timeout to 30 seconds (default is 5s)
    PERFORM http_set_curlopt('CURLOPT_TIMEOUT', '30');
    PERFORM http_set_curlopt('CURLOPT_CONNECTTIMEOUT', '10');

    SELECT content INTO v_response
    FROM http((
        'GET',
        'https://nfd-repairs-app.vercel.app/api/sms/send-all',
        ARRAY[http_header('Authorization', 'Bearer ' || v_cron_secret)],
        'application/json',
        ''
    )::http_request);

    RAISE NOTICE 'SMS drain cron executed. Response length: %', length(v_response);
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE 'SMS drain cron error: %', SQLERRM;
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
