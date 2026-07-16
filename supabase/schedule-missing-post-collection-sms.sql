-- Manually schedule post-collection SMS for jobs collected April 16-18 that weren't scheduled
-- This fixes the jobs that missed scheduling due to the bug (fix not deployed)

UPDATE public.jobs
SET 
    post_collection_sms_scheduled_at = NOW() + INTERVAL '3 hours',
    post_collection_email_scheduled_at = NOW() + INTERVAL '3 hours'
WHERE collected_at IS NOT NULL
    AND collected_at >= '2026-04-16'
    AND post_collection_sms_scheduled_at IS NULL
    AND skip_review_request = false
    AND (customer_flag IS NULL OR customer_flag NOT IN ('sensitive', 'awkward'))
    AND job_ref IN (
        -- April 16-18 jobs (6 jobs that should get review SMS)
        'NFD-20260330-005',  -- Emer Druce (April 16)
        'NFD-20260415-001',  -- Hannah Robbins (April 18)
        'NFD-20260418-003',  -- Laura Keith (April 18)
        'NFD-20260413-003',  -- Martin Wilde (April 18)
        'NFD-20260418-001',  -- Peter Newton (April 18)
        'NFD-20260408-002'   -- Ellis Attoe (April 18)
    )
RETURNING 
    job_ref, 
    customer_name, 
    collected_at, 
    post_collection_sms_scheduled_at as scheduled_time;
