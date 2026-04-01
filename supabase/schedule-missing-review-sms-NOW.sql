-- ============================================
-- SCHEDULE MISSING REVIEW SMS - RUN THIS NOW
-- ============================================

-- This will schedule review SMS for the 4 COLLECTED jobs that are missing them
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
