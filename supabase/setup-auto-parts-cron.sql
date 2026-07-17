-- Setup pg_cron for auto parts ordered status change + reassurance SMS
-- Run this in Supabase SQL Editor

-- Create function to call the auto-parts-ordered API endpoint
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

-- Schedule the cron job to run every 15 minutes
SELECT cron.schedule(
  'auto-parts-ordered-every-15-min',
  '*/15 * * * *',
  'SELECT auto_parts_ordered_cron();'
);

-- Verify the cron job was created
SELECT * FROM cron.job WHERE jobname = 'auto-parts-ordered-every-15-min';

-- Check cron job run history (after it runs)
-- SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 10;
