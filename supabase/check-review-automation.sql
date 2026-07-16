-- ============================================
-- CHECK REVIEW REQUEST AUTOMATION
-- ============================================
-- This file specifically checks the automation components

-- 1. CHECK IF AUTO-REVIEW FUNCTION EXISTS
-- ============================================
SELECT 
    'FUNCTION CHECK - Auto Review Request' as check_type,
    p.proname as function_name,
    pg_get_function_identity_arguments(p.oid) as arguments,
    CASE 
        WHEN p.proname IS NOT NULL THEN '✓ EXISTS'
        ELSE '✗ MISSING'
    END as status
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
    AND p.proname IN ('create_review_request_on_completion', 'process_pending_review_requests')
ORDER BY p.proname;

-- 2. CHECK TRIGGER ON JOBS TABLE FOR AUTO REVIEW
-- ============================================
SELECT 
    'TRIGGER CHECK - Jobs Completion' as check_type,
    t.tgname as trigger_name,
    c.relname as table_name,
    CASE 
        WHEN t.tgenabled = 'O' THEN '✓ ENABLED'
        WHEN t.tgenabled = 'D' THEN '✗ DISABLED'
        WHEN t.tgenabled = 'A' THEN '✓ ENABLED (ALWAYS)'
        ELSE '? UNKNOWN'
    END as status,
    CASE t.tgtype::integer & 2
        WHEN 2 THEN 'BEFORE'
        ELSE 'AFTER'
    END as timing,
    CASE t.tgtype::integer & 28
        WHEN 4 THEN 'INSERT'
        WHEN 8 THEN 'DELETE'
        WHEN 16 THEN 'UPDATE'
        ELSE 'MULTIPLE'
    END as event
FROM pg_trigger t
JOIN pg_class c ON t.tgrelid = c.oid
JOIN pg_namespace n ON c.relnamespace = n.oid
WHERE n.nspname = 'public'
    AND c.relname = 'jobs'
    AND NOT t.tgisinternal
ORDER BY t.tgname;

-- 3. CHECK CRON JOBS FOR REVIEW PROCESSING
-- ============================================
SELECT 
    'CRON JOB CHECK - Review Processing' as check_type,
    jobid,
    jobname,
    schedule,
    command,
    active,
    CASE WHEN active THEN '✓ ACTIVE' ELSE '✗ INACTIVE' END as status,
    database,
    username
FROM cron.job
WHERE jobname LIKE '%review%'
   OR command LIKE '%review%'
ORDER BY jobid;

-- 4. CHECK PENDING REVIEW REQUESTS THAT SHOULD BE SENT
-- ============================================
SELECT 
    'PENDING REVIEWS - Ready to Send' as check_type,
    rr.id,
    rr.job_id,
    j.job_number,
    j.customer_name,
    j.completed_at,
    rr.created_at,
    rr.status,
    EXTRACT(EPOCH FROM (NOW() - rr.created_at))/3600 as hours_pending,
    (SELECT value::integer FROM admin_settings WHERE key = 'review_request_delay_hours') as delay_hours_setting,
    CASE 
        WHEN EXTRACT(EPOCH FROM (NOW() - rr.created_at))/3600 >= 
             COALESCE((SELECT value::integer FROM admin_settings WHERE key = 'review_request_delay_hours'), 24)
        THEN '✓ READY TO SEND'
        ELSE '⏳ WAITING'
    END as send_status
FROM review_requests rr
JOIN jobs j ON rr.job_id = j.id
WHERE rr.status = 'pending'
ORDER BY rr.created_at;

-- 5. CHECK EXPIRED REVIEW REQUESTS
-- ============================================
SELECT 
    'EXPIRED REVIEWS - Past Expiration' as check_type,
    rr.id,
    rr.job_id,
    j.job_number,
    rr.status,
    rr.sent_at,
    rr.expires_at,
    EXTRACT(EPOCH FROM (NOW() - rr.expires_at))/3600 as hours_expired,
    CASE 
        WHEN rr.status = 'sent' AND rr.expires_at < NOW() THEN '⚠ SHOULD BE MARKED EXPIRED'
        WHEN rr.status = 'expired' THEN '✓ CORRECTLY MARKED'
        ELSE 'OK'
    END as expiry_status
FROM review_requests rr
JOIN jobs j ON rr.job_id = j.id
WHERE rr.expires_at < NOW()
ORDER BY rr.expires_at DESC
LIMIT 20;

-- 6. CHECK JOBS COMPLETED IN LAST 7 DAYS WITHOUT REVIEW REQUESTS
-- ============================================
SELECT 
    'MISSING REVIEWS - Recently Completed Jobs' as check_type,
    j.id,
    j.job_number,
    j.customer_name,
    j.status,
    j.completed_at,
    EXTRACT(EPOCH FROM (NOW() - j.completed_at))/3600 as hours_since_completion,
    CASE 
        WHEN EXISTS (SELECT 1 FROM review_requests WHERE job_id = j.id) 
        THEN '✓ Has review request'
        ELSE '✗ MISSING review request'
    END as review_status,
    (SELECT value FROM admin_settings WHERE key = 'auto_review_request_enabled') as auto_enabled
FROM jobs j
WHERE j.status = 'completed'
    AND j.completed_at > NOW() - INTERVAL '7 days'
    AND j.completed_at IS NOT NULL
ORDER BY j.completed_at DESC;

-- 7. CHECK REVIEW REQUEST SUCCESS RATE
-- ============================================
SELECT 
    'SUCCESS METRICS - Review Request Performance' as check_type,
    COUNT(*) as total_requests,
    COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_count,
    COUNT(CASE WHEN status = 'sent' THEN 1 END) as sent_count,
    COUNT(CASE WHEN status = 'clicked' THEN 1 END) as clicked_count,
    COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_count,
    COUNT(CASE WHEN status = 'expired' THEN 1 END) as expired_count,
    ROUND(100.0 * COUNT(CASE WHEN status = 'sent' THEN 1 END) / NULLIF(COUNT(*), 0), 2) as sent_percentage,
    ROUND(100.0 * COUNT(CASE WHEN status = 'clicked' THEN 1 END) / NULLIF(COUNT(CASE WHEN status = 'sent' THEN 1 END), 0), 2) as click_through_rate,
    ROUND(100.0 * COUNT(CASE WHEN status = 'completed' THEN 1 END) / NULLIF(COUNT(CASE WHEN status = 'sent' THEN 1 END), 0), 2) as completion_rate
FROM review_requests;

-- 8. CHECK RECENT AUTOMATION ACTIVITY
-- ============================================
SELECT 
    'RECENT ACTIVITY - Last 24 Hours' as check_type,
    COUNT(CASE WHEN created_at > NOW() - INTERVAL '24 hours' THEN 1 END) as created_last_24h,
    COUNT(CASE WHEN sent_at > NOW() - INTERVAL '24 hours' THEN 1 END) as sent_last_24h,
    COUNT(CASE WHEN clicked_at > NOW() - INTERVAL '24 hours' THEN 1 END) as clicked_last_24h,
    MAX(created_at) as last_created,
    MAX(sent_at) as last_sent,
    MAX(clicked_at) as last_clicked
FROM review_requests;

-- 9. DETAILED FUNCTION DEFINITIONS
-- ============================================
SELECT 
    'FUNCTION DEFINITIONS' as check_type,
    p.proname as function_name,
    pg_get_functiondef(p.oid) as full_definition
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
    AND p.proname IN ('create_review_request_on_completion', 'process_pending_review_requests')
ORDER BY p.proname;
