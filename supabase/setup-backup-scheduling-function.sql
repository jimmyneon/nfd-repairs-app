-- Create backup function to schedule post-collection SMS for unscheduled COLLECTED jobs
-- This runs as a cron job every hour as a backup if automatic scheduling fails

CREATE OR REPLACE FUNCTION backup_schedule_post_collection_sms()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_scheduled_count INTEGER;
BEGIN
  -- Schedule all COLLECTED jobs that haven't been scheduled
  -- Excludes jobs with skip_review_request=true or sensitive customer flags
  UPDATE public.jobs
  SET 
    post_collection_sms_scheduled_at = NOW() + INTERVAL '3 hours',
    post_collection_email_scheduled_at = NOW() + INTERVAL '3 hours'
  WHERE status = 'COLLECTED'
    AND post_collection_sms_scheduled_at IS NULL
    AND skip_review_request = false
    AND (customer_flag IS NULL OR customer_flag NOT IN ('sensitive', 'awkward'));
  
  GET DIAGNOSTICS v_scheduled_count = ROW_COUNT;
  
  RAISE NOTICE 'Backup scheduled % post-collection SMS jobs', v_scheduled_count;
END;
$$;

-- Schedule the backup function to run every hour
SELECT cron.schedule(
  'backup-schedule-post-collection-sms-hourly',
  '0 * * * *',
  'SELECT backup_schedule_post_collection_sms();'
);

-- Verify the cron job was created
SELECT * FROM cron.job WHERE jobname = 'backup-schedule-post-collection-sms-hourly';
