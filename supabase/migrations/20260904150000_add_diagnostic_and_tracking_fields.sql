-- Add diagnostic flow fields and tracking page view table
-- Supports: repair agreed/declined tracking, diagnosis notes, page view counting

ALTER TABLE jobs
ADD COLUMN IF NOT EXISTS repair_agreed_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS repair_declined_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS repair_declined_reason TEXT,
ADD COLUMN IF NOT EXISTS diagnosis_notes TEXT,
ADD COLUMN IF NOT EXISTS diagnosis_sent_at TIMESTAMPTZ;

-- Track each time a customer views the tracking page
CREATE TABLE IF NOT EXISTS tracking_page_views (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  job_id UUID REFERENCES jobs(id) ON DELETE CASCADE,
  viewed_at TIMESTAMPTZ DEFAULT NOW(),
  user_agent TEXT,
  ip_hash TEXT
);
CREATE INDEX IF NOT EXISTS idx_tracking_views_job_time ON tracking_page_views (job_id, viewed_at DESC);
