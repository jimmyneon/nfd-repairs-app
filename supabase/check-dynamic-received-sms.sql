-- Check if dynamic RECEIVED SMS text is being appended
-- This diagnostic query shows recent RECEIVED SMS messages and whether they contain the dynamic text

-- 1. Check recent RECEIVED SMS logs with their full body
SELECT 
    sl.id,
    sl.created_at,
    j.job_ref,
    j.customer_name,
    j.customer_email,
    sl.template_key,
    sl.status,
    sl.body_rendered,
    -- Check if dynamic text is present
    CASE 
        WHEN j.customer_email IS NOT NULL AND sl.body_rendered LIKE '%receive updates by text and email%' THEN '✅ Has email dynamic text'
        WHEN j.customer_email IS NULL AND sl.body_rendered LIKE '%We''ll text you when it''s ready%' THEN '✅ Has no-email dynamic text'
        ELSE '❌ MISSING dynamic text'
    END as dynamic_text_status,
    -- Show what should be appended
    CASE 
        WHEN j.customer_email IS NOT NULL THEN 'SHOULD HAVE: You''ll receive updates by text and email throughout the repair. Please check your junk folder if you don''t see our emails.'
        ELSE 'SHOULD HAVE: We''ll text you when it''s ready for collection.'
    END as expected_dynamic_text
FROM sms_logs sl
JOIN jobs j ON sl.job_id = j.id
WHERE sl.template_key = 'RECEIVED'
ORDER BY sl.created_at DESC
LIMIT 20;

-- 2. Count how many RECEIVED SMS have dynamic text vs missing it
SELECT 
    COUNT(*) as total_received_sms,
    SUM(CASE WHEN j.customer_email IS NOT NULL AND sl.body_rendered LIKE '%receive updates by text and email%' THEN 1 ELSE 0 END) as with_email_dynamic_text,
    SUM(CASE WHEN j.customer_email IS NULL AND sl.body_rendered LIKE '%We''ll text you when it''s ready%' THEN 1 ELSE 0 END) as with_no_email_dynamic_text,
    SUM(CASE 
        WHEN (j.customer_email IS NOT NULL AND sl.body_rendered NOT LIKE '%receive updates by text and email%')
          OR (j.customer_email IS NULL AND sl.body_rendered NOT LIKE '%We''ll text you when it''s ready%')
        THEN 1 ELSE 0 END) as missing_dynamic_text
FROM sms_logs sl
JOIN jobs j ON sl.job_id = j.id
WHERE sl.template_key = 'RECEIVED'
AND sl.created_at > NOW() - INTERVAL '7 days';

-- 3. Show a specific example of what the SMS body should look like
SELECT 
    'EXAMPLE: Job WITH email' as scenario,
    'Hi John, your iPhone 14 has been booked in at New Forest Device Repairs. We''ll assess it and keep you updated.

You''ll receive updates by text and email throughout the repair. Please check your junk folder if you don''t see our emails.

Track progress:
https://nfd-repairs-app.vercel.app/t/abc123' as expected_sms_body
UNION ALL
SELECT 
    'EXAMPLE: Job WITHOUT email' as scenario,
    'Hi John, your iPhone 14 has been booked in at New Forest Device Repairs. We''ll assess it and keep you updated.

We''ll text you when it''s ready for collection.

Track progress:
https://nfd-repairs-app.vercel.app/t/abc123' as expected_sms_body;

-- 4. Check the most recent RECEIVED SMS to see exact body
SELECT 
    'MOST RECENT RECEIVED SMS:' as info,
    sl.created_at,
    j.job_ref,
    j.customer_email,
    sl.body_rendered
FROM sms_logs sl
JOIN jobs j ON sl.job_id = j.id
WHERE sl.template_key = 'RECEIVED'
ORDER BY sl.created_at DESC
LIMIT 1;
