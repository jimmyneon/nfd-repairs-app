-- Add metadata column to job_events for storing structured data
-- (e.g. customer SMS replies with phone, timestamp, thread_id)
ALTER TABLE job_events ADD COLUMN IF NOT EXISTS metadata JSONB;

-- Add index for faster lookups by type
CREATE INDEX IF NOT EXISTS idx_job_events_type ON job_events(type);
