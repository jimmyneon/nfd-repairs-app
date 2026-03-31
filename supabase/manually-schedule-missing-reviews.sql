-- ============================================
-- MANUALLY SCHEDULE REVIEW SMS FOR COLLECTED JOBS
-- ============================================
-- This will schedule review SMS for COLLECTED jobs that are missing them

-- STEP 1: Preview which jobs will be scheduled
-- ============================================
SELECT 
    '=== JOBS TO BE SCHEDULED ===' as section,
    job_ref,
    customer_name,
    collected_at,
    CASE 
        WHEN collected_at > NOW() - INTERVAL '1 day' THEN 'Send in 1-3 hours'
        ELSE 'Send tomorrow morning 10-12am'
    END as when_to_send
FROM jobs
WHERE status = 'COLLECTED'
    AND post_collection_sms_sent_at IS NULL
    AND post_collection_sms_scheduled_at IS NULL
    AND (skip_review_request IS NULL OR skip_review_request = false)
    AND (customer_flag IS NULL OR customer_flag NOT IN ('sensitive', 'awkward'));

-- STEP 2: Schedule review SMS (UNCOMMENT TO RUN)
-- ============================================
-- This sets the scheduled time based on when they were collected
-- If collected today: schedule 2 hours from now
-- If collected before today: schedule for tomorrow 11am

/*
UPDATE jobs
SET post_collection_sms_scheduled_at = CASE
    -- If collected today, schedule 2 hours from now
    WHEN collected_at > NOW() - INTERVAL '1 day' THEN NOW() + INTERVAL '2 hours'
    -- If collected before today, schedule for tomorrow 11am
    ELSE (CURRENT_DATE + INTERVAL '1 day' + INTERVAL '11 hours')
END
WHERE status = 'COLLECTED'
    AND post_collection_sms_sent_at IS NULL
    AND post_collection_sms_scheduled_at IS NULL
    AND (skip_review_request IS NULL OR skip_review_request = false)
    AND (customer_flag IS NULL OR customer_flag NOT IN ('sensitive', 'awkward'))
RETURNING job_ref, customer_name, post_collection_sms_scheduled_at;
*/

-- STEP 3: Verify the scheduling worked
-- ============================================
/*
SELECT 
    '=== SCHEDULED REVIEW SMS ===' as section,
    job_ref,
    customer_name,
    collected_at,
    post_collection_sms_scheduled_at,
    CASE 
        WHEN post_collection_sms_scheduled_at < NOW() THEN 'READY TO SEND NOW'
        ELSE 'SCHEDULED FOR FUTURE'
    END as status
FROM jobs
WHERE status = 'COLLECTED'
    AND post_collection_sms_scheduled_at IS NOT NULL
    AND post_collection_sms_sent_at IS NULL
ORDER BY post_collection_sms_scheduled_at;
*/
