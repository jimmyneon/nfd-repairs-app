-- Auto-delete device passcodes 7 days after job completion
-- This ensures customer privacy and security compliance

-- Add scheduled deletion timestamp field (already exists from previous migration)
-- ALTER TABLE jobs ADD COLUMN IF NOT EXISTS passcode_deletion_scheduled_at TIMESTAMPTZ;

-- Function to schedule passcode deletion when job is completed
CREATE OR REPLACE FUNCTION schedule_passcode_deletion()
RETURNS TRIGGER AS $$
BEGIN
  -- Only schedule deletion if job is being marked as COMPLETED
  IF NEW.status = 'COMPLETED' AND OLD.status != 'COMPLETED' THEN
    -- Schedule deletion for 7 days from now
    NEW.passcode_deletion_scheduled_at := NOW() + INTERVAL '7 days';
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically schedule passcode deletion on job completion
DROP TRIGGER IF EXISTS trigger_schedule_passcode_deletion ON jobs;
CREATE TRIGGER trigger_schedule_passcode_deletion
  BEFORE UPDATE ON jobs
  FOR EACH ROW
  EXECUTE FUNCTION schedule_passcode_deletion();

-- Function to delete passcodes that are scheduled for deletion
CREATE OR REPLACE FUNCTION delete_expired_passcodes()
RETURNS void AS $$
BEGIN
  UPDATE jobs
  SET 
    device_password = NULL,
    password_not_applicable = true
  WHERE 
    passcode_deletion_scheduled_at IS NOT NULL
    AND passcode_deletion_scheduled_at <= NOW()
    AND device_password IS NOT NULL;
    
  -- Log how many passcodes were deleted
  RAISE NOTICE 'Deleted % expired passcodes', (SELECT COUNT(*) FROM jobs WHERE passcode_deletion_scheduled_at <= NOW() AND device_password IS NULL);
END;
$$ LANGUAGE plpgsql;

-- Create a scheduled job using pg_cron (if available) to run daily
-- Note: pg_cron needs to be enabled in Supabase dashboard first
-- This is a placeholder - actual cron job should be set up in Supabase dashboard or via API

-- Manual execution command (run this daily via cron or scheduled task):
-- SELECT delete_expired_passcodes();

-- Comment explaining the security policy
COMMENT ON FUNCTION delete_expired_passcodes() IS 'Deletes device passcodes that are 7+ days past job completion. Run daily via cron job for automatic cleanup.';
COMMENT ON COLUMN jobs.passcode_deletion_scheduled_at IS 'Timestamp when the device passcode should be automatically deleted (7 days after job completion)';
