-- ============================================
-- FIND COLLECTED JOBS MISSING REVIEW SMS
-- ============================================

-- 1. COUNT COLLECTED JOBS
-- ============================================
SELECT 
    '=== COLLECTED JOBS COUNT ===' as section,
    COUNT(*) as total_collected,
    COUNT(CASE WHEN post_collection_sms_sent_at IS NOT NULL THEN 1 END) as has_review_sms,
    COUNT(CASE WHEN post_collection_sms_sent_at IS NULL THEN 1 END) as missing_review_sms,
    COUNT(CASE WHEN skip_review_request = true THEN 1 END) as review_disabled,
    COUNT(CASE WHEN customer_flag IN ('sensitive', 'awkward') THEN 1 END) as flagged_customers
FROM jobs
WHERE status = 'COLLECTED';

-- 2. SHOW ALL COLLECTED JOBS WITH REVIEW STATUS
-- ============================================
SELECT 
    job_ref,
    customer_name,
    customer_phone,
    status,
    collected_at,
    skip_review_request,
    customer_flag,
    post_collection_sms_scheduled_at,
    post_collection_sms_sent_at,
    post_collection_sms_delivery_status,
    CASE 
        WHEN post_collection_sms_sent_at IS NOT NULL THEN '✓ Review SMS sent'
        WHEN post_collection_sms_scheduled_at IS NOT NULL THEN '⏳ Scheduled but not sent'
        WHEN skip_review_request = true THEN '✗ Review disabled (manual)'
        WHEN customer_flag IN ('sensitive', 'awkward') THEN '✗ Review disabled (customer flag)'
        ELSE '⚠ SHOULD HAVE REVIEW SMS'
    END as review_status,
    CASE 
        WHEN collected_at IS NULL THEN 'Missing collected_at timestamp'
        WHEN collected_at < NOW() - INTERVAL '30 days' THEN 'Too old (>30 days)'
        ELSE 'Eligible for review'
    END as eligibility
FROM jobs
WHERE status = 'COLLECTED'
ORDER BY collected_at DESC NULLS LAST;

-- 3. JOBS THAT SHOULD HAVE REVIEW SMS BUT DON'T
-- ============================================
SELECT 
    '=== JOBS MISSING REVIEW SMS ===' as section,
    job_ref,
    customer_name,
    status,
    collected_at,
    EXTRACT(DAY FROM (NOW() - collected_at)) as days_since_collection,
    skip_review_request,
    customer_flag,
    post_collection_sms_scheduled_at,
    post_collection_sms_sent_at
FROM jobs
WHERE status = 'COLLECTED'
    AND post_collection_sms_sent_at IS NULL
    AND post_collection_sms_scheduled_at IS NULL
    AND (skip_review_request IS NULL OR skip_review_request = false)
    AND (customer_flag IS NULL OR customer_flag NOT IN ('sensitive', 'awkward'))
ORDER BY collected_at DESC;

-- 4. CHECK IF ANY REVIEW SMS WERE SCHEDULED BUT NOT SENT
-- ============================================
SELECT 
    '=== SCHEDULED BUT NOT SENT ===' as section,
    job_ref,
    customer_name,
    post_collection_sms_scheduled_at,
    CASE 
        WHEN post_collection_sms_scheduled_at < NOW() THEN 'OVERDUE'
        ELSE 'FUTURE'
    END as schedule_status,
    EXTRACT(HOUR FROM (NOW() - post_collection_sms_scheduled_at)) as hours_overdue
FROM jobs
WHERE status = 'COLLECTED'
    AND post_collection_sms_scheduled_at IS NOT NULL
    AND post_collection_sms_sent_at IS NULL
ORDER BY post_collection_sms_scheduled_at;

-- 5. RECENT COLLECTED JOBS (Last 20)
-- ============================================
SELECT 
    '=== RECENT COLLECTED JOBS (Last 20) ===' as section,
    job_ref,
    customer_name,
    collected_at,
    skip_review_request,
    customer_flag,
    CASE 
        WHEN post_collection_sms_sent_at IS NOT NULL THEN '✓ SENT'
        WHEN post_collection_sms_scheduled_at IS NOT NULL THEN '⏳ SCHEDULED'
        WHEN skip_review_request = true THEN '✗ DISABLED'
        WHEN customer_flag IN ('sensitive', 'awkward') THEN '✗ FLAGGED'
        ELSE '⚠ MISSING'
    END as sms_status
FROM jobs
WHERE status = 'COLLECTED'
ORDER BY collected_at DESC NULLS LAST
LIMIT 20;
