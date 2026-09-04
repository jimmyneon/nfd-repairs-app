-- Setup pg_cron for Post-Collection SMS Automation
-- Run this in Supabase SQL Editor

-- Step 1: Enable pg_cron extension
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS http;

-- Step 2: Create function to send scheduled SMS
-- Sets a 30-second HTTP timeout (default is 5s, which is too short
-- for Vercel functions that process multiple messages with delays)
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

    PERFORM http_set_curlopt('CURLOPT_TIMEOUT', '30');
    PERFORM http_set_curlopt('CURLOPT_CONNECTTIMEOUT', '10');

    SELECT content INTO v_response
    FROM http((
        'GET',
        'https://nfd-repairs-app.vercel.app/api/jobs/send-collection-sms',
        ARRAY[http_header('Authorization', 'Bearer ' || v_cron_secret)],
        'application/json',
        ''
    )::http_request);

    RAISE NOTICE 'Cron job executed. Response length: %', length(v_response);
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE 'Cron job error: %', SQLERRM;
END;
$$;

-- Step 3: Schedule the cron job to run every 15 minutes
SELECT cron.schedule(
    'send-collection-sms-every-15-min',
    '*/15 * * * *',
    'SELECT send_scheduled_collection_sms();'
);

-- Step 4: Verify the cron job was created
SELECT jobid, jobname, schedule, active FROM cron.job WHERE jobname = 'send-collection-sms-every-15-min';
