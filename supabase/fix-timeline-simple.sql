-- Simple fix: Add RECEIVED event to all jobs that don't have one
-- This is the minimum needed for timeline to work

INSERT INTO job_events (job_id, type, message, created_at)
SELECT 
  j.id,
  'STATUS_CHANGE',
  'Status changed to Received',
  j.created_at + INTERVAL '1 minute'
FROM jobs j
WHERE NOT EXISTS (
  SELECT 1 FROM job_events je
  WHERE je.job_id = j.id 
  AND je.type = 'STATUS_CHANGE'
  AND je.message ILIKE '%Received%'
)
AND j.status IN ('AWAITING_DEPOSIT', 'PARTS_ORDERED', 'PARTS_ARRIVED', 'IN_REPAIR', 'DELAYED', 'READY_TO_COLLECT', 'COLLECTED', 'COMPLETED');

-- Add PARTS_ORDERED event for jobs that need it
INSERT INTO job_events (job_id, type, message, created_at)
SELECT 
  j.id,
  'STATUS_CHANGE',
  'Status changed to Parts Ordered',
  j.created_at + INTERVAL '2 minutes'
FROM jobs j
WHERE j.parts_required = true
AND j.status IN ('PARTS_ORDERED', 'PARTS_ARRIVED', 'IN_REPAIR', 'DELAYED', 'READY_TO_COLLECT', 'COLLECTED', 'COMPLETED')
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
  COUNT(je.id) FILTER (WHERE je.type = 'STATUS_CHANGE') as event_count,
  STRING_AGG(je.message, ' → ' ORDER BY je.created_at) as timeline
FROM jobs j
LEFT JOIN job_events je ON je.job_id = j.id
WHERE j.status IN ('DELAYED', 'PARTS_ORDERED', 'IN_REPAIR')
GROUP BY j.id, j.job_ref, j.status, j.parts_required
ORDER BY j.created_at DESC
LIMIT 10;
