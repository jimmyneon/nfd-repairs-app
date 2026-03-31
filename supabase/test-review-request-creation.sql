-- ============================================
-- TEST REVIEW REQUEST CREATION
-- ============================================
-- This file helps you manually test creating a review request

-- STEP 1: Find a completed job to test with
-- ============================================
SELECT 
    'COMPLETED JOBS - Available for Testing' as info,
    j.id,
    j.job_number,
    j.customer_name,
    j.customer_phone,
    j.status,
    j.completed_at,
    CASE 
        WHEN EXISTS (SELECT 1 FROM review_requests WHERE job_id = j.id) 
        THEN '⚠ Already has review request'
        ELSE '✓ Available for test'
    END as review_status
FROM jobs j
WHERE j.status = 'completed'
    AND j.completed_at IS NOT NULL
ORDER BY j.completed_at DESC
LIMIT 10;

-- STEP 2: Check current review request settings
-- ============================================
SELECT 
    'CURRENT SETTINGS' as info,
    setting_key,
    setting_value
FROM admin_settings
WHERE setting_key IN (
    'google_review_enabled',
    'google_review_link',
    'auto_review_request_enabled',
    'review_request_delay_hours'
);

-- STEP 3: Manually create a test review request
-- ============================================
-- UNCOMMENT AND MODIFY THE JOB_ID BELOW TO TEST
-- 
-- INSERT INTO review_requests (
--     job_id,
--     status,
--     created_at,
--     expires_at
-- )
-- SELECT 
--     123, -- REPLACE WITH ACTUAL JOB ID FROM STEP 1
--     'pending',
--     NOW(),
--     NOW() + INTERVAL '7 days'
-- WHERE NOT EXISTS (
--     SELECT 1 FROM review_requests WHERE job_id = 123 -- REPLACE WITH SAME JOB ID
-- )
-- RETURNING *;

-- STEP 4: Check if the review request was created
-- ============================================
-- UNCOMMENT AND MODIFY THE JOB_ID BELOW
-- 
-- SELECT 
--     'REVIEW REQUEST CREATED' as info,
--     rr.*,
--     j.job_number,
--     j.customer_name
-- FROM review_requests rr
-- JOIN jobs j ON rr.job_id = j.id
-- WHERE rr.job_id = 123; -- REPLACE WITH YOUR JOB ID

-- STEP 5: Test the review link generation
-- ============================================
SELECT 
    'REVIEW LINK TEST' as info,
    rr.id as review_request_id,
    rr.job_id,
    j.job_number,
    (SELECT setting_value FROM admin_settings WHERE setting_key = 'google_review_link') as google_review_link,
    CONCAT(
        (SELECT setting_value FROM admin_settings WHERE setting_key = 'google_review_link'),
        '?review_request_id=',
        rr.id
    ) as full_review_link
FROM review_requests rr
JOIN jobs j ON rr.job_id = j.id
ORDER BY rr.created_at DESC
LIMIT 5;

-- STEP 6: Simulate marking a review request as sent
-- ============================================
-- UNCOMMENT AND MODIFY THE REVIEW_REQUEST_ID BELOW
-- 
-- UPDATE review_requests
-- SET 
--     status = 'sent',
--     sent_at = NOW()
-- WHERE id = 1 -- REPLACE WITH ACTUAL REVIEW_REQUEST_ID
-- RETURNING *;

-- STEP 7: Simulate a customer clicking the review link
-- ============================================
-- UNCOMMENT AND MODIFY THE REVIEW_REQUEST_ID BELOW
-- 
-- UPDATE review_requests
-- SET 
--     status = 'clicked',
--     clicked_at = NOW()
-- WHERE id = 1 -- REPLACE WITH ACTUAL REVIEW_REQUEST_ID
-- RETURNING *;

-- STEP 8: Check review request lifecycle
-- ============================================
SELECT 
    'REVIEW REQUEST LIFECYCLE' as info,
    rr.id,
    rr.job_id,
    j.job_number,
    rr.status,
    rr.created_at,
    rr.sent_at,
    rr.clicked_at,
    rr.expires_at,
    CASE 
        WHEN rr.sent_at IS NOT NULL THEN 
            EXTRACT(EPOCH FROM (rr.sent_at - rr.created_at))/3600 || ' hours to send'
        ELSE 'Not sent yet'
    END as time_to_send,
    CASE 
        WHEN rr.clicked_at IS NOT NULL AND rr.sent_at IS NOT NULL THEN 
            EXTRACT(EPOCH FROM (rr.clicked_at - rr.sent_at))/3600 || ' hours to click'
        ELSE 'Not clicked yet'
    END as time_to_click
FROM review_requests rr
JOIN jobs j ON rr.job_id = j.id
ORDER BY rr.created_at DESC
LIMIT 10;
