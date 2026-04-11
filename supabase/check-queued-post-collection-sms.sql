-- Check if post-collection SMS messages are being queued in the database
-- Run this in Supabase SQL Editor to see the current state

-- 1. Check jobs with scheduled SMS that haven't been sent yet
SELECT 
    job_ref,
    customer_name,
    customer_phone,
    status,
    post_collection_sms_scheduled_at as scheduled_time,
    post_collection_sms_sent_at as sent_time,
    post_collection_sms_delivery_status as delivery_status,
    CASE 
        WHEN post_collection_sms_sent_at IS NOT NULL THEN '✓ Already sent'
        WHEN post_collection_sms_scheduled_at IS NULL THEN '⚠ Not scheduled'
        WHEN post_collection_sms_scheduled_at > NOW() THEN CONCAT('⏳ Scheduled for ', TO_CHAR(post_collection_sms_scheduled_at, 'HH24:MI on DD/MM'))
        ELSE '🔴 READY TO SEND NOW (overdue)'
    END as status_text
FROM public.jobs
WHERE status = 'COLLECTED'
ORDER BY post_collection_sms_scheduled_at DESC NULLS LAST;

-- 2. Count summary
SELECT 
    COUNT(*) as total_collected_jobs,
    COUNT(CASE WHEN post_collection_sms_scheduled_at IS NOT NULL THEN 1 END) as scheduled_count,
    COUNT(CASE WHEN post_collection_sms_sent_at IS NOT NULL THEN 1 END) as sent_count,
    COUNT(CASE WHEN post_collection_sms_scheduled_at IS NOT NULL AND post_collection_sms_sent_at IS NULL THEN 1 END) as pending_count,
    COUNT(CASE WHEN post_collection_sms_scheduled_at IS NOT NULL AND post_collection_sms_sent_at IS NULL AND post_collection_sms_scheduled_at <= NOW() THEN 1 END) as overdue_count
FROM public.jobs
WHERE status = 'COLLECTED';

-- 3. Check for jobs that should have been scheduled but weren't
SELECT 
    job_ref,
    customer_name,
    status,
    collected_at,
    post_collection_sms_scheduled_at,
    CASE 
        WHEN post_collection_sms_scheduled_at IS NULL THEN '⚠ NOT SCHEDULED'
        ELSE '✓ Scheduled'
    END as scheduling_status
FROM public.jobs
WHERE status = 'COLLECTED'
    AND collected_at IS NOT NULL
ORDER BY collected_at DESC
LIMIT 20;

-- 4. Check recent job events related to post-collection SMS
SELECT 
    je.job_id,
    j.job_ref,
    je.type,
    je.message,
    je.created_at
FROM public.job_events je
JOIN public.jobs j ON j.id = je.job_id
WHERE je.message ILIKE '%post-collection%'
    OR je.message ILIKE '%review%'
ORDER BY je.created_at DESC
LIMIT 20;

-- 5. Check for COLLECTED jobs since April 1st that haven't had SMS sent
SELECT 
    job_ref,
    customer_name,
    customer_phone,
    status,
    collected_at,
    post_collection_sms_scheduled_at as scheduled_time,
    post_collection_sms_sent_at as sent_time,
    post_collection_sms_delivery_status as delivery_status,
    CASE 
        WHEN post_collection_sms_sent_at IS NOT NULL THEN '✓ Already sent'
        WHEN post_collection_sms_scheduled_at IS NULL THEN '⚠ NOT SCHEDULED'
        WHEN post_collection_sms_scheduled_at > NOW() THEN CONCAT('⏳ Scheduled for ', TO_CHAR(post_collection_sms_scheduled_at, 'HH24:MI on DD/MM'))
        ELSE '🔴 READY TO SEND NOW (overdue)'
    END as status_text
FROM public.jobs
WHERE status = 'COLLECTED'
    AND collected_at >= '2026-04-01'
ORDER BY collected_at DESC;
