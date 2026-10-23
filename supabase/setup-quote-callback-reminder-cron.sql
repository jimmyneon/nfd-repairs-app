-- Setup pg_cron for the personalised-quote callback reminder
-- Run this in Supabase SQL Editor
--
-- Alex promises quote-request callers the team will get back to them
-- "usually within the hour". This job calls the reminder endpoint every
-- 30 minutes; the route itself gates on opening hours, only flags pending
-- unpriced/unconverted quote enquiries older than an hour, and dedupes so
-- each enquiry is only reminded once.
--
-- Requirements:
--   - pg_cron and http extensions (already enabled for other jobs)
--   - CRON_SECRET env var on Vercel must match the secret below

-- Remove existing job if it exists (safe re-run)
DO $$
BEGIN
    PERFORM cron.unschedule('quote-callback-reminder-every-30-min');
EXCEPTION
    WHEN OTHERS THEN
        NULL;
END $$;

-- Create function to call the callback-reminder endpoint
CREATE OR REPLACE FUNCTION run_quote_callback_reminder()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_cron_secret TEXT;
    v_response TEXT;
BEGIN
    -- This secret MUST match the CRON_SECRET env var on Vercel
    v_cron_secret := 'REPLACE_WITH_CRON_SECRET_FROM_VAULT';

    PERFORM http_set_curlopt('CURLOPT_TIMEOUT', '30');
    PERFORM http_set_curlopt('CURLOPT_CONNECTTIMEOUT', '10');

    SELECT content INTO v_response
    FROM http((
        'GET',
        'https://nfd-repairs-app.vercel.app/api/enquiries/quote-callback-reminder',
        ARRAY[http_header('Authorization', 'Bearer ' || v_cron_secret)],
        'application/json',
        ''
    )::http_request);

    RAISE NOTICE 'Quote callback reminder cron executed. Response length: %', length(v_response);
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE 'Quote callback reminder cron error: %', SQLERRM;
END;
$$;

-- Schedule the job to run every 30 minutes
SELECT cron.schedule(
    'quote-callback-reminder-every-30-min',
    '*/30 * * * *',
    'SELECT run_quote_callback_reminder();'
);

-- Verify the cron job was created
SELECT jobid, jobname, schedule, active FROM cron.job WHERE jobname = 'quote-callback-reminder-every-30-min';
