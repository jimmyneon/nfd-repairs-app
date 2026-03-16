-- Add delay reason tracking to jobs table
-- This allows staff to specify why a repair is delayed

-- Add delay_reason and delay_notes columns
ALTER TABLE jobs 
ADD COLUMN IF NOT EXISTS delay_reason TEXT,
ADD COLUMN IF NOT EXISTS delay_notes TEXT;

-- Create constraint for delay reasons
ALTER TABLE jobs
DROP CONSTRAINT IF EXISTS valid_delay_reason;

ALTER TABLE jobs
ADD CONSTRAINT valid_delay_reason 
CHECK (
  delay_reason IS NULL OR 
  delay_reason IN (
    'AWAITING_PARTS',
    'PARTS_DELAYED',
    'TECHNICAL_ISSUE',
    'AWAITING_CUSTOMER_RESPONSE',
    'WORKLOAD_BACKLOG',
    'SPECIALIST_REQUIRED',
    'OTHER'
  )
);

-- Add index for faster delay reason queries
CREATE INDEX IF NOT EXISTS idx_jobs_delay_reason ON jobs(delay_reason) WHERE delay_reason IS NOT NULL;

-- Add comments
COMMENT ON COLUMN jobs.delay_reason IS 'Reason for delay: AWAITING_PARTS, PARTS_DELAYED, TECHNICAL_ISSUE, AWAITING_CUSTOMER_RESPONSE, WORKLOAD_BACKLOG, SPECIALIST_REQUIRED, OTHER';
COMMENT ON COLUMN jobs.delay_notes IS 'Additional notes about the delay for customer communication';

-- Verify columns added
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'jobs' 
AND column_name IN ('delay_reason', 'delay_notes', 'cancellation_reason', 'cancellation_notes')
ORDER BY column_name;
