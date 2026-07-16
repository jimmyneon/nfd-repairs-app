-- Diagnostic query to check job_events for timeline issues
-- Run this first to see what's missing

-- Check jobs with their event counts
SELECT 
  j.id,
  j.job_ref,
  j.status,
  j.parts_required,
  j.source,
  j.created_at,
  COUNT(je.id) FILTER (WHERE je.type = 'STATUS_CHANGE') as status_change_count,
  STRING_AGG(je.message, ' | ' ORDER BY je.created_at) as all_events
FROM jobs j
LEFT JOIN job_events je ON je.job_id = j.id
WHERE j.status IN ('AWAITING_DEPOSIT', 'PARTS_ORDERED', 'PARTS_ARRIVED', 'IN_REPAIR', 'DELAYED', 'READY_TO_COLLECT', 'COLLECTED', 'COMPLETED')
GROUP BY j.id, j.job_ref, j.status, j.parts_required, j.source, j.created_at
ORDER BY j.created_at DESC
LIMIT 20;

-- Check specifically for DELAYED jobs
SELECT 
  j.id,
  j.job_ref,
  j.status,
  j.delay_reason,
  j.delay_notes,
  j.parts_required,
  COUNT(je.id) FILTER (WHERE je.type = 'STATUS_CHANGE') as status_change_count,
  ARRAY_AGG(je.message ORDER BY je.created_at) as event_messages
FROM jobs j
LEFT JOIN job_events je ON je.job_id = j.id AND je.type = 'STATUS_CHANGE'
WHERE j.status = 'DELAYED'
GROUP BY j.id, j.job_ref, j.status, j.delay_reason, j.delay_notes, j.parts_required
ORDER BY j.created_at DESC;
