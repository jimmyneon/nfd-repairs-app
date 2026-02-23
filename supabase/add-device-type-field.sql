-- Add device_type field to jobs table for categorization
-- Run this in Supabase SQL Editor

ALTER TABLE jobs 
ADD COLUMN IF NOT EXISTS device_type TEXT;

-- Add comment
COMMENT ON COLUMN jobs.device_type IS 'Device category: phone, tablet, laptop, desktop, console, other';

-- Create index for filtering
CREATE INDEX IF NOT EXISTS idx_jobs_device_type ON jobs(device_type);
