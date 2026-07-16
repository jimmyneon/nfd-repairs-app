-- ============================================
-- VIEW GOOGLE REVIEW CONFIGURATION
-- ============================================

-- 1. GOOGLE REVIEW LINK IN ADMIN_SETTINGS TABLE
-- ============================================
SELECT 
    '=== GOOGLE REVIEW LINK ===' as section,
    id,
    key,
    value as google_review_link,
    description,
    updated_at
FROM admin_settings
WHERE key = 'google_review_link';

-- 2. ALL ADMIN SETTINGS (for context)
-- ============================================
SELECT 
    '=== ALL ADMIN SETTINGS ===' as section,
    key,
    value,
    description
FROM admin_settings
ORDER BY key;

-- 3. WHERE REVIEW SMS DATA IS STORED (in jobs table)
-- ============================================
-- This shows the columns in the jobs table that store review SMS info
SELECT 
    column_name,
    data_type,
    CASE column_name
        WHEN 'skip_review_request' THEN 'Toggle to disable review for this customer'
        WHEN 'customer_flag' THEN 'Customer flag (sensitive/awkward auto-disables review)'
        WHEN 'customer_flag_notes' THEN 'Notes about why customer is flagged'
        WHEN 'post_collection_sms_scheduled_at' THEN 'When review SMS is scheduled to send'
        WHEN 'post_collection_sms_sent_at' THEN 'When review SMS was actually sent'
        WHEN 'post_collection_sms_delivery_status' THEN 'SENT or FAILED'
        WHEN 'post_collection_sms_body' THEN 'The actual SMS text sent to customer'
        WHEN 'collected_at' THEN 'When customer collected their device'
    END as description
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

-- 4. SIMPLE VIEW: See review link and recent scheduled SMS
-- ============================================
SELECT 
    '=== QUICK OVERVIEW ===' as section,
    (SELECT value FROM admin_settings WHERE key = 'google_review_link') as google_review_link,
    (SELECT COUNT(*) FROM jobs WHERE post_collection_sms_scheduled_at IS NOT NULL) as total_scheduled,
    (SELECT COUNT(*) FROM jobs WHERE post_collection_sms_sent_at IS NOT NULL) as total_sent,
    (SELECT MAX(post_collection_sms_sent_at) FROM jobs) as last_sent_at;
