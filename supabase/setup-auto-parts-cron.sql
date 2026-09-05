-- Setup pg_cron for auto parts ordered status change + reassurance SMS
-- Run this in Supabase SQL Editor

-- Create function to call the auto-parts-ordered API endpoint
-- Sets a 30-second HTTP timeout (default is 5s)
CREATE OR REPLACE FUNCTION auto_parts_ordered_cron()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_cron_secret TEXT;
  v_response TEXT;
BEGIN
  v_cron_secret := 'REPLACE_WITH_CRON_SECRET_FROM_VAULT';

  PERFORM http_set_curlopt('CURLOPT_TIMEOUT', '30');
  PERFORM http_set_curlopt('CURLOPT_CONNECTTIMEOUT', '10');

  SELECT content INTO v_response
  FROM http((
    'GET',
    'https://nfd-repairs-app.vercel.app/api/jobs/auto-parts-ordered',
    ARRAY[http_header('Authorization', 'Bearer ' || v_cron_secret)],
    'application/json',
    ''
  )::http_request);

  RAISE NOTICE 'Auto parts ordered cron executed. Response length: %', length(v_response);
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'Auto parts ordered cron error: %', SQLERRM;
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
