-- Setup pg_cron for Post-Collection SMS Automation
-- Run this in Supabase SQL Editor

-- Step 1: Enable pg_cron extension
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Step 2: Create function to send scheduled SMS
CREATE OR REPLACE FUNCTION send_scheduled_collection_sms()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_cron_secret TEXT;
  v_response TEXT;
BEGIN
  -- Get CRON_SECRET from environment (you'll set this in Supabase dashboard)
  -- For now, we'll use the hardcoded secret
  v_cron_secret := '74f5d06ea99badfeb73748de6b4efbc96f6c8aee489aafb1d2d7a573eb221263';
  
  -- Call the API endpoint using http extension
  SELECT content INTO v_response
  FROM http((
    'GET',
    'https://nfd-repairs-app.vercel.app/api/jobs/send-collection-sms',
    ARRAY[http_header('Authorization', 'Bearer ' || v_cron_secret)],
    'application/json',
    ''
  )::http_request);
  
  -- Log the response (optional)
  RAISE NOTICE 'Cron job executed. Response: %', v_response;
END;
$$;

-- Step 3: Schedule the cron job to run every 15 minutes
SELECT cron.schedule(
  'send-collection-sms-every-15-min',  -- Job name
  '*/15 * * * *',                       -- Every 15 minutes
  'SELECT send_scheduled_collection_sms();'
);

-- Step 4: Verify the cron job was created
SELECT * FROM cron.job;

-- Step 5: Check cron job run history (after it runs)
-- SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 10;
