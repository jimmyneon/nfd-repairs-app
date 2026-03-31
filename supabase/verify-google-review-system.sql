-- ============================================
-- VERIFY GOOGLE REVIEW SYSTEM (ACTUAL SCHEMA)
-- ============================================

-- 1. CHECK GOOGLE REVIEW LINK CONFIGURATION
-- ============================================
SELECT 
    '=== GOOGLE REVIEW LINK ===' as section,
    key,
    value as review_link,
    CASE 
        WHEN value IS NULL OR value = '' THEN '✗ NOT SET'
        WHEN value LIKE 'https://g.page/%' OR value LIKE 'https://maps.app.goo.gl/%' THEN '✓ VALID GOOGLE LINK'
        WHEN value LIKE 'http%' THEN '⚠ LINK SET (verify it is correct)'
        ELSE '✗ INVALID FORMAT'
    END as status
FROM admin_settings
WHERE key = 'google_review_link';

-- 2. CHECK JOBS WITH REVIEW SMS SCHEDULED
-- ============================================
SELECT 
    '=== SCHEDULED REVIEW SMS ===' as section,
    COUNT(*) as total_scheduled,
    COUNT(CASE WHEN post_collection_sms_sent_at IS NULL THEN 1 END) as pending,
    COUNT(CASE WHEN post_collection_sms_sent_at IS NOT NULL THEN 1 END) as already_sent,
    MIN(post_collection_sms_scheduled_at) as earliest_scheduled,
    MAX(post_collection_sms_scheduled_at) as latest_scheduled
FROM jobs
WHERE post_collection_sms_scheduled_at IS NOT NULL;

-- 3. CHECK RECENT REVIEW SMS SENT
-- ============================================
SELECT 
    '=== RECENT REVIEW SMS (Last 10) ===' as section,
    job_ref,
    customer_name,
    status,
    post_collection_sms_scheduled_at,
    post_collection_sms_sent_at,
    post_collection_sms_delivery_status,
    CASE 
        WHEN post_collection_sms_delivery_status = 'SENT' THEN '✓ SENT'
        WHEN post_collection_sms_delivery_status = 'FAILED' THEN '✗ FAILED'
        WHEN post_collection_sms_sent_at IS NULL AND post_collection_sms_scheduled_at < NOW() THEN '⚠ OVERDUE'
        WHEN post_collection_sms_sent_at IS NULL THEN '⏳ PENDING'
        ELSE 'UNKNOWN'
    END as sms_status
FROM jobs
WHERE post_collection_sms_scheduled_at IS NOT NULL
ORDER BY post_collection_sms_scheduled_at DESC
LIMIT 10;

-- 4. CHECK JOBS WITH REVIEW DISABLED
-- ============================================
SELECT 
    '=== JOBS WITH REVIEW DISABLED ===' as section,
    COUNT(*) as total_disabled,
    COUNT(CASE WHEN skip_review_request = true THEN 1 END) as manually_disabled,
    COUNT(CASE WHEN customer_flag IN ('sensitive', 'awkward') THEN 1 END) as disabled_by_flag
FROM jobs;

-- 5. SHOW JOBS WITH REVIEW DISABLED (Details)
-- ============================================
SELECT 
    '=== DISABLED REVIEW DETAILS (Last 10) ===' as section,
    job_ref,
    customer_name,
    status,
    skip_review_request,
    customer_flag,
    customer_flag_notes,
    CASE 
        WHEN skip_review_request = true THEN 'Manually disabled'
        WHEN customer_flag = 'sensitive' THEN 'Customer flagged: sensitive'
        WHEN customer_flag = 'awkward' THEN 'Customer flagged: awkward'
        ELSE 'Unknown reason'
    END as reason
FROM jobs
WHERE skip_review_request = true 
   OR customer_flag IN ('sensitive', 'awkward')
ORDER BY created_at DESC
LIMIT 10;

