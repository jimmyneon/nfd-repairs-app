-- Check recent email logs to debug why emails aren't sending
-- Run this in Supabase SQL Editor

-- 1. Check most recent email attempts
SELECT 
  id,
  job_id,
  template_key,
  subject,
  recipient_email,
  status,
  sent_at,
  error_message,
  resend_id,
  created_at,
  CASE 
    WHEN status = 'SENT' THEN '✓ Sent successfully'
    WHEN status = 'FAILED' THEN '✗ Failed - check error_message'
    WHEN status = 'PENDING' THEN '⏳ Pending - never sent'
  END as status_description
FROM email_logs
ORDER BY created_at DESC
LIMIT 20;

-- 2. Count emails by status
SELECT 
  status,
  COUNT(*) as count,
  MAX(created_at) as last_attempt
FROM email_logs
GROUP BY status
ORDER BY last_attempt DESC;

-- 3. Check failed emails with error details
SELECT 
  created_at,
  template_key,
  recipient_email,
  subject,
  error_message,
  job_id
FROM email_logs
WHERE status = 'FAILED'
ORDER BY created_at DESC
LIMIT 10;

-- 4. Check pending emails (never sent)
SELECT 
  created_at,
  template_key,
  recipient_email,
  subject,
  job_id,
  EXTRACT(EPOCH FROM (NOW() - created_at))/60 as minutes_pending
FROM email_logs
WHERE status = 'PENDING'
ORDER BY created_at DESC
LIMIT 10;

-- 5. Check if any emails sent successfully recently
SELECT 
  created_at,
  sent_at,
  template_key,
  recipient_email,
  subject,
  resend_id
FROM email_logs
WHERE status = 'SENT'
ORDER BY sent_at DESC
LIMIT 10;

-- 6. Check notification config for email settings
SELECT 
  status_key,
  status_label,
  send_email,
  is_active,
  CASE 
    WHEN send_email = true AND is_active = true THEN '✓ Enabled'
    WHEN send_email = false THEN '✗ Email disabled'
    WHEN is_active = false THEN '✗ Status inactive'
  END as email_status
FROM notification_config
ORDER BY status_key;

-- 7. Check jobs with email addresses
SELECT 
  COUNT(*) as total_jobs,
  COUNT(customer_email) as jobs_with_email,
  COUNT(*) - COUNT(customer_email) as jobs_without_email
FROM jobs;

-- 8. Check recent job events for email-related messages
SELECT 
  created_at,
  type,
  message,
  job_id
FROM job_events
WHERE message ILIKE '%email%'
ORDER BY created_at DESC
LIMIT 20;
