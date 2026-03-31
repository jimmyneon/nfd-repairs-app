-- Setup cron job to auto-close collected jobs after 3 days
-- Run this in Supabase SQL Editor
-- Requires pg_cron extension (should already be enabled)

-- Enable pg_cron if not already enabled
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Remove existing job if it exists (safe - won't error if job doesn't exist)
DO $$
BEGIN
    PERFORM cron.unschedule('auto-close-collected-jobs');
EXCEPTION
    WHEN OTHERS THEN
        -- Job doesn't exist, that's fine
        NULL;
END $$;

-- Schedule auto-close job to run every hour
SELECT cron.schedule(
    'auto-close-collected-jobs',
    '0 * * * *', -- Every hour at minute 0
    $$SELECT auto_close_collected_jobs()$$
);

-- Verify the cron job was created
SELECT * FROM cron.job WHERE jobname = 'auto-close-collected-jobs';
