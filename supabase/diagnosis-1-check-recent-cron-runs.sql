-- DIAGNOSIS 1: Check if backup cron has been running
-- This shows all backup cron runs since April 21st 13:00

SELECT 
    jobid,
    runid,
    status,
    start_time,
    end_time,
    return_message,
    CASE 
        WHEN status = 'succeeded' THEN '✓'
        WHEN status = 'failed' THEN '✗'
        ELSE '?'
    END as result
FROM cron.job_run_details
WHERE jobid = 4  -- backup job
    AND start_time >= '2026-04-21 13:00:00'
ORDER BY start_time ASC;

-- Expected: Should see runs at 13:00, 14:00, 15:00, etc. (every hour on the hour)
-- If missing runs: pg_cron is unreliable
-- If all succeeded with "1 row": function ran but found no jobs (already scheduled or excluded)
