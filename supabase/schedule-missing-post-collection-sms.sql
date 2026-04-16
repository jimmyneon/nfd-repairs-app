-- Manually schedule post-collection SMS for jobs collected since April 1st that weren't scheduled
-- This fixes the jobs that missed scheduling due to the bug
-- Includes jobs that are now COMPLETED but were originally COLLECTED
-- Also includes the 8 jobs from April 8-10 that were unscheduled

UPDATE public.jobs
SET 
    post_collection_sms_scheduled_at = NOW() + INTERVAL '3 hours',
    post_collection_email_scheduled_at = NOW() + INTERVAL '3 hours'
WHERE collected_at IS NOT NULL
    AND collected_at >= '2026-04-01'
    AND post_collection_sms_scheduled_at IS NULL
    AND job_ref IN (
        -- April 1-7 jobs (COMPLETED)
        'NFD-20260327-001',
        'NFD-20260331-002',
        'NFD-20260402-001',
        'NFD-20260402-002',
        'NFD-20260330-006',
        'NFD-20260404-001',
        'NFD-20260331-004',
        -- April 8-10 jobs (COLLECTED)
        'NFD-20260317-002',
        'NFD-20260317-005',
        'NFD-20260404-003',
        'NFD-20260407-002',
        'NFD-20260408-001',
        'NFD-20260407-001',
        'NFD-20260402-003',
        'NFD-20260407-004'
    )
RETURNING 
    job_ref, 
    customer_name, 
    collected_at, 
    post_collection_sms_scheduled_at as scheduled_time;
