-- Check if notification system tables exist and their data

-- 1. Check if notification_config table exists and its data
SELECT * FROM notification_config ORDER BY status_key;

-- 2. Check if email_templates table exists and its data
SELECT * FROM email_templates ORDER BY key;

-- 3. Check SMS templates
SELECT * FROM sms_templates ORDER BY status_key;

-- 4. Check recent email sending activity (if there's a log table)
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name LIKE '%email%' OR table_name LIKE '%mail%';
