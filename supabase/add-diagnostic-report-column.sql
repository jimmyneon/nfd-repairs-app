-- Add diagnostic_report column to jobs table
-- Run this in Supabase SQL Editor

ALTER TABLE jobs
ADD COLUMN IF NOT EXISTS diagnostic_report TEXT;

COMMENT ON COLUMN jobs.diagnostic_report IS 'Findings from diagnostic assessment, can be inserted into custom SMS messages to customers';
