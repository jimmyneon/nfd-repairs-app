-- Add new job statuses and cancellation reason tracking
-- New statuses: QUOTE_APPROVED, DROPPED_OFF, COLLECTED
-- Add cancellation_reason field

-- 0. Migrate existing READY_TO_BOOK_IN jobs to new status
-- For API/online jobs: READY_TO_BOOK_IN → QUOTE_APPROVED
-- For manual jobs: READY_TO_BOOK_IN → RECEIVED
UPDATE jobs 
SET status = CASE 
  WHEN source = 'staff_manual' THEN 'RECEIVED'
  ELSE 'QUOTE_APPROVED'
END
WHERE status = 'READY_TO_BOOK_IN';

-- 1. Add cancellation_reason column to jobs table
ALTER TABLE jobs 
ADD COLUMN IF NOT EXISTS cancellation_reason TEXT,
ADD COLUMN IF NOT EXISTS cancellation_notes TEXT;

-- 2. Create enum-like constraint for cancellation reasons
ALTER TABLE jobs
DROP CONSTRAINT IF EXISTS valid_cancellation_reason;

ALTER TABLE jobs
ADD CONSTRAINT valid_cancellation_reason 
CHECK (
  cancellation_reason IS NULL OR 
  cancellation_reason IN (
    'CUSTOMER_CANCELLED',
    'UNREPAIRABLE',
    'TOO_EXPENSIVE',
    'NO_RESPONSE',
    'PARTS_UNAVAILABLE',
    'OTHER'
  )
);

-- 3. Update status constraint to include new statuses
-- Drop both old and new constraint names to be safe
ALTER TABLE jobs
DROP CONSTRAINT IF EXISTS jobs_status_check;

ALTER TABLE jobs
DROP CONSTRAINT IF EXISTS valid_status;

ALTER TABLE jobs
ADD CONSTRAINT valid_status 
CHECK (
  status IN (
    'QUOTE_APPROVED',
    'DROPPED_OFF',
    'RECEIVED',
    'AWAITING_DEPOSIT',
    'PARTS_ORDERED',
    'PARTS_ARRIVED',
    'IN_REPAIR',
    'DELAYED',
    'READY_TO_COLLECT',
    'COLLECTED',
    'COMPLETED',
    'CANCELLED'
  )
);

-- 4. Add index for faster cancellation reason queries
CREATE INDEX IF NOT EXISTS idx_jobs_cancellation_reason ON jobs(cancellation_reason) WHERE cancellation_reason IS NOT NULL;

-- 5. Add comment explaining the new flow
COMMENT ON COLUMN jobs.cancellation_reason IS 'Reason for cancellation: CUSTOMER_CANCELLED, UNREPAIRABLE, TOO_EXPENSIVE, NO_RESPONSE, PARTS_UNAVAILABLE, OTHER';
COMMENT ON COLUMN jobs.cancellation_notes IS 'Additional notes about cancellation';

-- Status flow explanation:
-- API/Responder jobs: QUOTE_APPROVED → DROPPED_OFF → [AWAITING_DEPOSIT] → [PARTS_ORDERED] → [PARTS_ARRIVED] → IN_REPAIR → READY_TO_COLLECT → COLLECTED → COMPLETED
-- Manual jobs: RECEIVED → [AWAITING_DEPOSIT] → [PARTS_ORDERED] → [PARTS_ARRIVED] → IN_REPAIR → READY_TO_COLLECT → COLLECTED → COMPLETED
-- [brackets] = optional steps if parts required
