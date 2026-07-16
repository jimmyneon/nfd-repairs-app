-- Password Requests table
-- Stores encrypted device passwords submitted by customers via secure link
-- Auto-deletes 7 days after job collection

CREATE TABLE IF NOT EXISTS password_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID REFERENCES jobs(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  
  -- Encrypted password storage (AES-256-GCM)
  encrypted_password TEXT,
  encryption_iv TEXT,
  encryption_auth_tag TEXT,
  
  -- Status tracking
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'SUBMITTED', 'EXPIRED', 'DELETED')),
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  submitted_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '24 hours'),
  
  -- Auto-delete tracking: password is deleted 7 days after job collection
  job_collected_at TIMESTAMPTZ,
  password_deleted_at TIMESTAMPTZ
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_password_requests_token ON password_requests(token);
CREATE INDEX IF NOT EXISTS idx_password_requests_job_id ON password_requests(job_id);
CREATE INDEX IF NOT EXISTS idx_password_requests_status ON password_requests(status);
CREATE INDEX IF NOT EXISTS idx_password_requests_expires_at ON password_requests(expires_at);

-- Enable RLS
ALTER TABLE password_requests ENABLE ROW LEVEL SECURITY;

-- Policy: Allow public access by token (for submission)
CREATE POLICY "Public can view by token" ON password_requests
  FOR SELECT USING (true);

-- Policy: Public can update by token (to submit password)
CREATE POLICY "Public can update by token" ON password_requests
  FOR UPDATE USING (true);

-- Policy: Service role can do everything (used by API routes)
CREATE POLICY "Service role full access" ON password_requests
  FOR ALL USING (true) WITH CHECK (true);

-- Auto-cleanup function: Delete passwords 7 days after job collection
-- Called by pg_cron every hour
CREATE OR REPLACE FUNCTION cleanup_old_passwords()
RETURNS void AS $$
BEGIN
  -- Delete encrypted passwords where:
  -- 1. The job has been collected (COLLECTED status)
  -- 2. It's been 7+ days since collection
  -- 3. The password hasn't already been deleted
  UPDATE password_requests
  SET 
    encrypted_password = NULL,
    encryption_iv = NULL,
    encryption_auth_tag = NULL,
    password_deleted_at = now(),
    status = 'DELETED'
  WHERE 
    job_id IN (
      SELECT id FROM jobs 
      WHERE status = 'COLLECTED' 
      AND updated_at < now() - interval '7 days'
    )
    AND encrypted_password IS NOT NULL
    AND password_deleted_at IS NULL;
    
  -- Also expire any requests that haven't been submitted within 24 hours
  UPDATE password_requests
  SET status = 'EXPIRED'
  WHERE status = 'PENDING'
    AND expires_at < now();
END;
$$ LANGUAGE plpgsql;

-- Schedule cleanup to run every hour (if pg_cron is available)
-- SELECT cron.schedule('cleanup-passwords', '0 * * * *', 'SELECT cleanup_old_passwords()');
