-- Check what statuses currently exist in the jobs table
SELECT DISTINCT status, COUNT(*) as count
FROM jobs
GROUP BY status
ORDER BY count DESC;
