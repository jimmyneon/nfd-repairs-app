-- ============================================
-- CHECK COLLECTED JOBS FOR REVIEW SMS
-- ============================================

-- 1. CHECK IF YOU HAVE ANY COLLECTED JOBS
-- ============================================
SELECT 
    '=== COLLECTED JOBS ===' as section,
    COUNT(*) as total_collected_jobs,
    COUNT(CASE WHEN collected_at IS NOT NULL THEN 1 END) as has_collected_at_timestamp,
    MIN(collected_at) as first_collected,
    MAX(collected_at) as last_collected
FROM jobs
WHERE status = 'COLLECTED';

-- 2. SHOW RECENT COLLECTED JOBS
-- ============================================
SELECT 
    '=== RECENT COLLECTED JOBS (Last 10) ===' as section,
    job_ref,
    customer_name,
    status,
    collected_at,
    skip_review_request,
    customer_flag,
    post_collection_sms_scheduled_at,
    post_collection_sms_sent_at,
    CASE 
        WHEN post_collection_sms_sent_at IS NOT NULL THEN '✓ Review SMS sent'
        WHEN post_collection_sms_scheduled_at IS NOT NULL THEN '⏳ Review SMS scheduled'
        WHEN skip_review_request = true THEN '✗ Review disabled (manual)'
        WHEN customer_flag IN ('sensitive', 'awkward') THEN '✗ Review disabled (flag)'
        ELSE '⚠ NO REVIEW SMS SCHEDULED'
    END as review_status
FROM jobs
WHERE status = 'COLLECTED'
ORDER BY collected_at DESC NULLS LAST
LIMIT 10;

-- 3. CHECK ALL JOB STATUSES
-- ============================================
SELECT 
    '=== ALL JOB STATUSES ===' as section,
    status,
    COUNT(*) as count
FROM jobs
GROUP BY status
ORDER BY count DESC;

-- 4. CHECK IF collected_at COLUMN EXISTS AND IS POPULATED
-- ============================================
SELECT 
    '=== COLLECTED_AT COLUMN CHECK ===' as section,
    COUNT(*) as total_jobs,
    COUNT(CASE WHEN status = 'COLLECTED' THEN 1 END) as collected_status_count,
    COUNT(CASE WHEN collected_at IS NOT NULL THEN 1 END) as has_collected_timestamp,
    COUNT(CASE WHEN status = 'COLLECTED' AND collected_at IS NULL THEN 1 END) as collected_but_no_timestamp
FROM jobs;

-- 5. CHECK IF REVIEW SMS COLUMNS EXIST
-- ============================================
SELECT 
    column_name,
    data_type,
    is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
    AND table_name = 'jobs'
    AND column_name IN (
        'skip_review_request',
        'customer_flag',
        'customer_flag_notes',
        'post_collection_sms_scheduled_at',
        'post_collection_sms_sent_at',
        'post_collection_sms_delivery_status',
        'post_collection_sms_body',
        'collected_at'
    )
ORDER BY column_name;
