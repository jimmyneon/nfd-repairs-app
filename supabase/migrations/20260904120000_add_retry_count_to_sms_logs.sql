-- Add retry_count column to sms_logs for tracking send attempts
ALTER TABLE sms_logs ADD COLUMN IF NOT EXISTS retry_count integer DEFAULT 0;

-- Function to atomically increment retry count
CREATE OR REPLACE FUNCTION increment_retry_count(sms_id uuid) RETURNS void AS $$
BEGIN
  UPDATE sms_logs SET retry_count = COALESCE(retry_count, 0) + 1 WHERE id = sms_id;
END;
$$ LANGUAGE plpgsql;
