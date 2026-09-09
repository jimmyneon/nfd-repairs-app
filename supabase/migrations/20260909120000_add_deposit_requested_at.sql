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

-- Fix: The valid_status constraint was never updated when AWAITING_DEVICE
-- was added. The jobs_status_check constraint was updated, but valid_status
-- was not. This caused job inserts with status='AWAITING_DEVICE' to fail.
ALTER TABLE jobs DROP CONSTRAINT IF EXISTS valid_status;
ALTER TABLE jobs ADD CONSTRAINT valid_status CHECK (
  status IN (
    'QUOTE_REQUESTED', 'QUOTE_APPROVED', 'AWAITING_DEVICE',
    'RECEIVED', 'DIAGNOSTIC', 'AWAITING_DEPOSIT',
    'PARTS_ORDERED', 'PARTS_ARRIVED', 'IN_REPAIR',
    'DELAYED', 'READY_TO_COLLECT', 'IN_STORAGE',
    'COLLECTED', 'COMPLETED', 'CANCELLED'
  )
);
