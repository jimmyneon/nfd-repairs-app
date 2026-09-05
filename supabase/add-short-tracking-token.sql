-- Add short tracking token to jobs table
-- Replaces the long UUID tracking link (nfdr.uk/t/826f3ffc-...) with a
-- 6-character code (nfdr.uk/t/A4B9X2) — much shorter for SMS.
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS short_token VARCHAR(8);

-- Generate short tokens for all existing jobs
UPDATE jobs
SET short_token = substring(md5(tracking_token::text || id::text), 1, 6)
WHERE short_token IS NULL;

-- Add unique index for fast lookups
CREATE UNIQUE INDEX IF NOT EXISTS idx_jobs_short_token ON jobs(short_token) WHERE short_token IS NOT NULL;
