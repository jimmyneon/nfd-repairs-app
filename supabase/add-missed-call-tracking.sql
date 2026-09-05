-- Track missed calls per number so we can detect repeat callers
-- who haven't responded to our SMS (prevents spam)
CREATE TABLE IF NOT EXISTS missed_call_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone VARCHAR(20) NOT NULL,
  sms_sent BOOLEAN DEFAULT false,
  called_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for fast lookup by phone
CREATE INDEX IF NOT EXISTS idx_missed_call_log_phone ON missed_call_log(phone);
CREATE INDEX IF NOT EXISTS idx_missed_call_log_called_at ON missed_call_log(called_at);

-- Helper function: count missed calls from a number in the last 24 hours
CREATE OR REPLACE FUNCTION count_recent_missed_calls(p_phone VARCHAR)
RETURNS INTEGER AS $$
DECLARE
  cnt INTEGER;
BEGIN
  SELECT COUNT(*) INTO cnt
  FROM missed_call_log
  WHERE phone = p_phone
    AND called_at > NOW() - INTERVAL '24 hours';
  RETURN cnt;
END;
$$ LANGUAGE plpgsql;
