-- Customer Onboarding Schema
-- Adds fields for customer onboarding process when jobs come in via API with incomplete info

-- Add new columns to jobs table for onboarding
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS device_password TEXT;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS password_not_applicable BOOLEAN DEFAULT FALSE;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS customer_signature TEXT;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS terms_accepted BOOLEAN DEFAULT FALSE;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS terms_accepted_at TIMESTAMPTZ;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN DEFAULT FALSE;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS onboarding_completed_at TIMESTAMPTZ;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS onboarding_token VARCHAR(64);

-- Create unique index on onboarding_token
CREATE UNIQUE INDEX IF NOT EXISTS idx_jobs_onboarding_token ON jobs(onboarding_token) WHERE onboarding_token IS NOT NULL;

-- Add index for onboarding_completed for quick filtering
CREATE INDEX IF NOT EXISTS idx_jobs_onboarding_completed ON jobs(onboarding_completed);

-- Function to generate onboarding token
CREATE OR REPLACE FUNCTION generate_onboarding_token()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.onboarding_token IS NULL OR NEW.onboarding_token = '' THEN
        NEW.onboarding_token := encode(gen_random_bytes(32), 'hex');
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-generate onboarding token on insert
DROP TRIGGER IF EXISTS generate_jobs_onboarding_token ON jobs;
CREATE TRIGGER generate_jobs_onboarding_token
    BEFORE INSERT ON jobs
    FOR EACH ROW
    EXECUTE FUNCTION generate_onboarding_token();

-- Function to check if job needs onboarding
CREATE OR REPLACE FUNCTION needs_onboarding(job_row jobs)
RETURNS BOOLEAN AS $$
BEGIN
    -- Job needs onboarding if:
    -- 1. Email is missing OR
    -- 2. Terms not accepted OR
    -- 3. Password info not provided (both password and password_not_applicable are null/false)
    RETURN (
        job_row.customer_email IS NULL OR
        job_row.customer_email = '' OR
        job_row.terms_accepted = FALSE OR
        (job_row.device_password IS NULL AND job_row.password_not_applicable = FALSE)
    );
END;
$$ LANGUAGE plpgsql;

-- Update RLS policies to allow public access via onboarding token
CREATE POLICY "Public can view job by onboarding token"
    ON jobs FOR SELECT
    TO anon
    USING (onboarding_token IS NOT NULL);

CREATE POLICY "Public can update job via onboarding token"
    ON jobs FOR UPDATE
    TO anon
    USING (onboarding_token IS NOT NULL)
    WITH CHECK (onboarding_token IS NOT NULL);

-- Add SMS template for onboarding
INSERT INTO sms_templates (key, body, is_active) VALUES
('ONBOARDING_REQUIRED', 'Hi {customer_name}, we need a few more details to start your {device_make} {device_model} repair. Please complete your details here: {onboarding_link} - Job ref: {job_ref} - NFD Repairs', true)
ON CONFLICT (key) DO UPDATE SET 
    body = EXCLUDED.body,
    updated_at = NOW();

-- Comments
COMMENT ON COLUMN jobs.device_password IS 'Device password/passcode provided by customer';
COMMENT ON COLUMN jobs.password_not_applicable IS 'True if device has no password';
COMMENT ON COLUMN jobs.customer_signature IS 'Base64 encoded signature image';
COMMENT ON COLUMN jobs.terms_accepted IS 'Whether customer accepted terms and conditions';
COMMENT ON COLUMN jobs.terms_accepted_at IS 'When terms were accepted';
COMMENT ON COLUMN jobs.onboarding_completed IS 'Whether customer completed onboarding form';
COMMENT ON COLUMN jobs.onboarding_completed_at IS 'When onboarding was completed';
COMMENT ON COLUMN jobs.onboarding_token IS 'Secure token for customer onboarding access';
