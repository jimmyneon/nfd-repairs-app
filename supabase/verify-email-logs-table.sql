-- Verify email_logs table exists and check its structure
-- Run this in Supabase SQL Editor

-- 1. Check if email_logs table exists
SELECT EXISTS (
  SELECT FROM information_schema.tables 
  WHERE table_schema = 'public' 
  AND table_name = 'email_logs'
) as table_exists;

-- 2. Show table structure
SELECT 
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_name = 'email_logs'
ORDER BY ordinal_position;

-- 3. Count total records (should be 0 if no emails attempted)
SELECT COUNT(*) as total_email_logs FROM email_logs;

-- 4. Check if table has any data at all (even test data)
SELECT * FROM email_logs LIMIT 5;

-- 5. Check recent job_events for any email-related messages
SELECT 
  created_at,
  type,
  message,
  job_id
FROM job_events
WHERE message ILIKE '%email%'
  OR message ILIKE '%notification%'
ORDER BY created_at DESC
LIMIT 20;

-- 6. Check if /api/email/send is being called (check job_events for system messages)
SELECT 
  created_at,
  type,
  message
FROM job_events
WHERE type = 'SYSTEM'
ORDER BY created_at DESC
LIMIT 20;
