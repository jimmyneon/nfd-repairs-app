-- ============================================
-- QUICK REVIEW SYSTEM CHECK
-- ============================================
-- Run this for a fast overview of the review system status

-- QUICK STATUS DASHBOARD
-- ============================================
WITH settings AS (
    SELECT 
        MAX(CASE WHEN key = 'google_review_enabled' THEN value END) as review_enabled,
        MAX(CASE WHEN key = 'google_review_link' THEN value END) as review_link,
        MAX(CASE WHEN key = 'auto_review_request_enabled' THEN value END) as auto_enabled,
        MAX(CASE WHEN key = 'review_request_delay_hours' THEN value END) as delay_hours
    FROM admin_settings
    WHERE key IN ('google_review_enabled', 'google_review_link', 'auto_review_request_enabled', 'review_request_delay_hours')
),
review_stats AS (
    SELECT 
        COUNT(*) as total,
        COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending,
        COUNT(CASE WHEN status = 'sent' THEN 1 END) as sent,
        COUNT(CASE WHEN status = 'clicked' THEN 1 END) as clicked,
        COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed,
        MAX(created_at) as last_created,
        MAX(sent_at) as last_sent
    FROM review_requests
),
sms_template AS (
    SELECT 
        is_active,
        body as template_text
    FROM sms_templates
    WHERE key = 'review_request'
    LIMIT 1
)
SELECT 
    '=== REVIEW SYSTEM STATUS ===' as status,
    '' as separator1,
    '📋 CONFIGURATION:' as config_header,
    CASE WHEN s.review_enabled = 'true' THEN '  ✓ Review System Enabled' ELSE '  ✗ Review System Disabled' END as review_status,
    CASE WHEN s.review_link IS NOT NULL AND s.review_link != '' THEN '  ✓ Google Review Link Set' ELSE '  ✗ Google Review Link Missing' END as link_status,
    CASE WHEN s.auto_enabled = 'true' THEN '  ✓ Auto-Request Enabled' ELSE '  ✗ Auto-Request Disabled' END as auto_status,
    '  ⏱ Delay: ' || COALESCE(s.delay_hours, '24') || ' hours' as delay_setting,
    '' as separator2,
    '📊 STATISTICS:' as stats_header,
    '  Total Requests: ' || COALESCE(rs.total::text, '0') as total_requests,
    '  Pending: ' || COALESCE(rs.pending::text, '0') as pending_requests,
    '  Sent: ' || COALESCE(rs.sent::text, '0') as sent_requests,
    '  Clicked: ' || COALESCE(rs.clicked::text, '0') as clicked_requests,
    '  Completed: ' || COALESCE(rs.completed::text, '0') as completed_requests,
    '' as separator3,
    '📱 SMS TEMPLATE:' as sms_header,
    CASE WHEN st.is_active THEN '  ✓ Template Active' ELSE '  ✗ Template Inactive' END as template_status,
    CASE WHEN st.template_text LIKE '%{review_link}%' THEN '  ✓ Has {review_link} placeholder' ELSE '  ✗ Missing placeholder' END as placeholder_check,
    '' as separator4,
    '🕐 RECENT ACTIVITY:' as activity_header,
    '  Last Created: ' || COALESCE(rs.last_created::text, 'Never') as last_created,
    '  Last Sent: ' || COALESCE(rs.last_sent::text, 'Never') as last_sent
FROM settings s
CROSS JOIN review_stats rs
CROSS JOIN sms_template st;

-- SHOW ACTUAL VALUES
SELECT 
    '=== ACTUAL CONFIGURATION VALUES ===' as section,
    key,
    value
FROM admin_settings
WHERE key IN ('google_review_enabled', 'google_review_link', 'auto_review_request_enabled', 'review_request_delay_hours')
ORDER BY key;

-- SHOW SMS TEMPLATE
SELECT 
    '=== SMS TEMPLATE ===' as section,
    key as template_key,
    body as template_text,
    is_active
FROM sms_templates
WHERE key = 'review_request';

-- SHOW RECENT REVIEW REQUESTS
SELECT 
    '=== RECENT REVIEW REQUESTS (Last 5) ===' as section,
    rr.id,
    rr.job_id,
    j.job_number,
    j.customer_name,
    rr.status,
    rr.created_at,
    rr.sent_at,
    rr.clicked_at
FROM review_requests rr
LEFT JOIN jobs j ON rr.job_id = j.id
ORDER BY rr.created_at DESC
LIMIT 5;

-- CHECK FOR ISSUES
SELECT 
    '=== POTENTIAL ISSUES ===' as section,
    CASE 
        WHEN (SELECT value FROM admin_settings WHERE key = 'google_review_enabled') != 'true' 
        THEN '⚠ Review system is disabled'
        WHEN (SELECT value FROM admin_settings WHERE key = 'google_review_link') IS NULL 
        THEN '⚠ Google review link not configured'
        WHEN (SELECT COUNT(*) FROM review_requests WHERE status = 'pending' AND created_at < NOW() - INTERVAL '48 hours') > 0
        THEN '⚠ Old pending requests found (>48 hours)'
        WHEN (SELECT is_active FROM sms_templates WHERE key = 'review_request') = false
        THEN '⚠ SMS template is inactive'
        WHEN NOT EXISTS (SELECT 1 FROM review_requests WHERE created_at > NOW() - INTERVAL '7 days')
        THEN '⚠ No review requests created in last 7 days'
        ELSE '✓ No obvious issues detected'
    END as issue_check;
