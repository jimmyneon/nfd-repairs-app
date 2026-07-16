-- Add marketing opt-in column to jobs table
-- Allows customers to consent to receiving special prices, deals, and promotional messages

ALTER TABLE jobs ADD COLUMN IF NOT EXISTS marketing_opt_in BOOLEAN DEFAULT FALSE;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS marketing_opt_in_at TIMESTAMPTZ;

-- Add comment for documentation
COMMENT ON COLUMN jobs.marketing_opt_in IS 'Customer consent to receive marketing messages (special prices, deals, etc.)';
COMMENT ON COLUMN jobs.marketing_opt_in_at IS 'Timestamp when marketing opt-in was recorded';
