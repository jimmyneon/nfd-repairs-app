-- Setup pg_cron for daily 17TRACK tracking sync
-- Run this in Supabase SQL Editor

-- Create function to call the tracking sync API endpoint
CREATE OR REPLACE FUNCTION tracking_sync_cron()
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
    'https://nfd-repairs-app.vercel.app/api/tracking/sync',
    ARRAY[http_header('Authorization', 'Bearer ' || v_cron_secret)],
    'application/json',
    ''
  )::http_request);
  
  RAISE NOTICE 'Tracking sync cron executed. Response: %', v_response;
END;
$$;

-- Schedule the cron job to run once daily at 9am UTC (10am BST)
SELECT cron.schedule(
  'tracking-sync-daily',
  '0 9 * * *',
  'SELECT tracking_sync_cron();'
);

-- Verify the cron job was created
SELECT * FROM cron.job WHERE jobname = 'tracking-sync-daily';

-- Check cron job run history (after it runs)
-- SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 10;
