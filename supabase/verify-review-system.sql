-- ============================================
-- GOOGLE REVIEW SYSTEM VERIFICATION
-- ============================================
-- This file checks all aspects of the Google review system setup

-- 1. CHECK ADMIN SETTINGS FOR REVIEW CONFIGURATION
-- ============================================
SELECT 
    'ADMIN SETTINGS - Review Configuration' as check_type,
    key,
    value,
    CASE 
        WHEN key = 'google_review_enabled' THEN 
            CASE WHEN value = 'true' THEN '✓ ENABLED' ELSE '✗ DISABLED' END
        WHEN key = 'google_review_link' THEN 
            CASE WHEN value IS NOT NULL AND value != '' THEN '✓ CONFIGURED' ELSE '✗ MISSING' END
        WHEN key = 'auto_review_request_enabled' THEN 
            CASE WHEN value = 'true' THEN '✓ ENABLED' ELSE '✗ DISABLED' END
        WHEN key = 'review_request_delay_hours' THEN 
            '⏱ Delay: ' || value || ' hours'
        ELSE 'INFO'
    END as status
FROM admin_settings
WHERE key IN (
    'google_review_enabled',
    'google_review_link',
    'auto_review_request_enabled',
    'review_request_delay_hours'
)
ORDER BY key;

-- 2. CHECK IF REVIEW_REQUESTS TABLE EXISTS AND HAS DATA
-- ============================================
SELECT 
    'REVIEW REQUESTS TABLE - Overview' as check_type,
    COUNT(*) as total_requests,
    COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_requests,
    COUNT(CASE WHEN status = 'sent' THEN 1 END) as sent_requests,
    COUNT(CASE WHEN status = 'clicked' THEN 1 END) as clicked_requests,
    COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_requests,
    COUNT(CASE WHEN status = 'expired' THEN 1 END) as expired_requests,
    MAX(created_at) as last_request_created,
    MAX(sent_at) as last_request_sent
FROM review_requests;

-- 3. CHECK RECENT REVIEW REQUESTS (Last 10)
-- ============================================
SELECT 
    'RECENT REVIEW REQUESTS - Last 10' as check_type,
    rr.id,
    rr.job_id,
    j.customer_name,
    j.customer_phone,
    rr.status,
    rr.created_at,
    rr.sent_at,
    rr.clicked_at,
    rr.expires_at,
    CASE 
        WHEN rr.status = 'sent' AND rr.expires_at < NOW() THEN '⚠ EXPIRED'
        WHEN rr.status = 'pending' THEN '⏳ WAITING TO SEND'
        WHEN rr.status = 'sent' THEN '✓ SENT'
        WHEN rr.status = 'clicked' THEN '✓✓ CLICKED'
        WHEN rr.status = 'completed' THEN '✓✓✓ COMPLETED'
        ELSE rr.status
    END as status_indicator
FROM review_requests rr
LEFT JOIN jobs j ON rr.job_id = j.id
ORDER BY rr.created_at DESC
LIMIT 10;

-- 4. CHECK SMS TEMPLATES FOR REVIEW REQUESTS
-- ============================================
SELECT 
    'SMS TEMPLATES - Review Request' as check_type,
    key as template_key,
    body as template_text,
    is_active,
    CASE 
        WHEN is_active = true THEN '✓ ACTIVE'
        ELSE '✗ INACTIVE'
    END as status,
    CASE 
        WHEN body LIKE '%{review_link}%' THEN '✓ Has review link placeholder'
        ELSE '✗ Missing review link placeholder'
    END as link_check
FROM sms_templates
WHERE key = 'review_request';

-- 5. CHECK JOBS ELIGIBLE FOR REVIEW REQUESTS
-- ============================================
SELECT 
    'ELIGIBLE JOBS - Ready for Review Request' as check_type,
    COUNT(*) as eligible_jobs,
    COUNT(CASE WHEN j.id IN (SELECT job_id FROM review_requests) THEN 1 END) as already_has_request,
    COUNT(CASE WHEN j.id NOT IN (SELECT job_id FROM review_requests WHERE job_id IS NOT NULL) THEN 1 END) as needs_request
FROM jobs j
WHERE j.status = 'completed'
    AND j.completed_at IS NOT NULL
    AND j.completed_at > NOW() - INTERVAL '30 days';

-- 6. CHECK CRON JOB CONFIGURATION (if using pg_cron)
-- ============================================
SELECT 
    'CRON JOBS - Scheduled Tasks' as check_type,
    jobid,
    jobname,
    schedule,
    command,
    active,
    CASE WHEN active THEN '✓ ACTIVE' ELSE '✗ INACTIVE' END as status
FROM cron.job
WHERE jobname LIKE '%review%'
ORDER BY jobid;

-- 7. CHECK TRIGGER FUNCTIONS FOR AUTO REVIEW REQUEST
-- ============================================
SELECT 
    'TRIGGER FUNCTIONS - Auto Review Request' as check_type,
    p.proname as function_name,
    pg_get_functiondef(p.oid) as function_definition
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
    AND p.proname LIKE '%review%'
ORDER BY p.proname;

-- 8. CHECK TRIGGERS ON JOBS TABLE
-- ============================================
SELECT 
    'TRIGGERS - Jobs Table' as check_type,
    t.tgname as trigger_name,
    t.tgenabled as enabled,
    CASE 
        WHEN t.tgenabled = 'O' THEN '✓ ENABLED'
        WHEN t.tgenabled = 'D' THEN '✗ DISABLED'
        ELSE 'UNKNOWN'
    END as status,
    pg_get_triggerdef(t.oid) as trigger_definition
FROM pg_trigger t
JOIN pg_class c ON t.tgrelid = c.oid
JOIN pg_namespace n ON c.relnamespace = n.oid
WHERE n.nspname = 'public'
    AND c.relname = 'jobs'
    AND t.tgname LIKE '%review%'
ORDER BY t.tgname;

-- 9. SUMMARY REPORT
-- ============================================
SELECT 
    'SUMMARY REPORT' as check_type,
    (SELECT value FROM admin_settings WHERE key = 'google_review_enabled') as review_enabled,
    (SELECT value FROM admin_settings WHERE key = 'google_review_link') as review_link,
    (SELECT value FROM admin_settings WHERE key = 'auto_review_request_enabled') as auto_request_enabled,
    (SELECT COUNT(*) FROM review_requests) as total_review_requests,
    (SELECT COUNT(*) FROM review_requests WHERE status = 'sent') as sent_count,
    (SELECT COUNT(*) FROM review_requests WHERE status = 'clicked') as clicked_count,
    (SELECT is_active FROM sms_templates WHERE key = 'review_request') as sms_template_active,
    (SELECT COUNT(*) FROM cron.job WHERE jobname LIKE '%review%' AND active = true) as active_cron_jobs;
