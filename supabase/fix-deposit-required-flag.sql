-- Fix existing jobs where deposit_required was incorrectly set to true
-- Only jobs with status AWAITING_DEPOSIT should have deposit_required = true
-- Jobs with PARTS_ORDERED or PARTS_ARRIVED can have parts without requiring deposit

-- First, check which jobs will be affected
SELECT 
  job_ref,
  status,
  parts_required,
  deposit_required,
  deposit_amount,
  deposit_received
FROM jobs
WHERE deposit_required = true
AND status NOT IN ('AWAITING_DEPOSIT')
ORDER BY created_at DESC;

-- Fix: Set deposit_required = false for jobs that aren't in AWAITING_DEPOSIT status
UPDATE jobs
SET 
  deposit_required = false,
  deposit_amount = NULL
WHERE deposit_required = true
AND status NOT IN ('AWAITING_DEPOSIT')
AND deposit_received = false;  -- Only update if deposit hasn't been received yet

-- Remove AWAITING_DEPOSIT events from jobs that don't actually need deposit
DELETE FROM job_events
WHERE job_id IN (
  SELECT id FROM jobs 
  WHERE deposit_required = false 
  AND status IN ('PARTS_ORDERED', 'PARTS_ARRIVED', 'IN_REPAIR', 'DELAYED', 'READY_TO_COLLECT', 'COLLECTED', 'COMPLETED')
)
AND type = 'STATUS_CHANGE'
AND message ILIKE '%Awaiting Deposit%';

-- Verify the fix
SELECT 
  job_ref,
  status,
  parts_required,
  deposit_required,
  deposit_amount,
  COUNT(je.id) FILTER (WHERE je.type = 'STATUS_CHANGE') as event_count,
  STRING_AGG(je.message, ' → ' ORDER BY je.created_at) FILTER (WHERE je.type = 'STATUS_CHANGE') as timeline
FROM jobs j
LEFT JOIN job_events je ON je.job_id = j.id
WHERE j.status IN ('PARTS_ORDERED', 'PARTS_ARRIVED', 'IN_REPAIR', 'DELAYED')
GROUP BY j.id, j.job_ref, j.status, j.parts_required, j.deposit_required, j.deposit_amount
ORDER BY j.created_at DESC
LIMIT 20;
