-- ============================================
-- FIX REVIEW SMS SYSTEM - COMPLETE SOLUTION
-- ============================================
-- This script addresses all the issues:
-- 1. Updates any scheduled SMS that are outside allowed hours (8am-8pm)
-- 2. Removes duplicate scheduled SMS for same phone number
-- 3. Verifies the system is working correctly

-- STEP 1: CHECK CURRENT STATE
-- ============================================
SELECT 
    '=== CURRENT SCHEDULED REVIEW SMS ===' as section,
    job_ref,
    customer_name,
    customer_phone,
    post_collection_sms_scheduled_at,
    TO_CHAR(post_collection_sms_scheduled_at, 'HH24:MI') as scheduled_time,
    EXTRACT(HOUR FROM post_collection_sms_scheduled_at) as scheduled_hour,
    CASE 
        WHEN EXTRACT(HOUR FROM post_collection_sms_scheduled_at) < 8 THEN '⚠ TOO EARLY (before 8am)'
        WHEN EXTRACT(HOUR FROM post_collection_sms_scheduled_at) >= 20 THEN '⚠ TOO LATE (after 8pm)'
        ELSE '✓ Within allowed hours'
    END as time_check
FROM jobs
WHERE post_collection_sms_scheduled_at IS NOT NULL
    AND post_collection_sms_sent_at IS NULL
ORDER BY post_collection_sms_scheduled_at;

-- STEP 2: FIND DUPLICATES (same phone number, multiple scheduled SMS)
-- ============================================
SELECT 
    '=== DUPLICATE SCHEDULED SMS ===' as section,
    customer_phone,
    COUNT(*) as duplicate_count,
    STRING_AGG(job_ref, ', ') as job_refs
FROM jobs
WHERE post_collection_sms_scheduled_at IS NOT NULL
    AND post_collection_sms_sent_at IS NULL
GROUP BY customer_phone
HAVING COUNT(*) > 1
ORDER BY duplicate_count DESC;

-- STEP 3: FIX SCHEDULED TIMES OUTSIDE ALLOWED HOURS
-- ============================================
-- Move any scheduled SMS outside 8am-8pm to next available window
UPDATE jobs
SET post_collection_sms_scheduled_at = CASE
    -- If scheduled before 8am, move to 8am same day
    WHEN EXTRACT(HOUR FROM post_collection_sms_scheduled_at) < 8 THEN
        DATE_TRUNC('day', post_collection_sms_scheduled_at) + INTERVAL '8 hours'
    -- If scheduled after 8pm, move to 10am next day
    WHEN EXTRACT(HOUR FROM post_collection_sms_scheduled_at) >= 20 THEN
        DATE_TRUNC('day', post_collection_sms_scheduled_at) + INTERVAL '1 day' + INTERVAL '10 hours'
    ELSE post_collection_sms_scheduled_at
END
WHERE post_collection_sms_scheduled_at IS NOT NULL
    AND post_collection_sms_sent_at IS NULL
    AND (
        EXTRACT(HOUR FROM post_collection_sms_scheduled_at) < 8 
        OR EXTRACT(HOUR FROM post_collection_sms_scheduled_at) >= 20
    )
RETURNING job_ref, customer_name, post_collection_sms_scheduled_at;

-- STEP 4: HANDLE DUPLICATES - Keep earliest scheduled, mark others as skipped
-- ============================================
WITH duplicates AS (
    SELECT 
        id,
        customer_phone,
        post_collection_sms_scheduled_at,
        ROW_NUMBER() OVER (
            PARTITION BY customer_phone 
            ORDER BY post_collection_sms_scheduled_at ASC
        ) as rn
    FROM jobs
    WHERE post_collection_sms_scheduled_at IS NOT NULL
        AND post_collection_sms_sent_at IS NULL
)
UPDATE jobs
SET 
    post_collection_sms_sent_at = NOW(),
    post_collection_sms_delivery_status = 'SKIPPED_DUPLICATE',
    post_collection_sms_body = 'Skipped - duplicate phone number (keeping earliest scheduled)'
FROM duplicates
WHERE jobs.id = duplicates.id
    AND duplicates.rn > 1
RETURNING jobs.job_ref, jobs.customer_name, jobs.customer_phone;

-- STEP 5: VERIFY FIXES
-- ============================================
SELECT 
    '=== VERIFICATION - SCHEDULED SMS AFTER FIXES ===' as section,
    job_ref,
    customer_name,
    customer_phone,
    post_collection_sms_scheduled_at,
    TO_CHAR(post_collection_sms_scheduled_at, 'Day, Mon DD at HH24:MI') as scheduled_time_readable,
    EXTRACT(HOUR FROM post_collection_sms_scheduled_at) as hour,
    CASE 
        WHEN EXTRACT(HOUR FROM post_collection_sms_scheduled_at) < 8 THEN '✗ STILL TOO EARLY'
        WHEN EXTRACT(HOUR FROM post_collection_sms_scheduled_at) >= 20 THEN '✗ STILL TOO LATE'
        ELSE '✓ OK'
    END as time_check,
    CASE 
        WHEN post_collection_sms_scheduled_at < NOW() THEN 'READY TO SEND NOW'
        ELSE 'Scheduled for future'
    END as send_status
FROM jobs
WHERE post_collection_sms_scheduled_at IS NOT NULL
    AND post_collection_sms_sent_at IS NULL
ORDER BY post_collection_sms_scheduled_at;

-- STEP 6: CHECK FOR REMAINING DUPLICATES
-- ============================================
SELECT 
    '=== DUPLICATE CHECK AFTER FIXES ===' as section,
    customer_phone,
    COUNT(*) as count,
    STRING_AGG(job_ref, ', ') as job_refs,
    CASE 
        WHEN COUNT(*) > 1 THEN '✗ STILL HAS DUPLICATES'
        ELSE '✓ NO DUPLICATES'
    END as status
FROM jobs
WHERE post_collection_sms_scheduled_at IS NOT NULL
    AND post_collection_sms_sent_at IS NULL
GROUP BY customer_phone
ORDER BY count DESC;

-- STEP 7: SUMMARY
-- ============================================
SELECT 
    '=== SUMMARY ===' as section,
    (SELECT COUNT(*) FROM jobs 
     WHERE post_collection_sms_scheduled_at IS NOT NULL 
     AND post_collection_sms_sent_at IS NULL) as total_scheduled,
    (SELECT COUNT(*) FROM jobs 
     WHERE post_collection_sms_scheduled_at IS NOT NULL 
     AND post_collection_sms_sent_at IS NULL
     AND EXTRACT(HOUR FROM post_collection_sms_scheduled_at) >= 8
     AND EXTRACT(HOUR FROM post_collection_sms_scheduled_at) < 20) as within_allowed_hours,
    (SELECT COUNT(DISTINCT customer_phone) FROM jobs 
     WHERE post_collection_sms_scheduled_at IS NOT NULL 
     AND post_collection_sms_sent_at IS NULL) as unique_phone_numbers,
    (SELECT COUNT(*) FROM jobs 
     WHERE post_collection_sms_delivery_status = 'SKIPPED_DUPLICATE') as duplicates_removed;
