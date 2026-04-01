-- ============================================
-- CHECK NOTIFICATION CONFIG FOR COLLECTED STATUS
-- ============================================
-- This checks if COLLECTED status triggers the review SMS scheduling

-- 1. CHECK COLLECTED NOTIFICATION CONFIG
-- ============================================
SELECT 
    '=== COLLECTED NOTIFICATION CONFIG ===' as section,
    status_key,
    status_label,
    send_sms,
    send_email,
    is_active,
    description,
    CASE 
        WHEN send_sms = false AND is_active = true THEN '✓ CORRECT - SMS disabled, will trigger review scheduling'
        WHEN send_sms = true THEN '⚠ ISSUE - SMS enabled, may not trigger review scheduling'
        WHEN is_active = false THEN '✗ PROBLEM - Status inactive'
        ELSE 'UNKNOWN'
    END as config_status
FROM notification_config
WHERE status_key = 'COLLECTED';

-- 2. CHECK ALL NOTIFICATION CONFIGS
-- ============================================
SELECT 
    '=== ALL NOTIFICATION CONFIGS ===' as section,
    status_key,
    send_sms,
    send_email,
    is_active
FROM notification_config
ORDER BY status_key;
