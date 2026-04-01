-- ============================================
-- VIEW SCHEDULED REVIEW SMS IN DATABASE
-- ============================================
-- This shows you the scheduled times and status of review SMS

-- 1. ALL JOBS WITH SCHEDULED REVIEW SMS
-- ============================================
SELECT 
    job_ref,
    customer_name,
    customer_phone,
    status,
    collected_at,
    post_collection_sms_scheduled_at,
    post_collection_sms_sent_at,
    post_collection_sms_delivery_status,
    CASE 
        WHEN post_collection_sms_sent_at IS NOT NULL THEN '✓ SENT'
        WHEN post_collection_sms_scheduled_at < NOW() THEN '⚠ OVERDUE (should send on next cron run)'
        WHEN post_collection_sms_scheduled_at > NOW() THEN '⏳ SCHEDULED FOR FUTURE'
        ELSE 'UNKNOWN'
    END as sms_status,
    CASE 
        WHEN post_collection_sms_scheduled_at > NOW() THEN 
            EXTRACT(HOUR FROM (post_collection_sms_scheduled_at - NOW())) || ' hours ' ||
            EXTRACT(MINUTE FROM (post_collection_sms_scheduled_at - NOW())) || ' minutes from now'
        WHEN post_collection_sms_sent_at IS NULL THEN
            'Overdue by ' || EXTRACT(HOUR FROM (NOW() - post_collection_sms_scheduled_at)) || ' hours'
        ELSE 'Already sent'
    END as time_until_send
FROM jobs
WHERE post_collection_sms_scheduled_at IS NOT NULL
ORDER BY post_collection_sms_scheduled_at DESC;

-- 2. JUST THE KEY COLUMNS (SIMPLER VIEW)
-- ============================================
SELECT 
    job_ref,
    customer_name,
    post_collection_sms_scheduled_at as scheduled_time,
    post_collection_sms_sent_at as sent_time,
    post_collection_sms_delivery_status as delivery_status
FROM jobs
WHERE post_collection_sms_scheduled_at IS NOT NULL
ORDER BY post_collection_sms_scheduled_at DESC;

-- 3. PENDING REVIEW SMS (Not sent yet)
-- ============================================
SELECT 
    '=== PENDING REVIEW SMS ===' as section,
    job_ref,
    customer_name,
    post_collection_sms_scheduled_at,
    CASE 
        WHEN post_collection_sms_scheduled_at < NOW() THEN 'READY TO SEND NOW'
        ELSE 'Scheduled for ' || TO_CHAR(post_collection_sms_scheduled_at, 'Day, Mon DD at HH24:MI')
    END as when_to_send
FROM jobs
WHERE post_collection_sms_scheduled_at IS NOT NULL
    AND post_collection_sms_sent_at IS NULL
ORDER BY post_collection_sms_scheduled_at;

-- 4. RECENTLY SENT REVIEW SMS
-- ============================================
SELECT 
    '=== RECENTLY SENT REVIEW SMS ===' as section,
    job_ref,
    customer_name,
    post_collection_sms_sent_at,
    post_collection_sms_delivery_status,
    LEFT(post_collection_sms_body, 100) as sms_preview
FROM jobs
WHERE post_collection_sms_sent_at IS NOT NULL
ORDER BY post_collection_sms_sent_at DESC
LIMIT 10;
