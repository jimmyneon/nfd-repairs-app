-- Make sms_logs.job_id nullable so we can log SMS that aren't tied to a specific job
-- (e.g. missed-call responses, delivery confirmations, manual staff texts)
ALTER TABLE sms_logs ALTER COLUMN job_id DROP NOT NULL;

-- Add delivery tracking columns
ALTER TABLE sms_logs ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ;
ALTER TABLE sms_logs ADD COLUMN IF NOT EXISTS delivery_status VARCHAR(50);
ALTER TABLE sms_logs ADD COLUMN IF NOT EXISTS recipient_phone VARCHAR(20);
ALTER TABLE sms_logs ADD COLUMN IF NOT EXISTS message_hash VARCHAR(64);

-- Add index for faster delivery-confirmation lookups
CREATE INDEX IF NOT EXISTS idx_sms_logs_message_hash ON sms_logs(message_hash);
CREATE INDEX IF NOT EXISTS idx_sms_logs_recipient_phone ON sms_logs(recipient_phone);
CREATE INDEX IF NOT EXISTS idx_sms_logs_created_at ON sms_logs(created_at);
