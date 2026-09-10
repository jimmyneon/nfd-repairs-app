-- ============================================================
-- SETUP CRON: REPAIR QUOTE REMINDERS (every 15 minutes)
-- ============================================================
-- Apply AFTER supabase/add-quote-reminders.sql and AFTER the
-- /api/enquiries/send-plan-reminders endpoint is deployed/tested.
--
-- Customers choose when they hope to get the repair done. The API stores
-- reminder_at two days before that date; this cron simply sends reminders
-- once they become due.
--
-- Replace REPLACE_WITH_CRON_SECRET_FROM_VAULT with the same
-- CRON_SECRET used by the existing scheduled app endpoints at execution time.
-- NEVER commit the real secret.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS http;

DO $$
BEGIN
    PERFORM cron.unschedule('send-quote-plan-reminders-every-15-min');
EXCEPTION
    WHEN OTHERS THEN
        NULL;
END $$;

CREATE OR REPLACE FUNCTION send_quote_plan_reminders()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_cron_secret TEXT;
    v_response TEXT;
BEGIN
    v_cron_secret := 'REPLACE_WITH_CRON_SECRET_FROM_VAULT';

    PERFORM http_set_curlopt('CURLOPT_TIMEOUT', '60');
    PERFORM http_set_curlopt('CURLOPT_CONNECTTIMEOUT', '10');

    SELECT content INTO v_response
    FROM http((
        'GET',
        'https://nfd-repairs-app.vercel.app/api/enquiries/send-plan-reminders',
        ARRAY[http_header('Authorization', 'Bearer ' || v_cron_secret)],
        'application/json',
        ''
    )::http_request);

    RAISE NOTICE 'Quote reminder cron executed. Response length: %', length(v_response);
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE 'Quote reminder cron error: %', SQLERRM;
END;
$$;

SELECT cron.schedule(
    'send-quote-plan-reminders-every-15-min',
    '*/15 * * * *',
    'SELECT send_quote_plan_reminders();'
);

SELECT jobid, jobname, schedule, active
FROM cron.job
WHERE jobname = 'send-quote-plan-reminders-every-15-min';
