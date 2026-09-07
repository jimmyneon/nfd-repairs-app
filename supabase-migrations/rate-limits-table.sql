-- Rate limiting table for public API endpoints
-- Run this in the Supabase SQL editor

CREATE TABLE IF NOT EXISTS rate_limits (
  id BIGSERIAL PRIMARY KEY,
  ip TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS rate_limits_ip_endpoint_idx
  ON rate_limits (ip, endpoint, created_at DESC);

-- Auto-cleanup: delete entries older than 1 hour
-- Run periodically via a cron job or manually
-- DELETE FROM rate_limits WHERE created_at < NOW() - INTERVAL '1 hour';

-- Enable RLS but allow service role to manage (service role bypasses RLS)
ALTER TABLE rate_limits ENABLE ROW LEVEL SECURITY;

-- No policies needed — service role key bypasses RLS
-- Public access is not needed (rate limiting is done server-side only)
