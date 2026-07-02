-- Add payment_received column to jobs table
-- Allows staff to mark a job as paid in advance so SMS doesn't tell customer they owe money
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS payment_received boolean DEFAULT false;

-- Add comment for documentation
COMMENT ON COLUMN jobs.payment_received IS 'True when customer has paid the full repair price in advance. When true, READY_TO_COLLECT SMS will not include the price.';

-- Backfill existing jobs: mark COLLECTED/COMPLETED jobs as paid
UPDATE jobs SET payment_received = true WHERE status IN ('COLLECTED', 'COMPLETED');
