-- ============================================
-- VERIFY REVIEW TEMPLATE USES DATABASE LINKS
-- ============================================
-- This checks that the SMS template correctly references the review link from admin_settings

-- 1. CHECK CURRENT GOOGLE REVIEW LINK IN ADMIN_SETTINGS
-- ============================================
SELECT 
    '=== GOOGLE REVIEW LINK IN DATABASE ===' as section,
    key,
    value as review_link,
    CASE 
        WHEN value IS NULL OR value = '' THEN '✗ NOT SET'
        WHEN value LIKE 'https://g.page/%' OR value LIKE 'https://maps.app.goo.gl/%' THEN '✓ VALID GOOGLE LINK'
        WHEN value LIKE 'http%' THEN '⚠ LINK SET (verify it''s correct)'
        ELSE '✗ INVALID FORMAT'
    END as status
FROM admin_settings
WHERE key = 'google_review_link';

-- 2. CHECK SMS TEMPLATE FOR REVIEW REQUEST
-- ============================================
SELECT 
    '=== REVIEW REQUEST SMS TEMPLATE ===' as section,
    key as template_key,
    body as template_text,
    is_active,
    CASE 
        WHEN body LIKE '%{review_link}%' THEN '✓ Contains {review_link} placeholder'
        WHEN body LIKE '%review%' THEN '⚠ Mentions review but missing {review_link} placeholder'
        ELSE '✗ No review link placeholder found'
    END as placeholder_check,
    CASE 
        WHEN is_active = true THEN '✓ ACTIVE'
        ELSE '✗ INACTIVE'
    END as active_status
FROM sms_templates
WHERE key = 'review_request';

-- 3. SHOW FULL TEMPLATE TEXT
-- ============================================
SELECT 
    '=== FULL TEMPLATE TEXT ===' as section,
    body as template_text
FROM sms_templates
WHERE key = 'review_request';

-- 4. CHECK HOW THE LINK WOULD BE RENDERED
-- ============================================
-- This simulates how the template would look with the actual link
SELECT 
    '=== SIMULATED SMS MESSAGE ===' as section,
    REPLACE(
        st.body,
        '{review_link}',
        COALESCE(
            (SELECT value FROM admin_settings WHERE key = 'google_review_link'),
            '[LINK NOT SET IN DATABASE]'
        )
    ) as rendered_message,
    LENGTH(REPLACE(
        st.body,
        '{review_link}',
        COALESCE(
            (SELECT value FROM admin_settings WHERE key = 'google_review_link'),
            '[LINK NOT SET IN DATABASE]'
        )
    )) as message_length,
    CASE 
        WHEN LENGTH(REPLACE(
            st.body,
            '{review_link}',
            COALESCE(
                (SELECT value FROM admin_settings WHERE key = 'google_review_link'),
                '[LINK NOT SET IN DATABASE]'
            )
        )) <= 160 THEN '✓ Single SMS (≤160 chars)'
        WHEN LENGTH(REPLACE(
            st.body,
            '{review_link}',
            COALESCE(
                (SELECT value FROM admin_settings WHERE key = 'google_review_link'),
                '[LINK NOT SET IN DATABASE]'
            )
        )) <= 306 THEN '⚠ 2 SMS segments'
        ELSE '⚠ 3+ SMS segments'
    END as sms_segments
FROM sms_templates st
WHERE key = 'review_request';

-- 5. CHECK ALL PLACEHOLDERS IN TEMPLATE
-- ============================================
SELECT 
    '=== TEMPLATE PLACEHOLDERS ===' as section,
    body as template_text,
    CASE WHEN body LIKE '%{customer_name}%' THEN '✓' ELSE '✗' END as has_customer_name,
    CASE WHEN body LIKE '%{review_link}%' THEN '✓' ELSE '✗' END as has_review_link,
    CASE WHEN body LIKE '%{job_number}%' THEN '✓' ELSE '✗' END as has_job_number,
    CASE WHEN body LIKE '%{company_name}%' THEN '✓' ELSE '✗' END as has_company_name
FROM sms_templates
WHERE key = 'review_request';

-- 6. CHECK IF TEMPLATE NEEDS UPDATING
-- ============================================
SELECT 
    '=== TEMPLATE STATUS ===' as section,
    CASE 
        WHEN NOT EXISTS (SELECT 1 FROM sms_templates WHERE key = 'review_request') 
        THEN '✗ TEMPLATE MISSING - Needs to be created'
        WHEN (SELECT body FROM sms_templates WHERE key = 'review_request') NOT LIKE '%{review_link}%'
        THEN '✗ TEMPLATE BROKEN - Missing {review_link} placeholder'
        WHEN (SELECT is_active FROM sms_templates WHERE key = 'review_request') = false
        THEN '⚠ TEMPLATE INACTIVE - Needs to be activated'
        WHEN (SELECT value FROM admin_settings WHERE key = 'google_review_link') IS NULL
        THEN '⚠ LINK NOT SET - Need to set google_review_link in admin_settings'
        ELSE '✓ TEMPLATE CONFIGURED CORRECTLY'
    END as overall_status;

-- 7. RECOMMENDED TEMPLATE (if needed)
-- ============================================
SELECT 
    '=== RECOMMENDED TEMPLATE ===' as section,
    'Hi {customer_name}, thank you for choosing us! We''d love to hear about your experience. Please leave us a review: {review_link}' as recommended_template,
    'This template uses the {review_link} placeholder which will be replaced with the Google review link from admin_settings' as note;

-- 8. CHECK RECENT REVIEW REQUESTS TO SEE ACTUAL USAGE
-- ============================================
SELECT 
    '=== RECENT REVIEW REQUESTS ===' as section,
    rr.id,
    rr.job_id,
    j.job_number,
    j.customer_name,
    rr.status,
    rr.sent_at,
    (SELECT value FROM admin_settings WHERE key = 'google_review_link') as current_review_link
FROM review_requests rr
LEFT JOIN jobs j ON rr.job_id = j.id
ORDER BY rr.created_at DESC
LIMIT 5;
