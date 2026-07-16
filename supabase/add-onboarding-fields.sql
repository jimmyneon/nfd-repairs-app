-- Add onboarding and customer data fields to jobs table
-- Run this in Supabase SQL Editor to add new columns

-- Add new columns to jobs table
ALTER TABLE jobs 
ADD COLUMN IF NOT EXISTS device_password TEXT,
ADD COLUMN IF NOT EXISTS password_not_applicable BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS customer_signature TEXT,
ADD COLUMN IF NOT EXISTS terms_accepted BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS terms_accepted_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS onboarding_completed_at TIMESTAMPTZ;

-- Add indexes for new fields
CREATE INDEX IF NOT EXISTS idx_jobs_onboarding_completed ON jobs(onboarding_completed);
CREATE INDEX IF NOT EXISTS idx_jobs_terms_accepted ON jobs(terms_accepted);

-- Add comments for documentation
COMMENT ON COLUMN jobs.device_password IS 'Customer device password/passcode for repair access';
COMMENT ON COLUMN jobs.password_not_applicable IS 'True if device has no password';
COMMENT ON COLUMN jobs.customer_signature IS 'Base64 encoded signature image from onboarding';
COMMENT ON COLUMN jobs.terms_accepted IS 'Whether customer accepted terms and conditions';
COMMENT ON COLUMN jobs.terms_accepted_at IS 'Timestamp when terms were accepted';
COMMENT ON COLUMN jobs.onboarding_completed IS 'Whether customer completed onboarding process';
COMMENT ON COLUMN jobs.onboarding_completed_at IS 'Timestamp when onboarding was completed';
