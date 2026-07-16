-- Add email_logs table to track sent emails
-- Similar to sms_logs but for email notifications

CREATE TABLE IF NOT EXISTS email_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    template_key VARCHAR(100),
    subject TEXT NOT NULL,
    body_html TEXT NOT NULL,
    body_text TEXT,
    recipient_email TEXT NOT NULL,
    status VARCHAR(20) DEFAULT 'PENDING',
    sent_at TIMESTAMPTZ,
    error_message TEXT,
    resend_id TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    CONSTRAINT valid_email_status CHECK (status IN ('PENDING', 'SENT', 'FAILED'))
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_email_logs_job_id ON email_logs(job_id);
CREATE INDEX IF NOT EXISTS idx_email_logs_status ON email_logs(status);
CREATE INDEX IF NOT EXISTS idx_email_logs_created_at ON email_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_logs_recipient ON email_logs(recipient_email);

-- RLS Policies (same as sms_logs)
ALTER TABLE email_logs ENABLE ROW LEVEL SECURITY;

-- Staff can view all email logs
CREATE POLICY "Staff can view email logs"
    ON email_logs FOR SELECT
    TO authenticated
    USING (true);

-- Staff can insert email logs
CREATE POLICY "Staff can insert email logs"
    ON email_logs FOR INSERT
    TO authenticated
    WITH CHECK (true);

-- Staff can update email logs
CREATE POLICY "Staff can update email logs"
    ON email_logs FOR UPDATE
    TO authenticated
    USING (true);

-- Grant permissions
GRANT ALL ON email_logs TO authenticated;

-- Comments
COMMENT ON TABLE email_logs IS 'Tracks all emails sent to customers for job updates';
COMMENT ON COLUMN email_logs.template_key IS 'Email template used (JOB_CREATED, STATUS_UPDATE, etc)';
COMMENT ON COLUMN email_logs.status IS 'Email delivery status: PENDING, SENT, FAILED';
COMMENT ON COLUMN email_logs.resend_id IS 'Resend API message ID for tracking';

-- Verify table created
SELECT 
    column_name, 
    data_type, 
    is_nullable
FROM information_schema.columns
WHERE table_name = 'email_logs'
ORDER BY ordinal_position;
