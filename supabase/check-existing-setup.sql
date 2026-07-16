-- Run each query separately in Supabase SQL Editor

-- 1. Check all SMS templates
SELECT key, is_active, LEFT(body, 100) as body_preview, updated_at
FROM sms_templates
ORDER BY key;

-- 2. Check if password_requests table exists
SELECT EXISTS (
  SELECT FROM information_schema.tables 
  WHERE table_name = 'password_requests'
) as password_requests_table_exists;

-- 3. Check jobs password-related columns
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'jobs'
  AND column_name IN (
    'device_password',
    'password_not_applicable',
    'passcode_requirement',
    'passcode_method',
    'passcode_deletion_scheduled_at'
  )
ORDER BY column_name;

-- 4. Check if auto-deletion trigger exists
SELECT tgname, tgrelid::regclass as table_name, tgenabled
FROM pg_trigger
WHERE tgname IN ('trigger_schedule_passcode_deletion', 'generate_jobs_onboarding_token');

  -- 5. Check if delete_expired_passcodes function exists
  SELECT proname, prosrc
  FROM pg_proc
  WHERE proname IN ('delete_expired_passcodes', 'schedule_passcode_deletion', 'cleanup_old_passwords');

-- 6. Check if pg_cron is installed and what jobs are scheduled
SELECT jobid, schedule, command, active 
FROM cron.job 
WHERE command ILIKE '%passcode%' OR command ILIKE '%password%';

-- 7. Check recent passcode deletions (jobs where password was nulled)
SELECT job_ref, customer_name, passcode_deletion_scheduled_at, 
       device_password IS NULL as password_deleted,
       updated_at
FROM jobs
WHERE passcode_deletion_scheduled_at IS NOT NULL
ORDER BY passcode_deletion_scheduled_at DESC
LIMIT 20;

-- 8. Check if PASSWORD_REQUEST template exists specifically
SELECT key, is_active, body, updated_at
FROM sms_templates
WHERE key = 'PASSWORD_REQUEST';

-- 9. Check if QUICK_INTAKE template exists specifically
SELECT key, is_active, body, updated_at
FROM sms_templates
WHERE key = 'QUICK_INTAKE';
