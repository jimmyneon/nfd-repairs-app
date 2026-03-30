-- Fix data inconsistency: Jobs with PARTS_ORDERED/PARTS_ARRIVED status should have parts_required=true
-- This is causing timeline issues

-- First, let's see which jobs have this issue
SELECT 
  job_ref,
  status,
  parts_required,
  deposit_required,
  deposit_amount
FROM jobs
WHERE status IN ('AWAITING_DEPOSIT', 'PARTS_ORDERED', 'PARTS_ARRIVED')
AND parts_required = false;

-- Fix the inconsistency: Set parts_required=true for jobs in parts-related statuses
UPDATE jobs
SET 
  parts_required = true,
  deposit_required = true,
  deposit_amount = COALESCE(deposit_amount, 20.00)
WHERE status IN ('AWAITING_DEPOSIT', 'PARTS_ORDERED', 'PARTS_ARRIVED')
AND parts_required = false;

-- Also add missing AWAITING_DEPOSIT event for jobs in PARTS_ORDERED status
INSERT INTO job_events (job_id, type, message, created_at)
SELECT 
  j.id,
  'STATUS_CHANGE',
  'Status changed to Awaiting Deposit',
  j.created_at + INTERVAL '90 seconds'
FROM jobs j
WHERE j.status IN ('PARTS_ORDERED', 'PARTS_ARRIVED')
AND NOT EXISTS (
  SELECT 1 FROM job_events je
  WHERE je.job_id = j.id 
  AND je.type = 'STATUS_CHANGE'
  AND je.message ILIKE '%Awaiting Deposit%'
);

-- Add missing PARTS_ORDERED event
INSERT INTO job_events (job_id, type, message, created_at)
SELECT 
  j.id,
  'STATUS_CHANGE',
  'Status changed to Parts Ordered',
  j.created_at + INTERVAL '2 minutes'
FROM jobs j
WHERE j.status IN ('PARTS_ORDERED', 'PARTS_ARRIVED')
AND NOT EXISTS (
  SELECT 1 FROM job_events je
  WHERE je.job_id = j.id 
  AND je.type = 'STATUS_CHANGE'
  AND je.message ILIKE '%Parts Ordered%'
);

-- Verify the fix
SELECT 
  j.job_ref,
  j.status,
  j.parts_required,
  j.deposit_required,
  COUNT(je.id) FILTER (WHERE je.type = 'STATUS_CHANGE') as event_count,
  STRING_AGG(je.message, ' → ' ORDER BY je.created_at) FILTER (WHERE je.type = 'STATUS_CHANGE') as timeline
FROM jobs j
LEFT JOIN job_events je ON je.job_id = j.id
WHERE j.status IN ('PARTS_ORDERED', 'PARTS_ARRIVED', 'DELAYED')
GROUP BY j.id, j.job_ref, j.status, j.parts_required, j.deposit_required
ORDER BY j.created_at DESC;
