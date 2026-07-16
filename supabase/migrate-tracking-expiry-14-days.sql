-- Migration: Change tracking link expiration from 30 days to 14 days
-- Run this in Supabase SQL Editor

-- 1. Update the trigger function to use 14 days instead of 30
CREATE OR REPLACE FUNCTION set_tracking_expiration()
RETURNS TRIGGER AS $$
BEGIN
    -- Set expiration to 14 days after closure
    IF OLD.closed_at IS NULL AND NEW.closed_at IS NOT NULL THEN
        NEW.tracking_link_expires_at := NEW.closed_at + INTERVAL '14 days';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 2. Update existing closed jobs that haven't expired yet
-- (only affects jobs where the new 14-day expiry is still in the future)
UPDATE jobs
SET tracking_link_expires_at = closed_at + INTERVAL '14 days'
WHERE closed_at IS NOT NULL
  AND tracking_link_expires_at IS NOT NULL
  AND closed_at + INTERVAL '14 days' > NOW();

-- 3. Update comment
COMMENT ON COLUMN jobs.tracking_link_expires_at IS 'When the tracking link expires (14 days after job closure)';
