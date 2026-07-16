-- DIAGNOSIS 7: When were the jobs actually marked as COLLECTED?
-- The collected_at timestamp shows when they were marked COLLECTED

SELECT 
    job_ref,
    customer_name,
    status,
    collected_at,
    created_at,
    EXTRACT(HOUR FROM collected_at) as collected_hour,
    EXTRACT(MINUTE FROM collected_at) as collected_minute
FROM public.jobs
WHERE job_ref IN ('NFD-20260420-001', 'NFD-20260420-002')
ORDER BY collected_at;

-- Check: Were they marked COLLECTED before or after 14:00?
-- If collected_at is 13:39-13:42 but status wasn't COLLECTED until later, 
-- then the issue is the status field isn't being set when collected_at is set
