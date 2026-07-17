-- Add 17TRACK tracking status fields to jobs table
-- Run this in Supabase SQL Editor

-- Fields for storing live tracking data from 17TRACK API
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS parts_tracking_carrier TEXT;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS parts_tracking_status TEXT;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS parts_tracking_last_event TEXT;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS parts_tracking_last_location TEXT;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS parts_tracking_updated_at TIMESTAMPTZ;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS parts_tracking_eta TIMESTAMPTZ;

-- Verify the columns were added
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'jobs' 
AND column_name LIKE 'parts_tracking%'
ORDER BY column_name;
