-- DIAGNOSIS 3: Test if primary scheduling method works
-- This simulates what should happen when a job is marked COLLECTED

-- First, check if there's a test job we can use
SELECT 
    id,
    job_ref,
    status,
    collected_at,
    post_collection_sms_scheduled_at
FROM public.jobs
WHERE job_ref = 'NFD-20260420-002'  -- Killian's job
LIMIT 1;

-- Instructions:
-- 1. Note the current post_collection_sms_scheduled_at value
-- 2. In the app, change this job's status from COLLECTED to IN_REPAIR
-- 3. Then change it back to COLLECTED
-- 4. Check if post_collection_sms_scheduled_at gets updated to a new time
-- 5. If YES: Primary scheduling works, problem is jobs aren't triggering it
-- 6. If NO: Primary scheduling is broken (API route not deployed or has bug)