-- 6. CHECK COLLECTED JOBS WITHOUT REVIEW SMS
-- ============================================
SELECT 
    '=== COLLECTED JOBS MISSING REVIEW SMS ===' as section,
    job_ref,
    customer_name,
    status,
    collected_at,
    skip_review_request,
    customer_flag,
    post_collection_sms_scheduled_at,
    post_collection_sms_sent_at,
    CASE 
        WHEN skip_review_request = true THEN 'Review disabled'
        WHEN customer_flag IN ('sensitive', 'awkward') THEN 'Customer flagged'
        WHEN post_collection_sms_scheduled_at IS NULL THEN '⚠ NOT SCHEDULED'
        ELSE 'Should be scheduled'
    END as issue
FROM jobs
WHERE status = 'COLLECTED'
    AND collected_at IS NOT NULL
    AND collected_at > NOW() - INTERVAL '7 days'
ORDER BY collected_at DESC
LIMIT 20;

-- 7. REVIEW SMS SUCCESS RATE
-- ============================================
SELECT 
    '=== REVIEW SMS SUCCESS METRICS ===' as section,
    COUNT(*) as total_sent,
    COUNT(CASE WHEN post_collection_sms_delivery_status = 'SENT' THEN 1 END) as successful,
    COUNT(CASE WHEN post_collection_sms_delivery_status = 'FAILED' THEN 1 END) as failed,
    ROUND(100.0 * COUNT(CASE WHEN post_collection_sms_delivery_status = 'SENT' THEN 1 END) / NULLIF(COUNT(*), 0), 2) as success_rate_percent
FROM jobs
WHERE post_collection_sms_sent_at IS NOT NULL;

-- 8. REVIEW SMS ACTIVITY (Last 7 Days)
-- ============================================
SELECT 
    '=== REVIEW SMS ACTIVITY (Last 7 Days) ===' as section,
    COUNT(CASE WHEN post_collection_sms_scheduled_at > NOW() - INTERVAL '7 days' THEN 1 END) as scheduled_last_7_days,
    COUNT(CASE WHEN post_collection_sms_sent_at > NOW() - INTERVAL '7 days' THEN 1 END) as sent_last_7_days,
    COUNT(CASE WHEN post_collection_sms_sent_at > NOW() - INTERVAL '24 hours' THEN 1 END) as sent_last_24_hours,
    MAX(post_collection_sms_sent_at) as last_sent_at
FROM jobs;

-- 9. SAMPLE REVIEW SMS BODY
-- ============================================
SELECT 
    '=== SAMPLE REVIEW SMS CONTENT ===' as section,
    job_ref,
    customer_name,
    post_collection_sms_sent_at,
    LEFT(post_collection_sms_body, 200) as sms_preview,
    CASE 
        WHEN post_collection_sms_body LIKE '%g.page%' OR post_collection_sms_body LIKE '%maps.app.goo.gl%' THEN '✓ Contains review link'
        ELSE '✗ Missing review link'
    END as link_check
FROM jobs
WHERE post_collection_sms_body IS NOT NULL
ORDER BY post_collection_sms_sent_at DESC
LIMIT 5;

-- 10. SUMMARY DASHBOARD
-- ============================================
SELECT 
    '=== SUMMARY ===' as section,
    (SELECT value FROM admin_settings WHERE key = 'google_review_link') as google_review_link,
    (SELECT COUNT(*) FROM jobs WHERE post_collection_sms_scheduled_at IS NOT NULL) as total_scheduled,
    (SELECT COUNT(*) FROM jobs WHERE post_collection_sms_sent_at IS NOT NULL) as total_sent,
    (SELECT COUNT(*) FROM jobs WHERE skip_review_request = true OR customer_flag IN ('sensitive', 'awkward')) as total_disabled,
    (SELECT COUNT(*) FROM jobs WHERE post_collection_sms_delivery_status = 'SENT') as successful_deliveries,
    (SELECT COUNT(*) FROM jobs WHERE post_collection_sms_delivery_status = 'FAILED') as failed_deliveries;
