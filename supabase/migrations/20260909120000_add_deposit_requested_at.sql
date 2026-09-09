-- Add deposit_requested_at column to jobs table
-- Used to record when the deposit request SMS was sent to the customer
-- (separate from deposit_received_at which records when the customer paid)

ALTER TABLE jobs
ADD COLUMN IF NOT EXISTS deposit_requested_at timestamp with time zone;

-- Backfill: For existing AWAITING_DEPOSIT jobs, set deposit_requested_at
-- to the job creation time (we don't know exactly when the request was sent)
UPDATE jobs
SET deposit_requested_at = created_at
WHERE status = 'AWAITING_DEPOSIT'
  AND deposit_required = true
  AND deposit_requested_at IS NULL;

-- Add index for quick lookup of pending deposit requests
CREATE INDEX IF NOT EXISTS idx_jobs_deposit_requested_at
ON jobs(deposit_requested_at)
WHERE deposit_requested_at IS NOT NULL;
