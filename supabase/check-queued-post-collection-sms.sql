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

-- 5. Check ALL COLLECTED jobs since April 1st to see the full picture
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

-- 6. Check jobs scheduled for TODAY with exact send times
SELECT 
    job_ref,
    customer_name,
    post_collection_sms_scheduled_at as scheduled_time,
    EXTRACT(EPOCH FROM (post_collection_sms_scheduled_at - NOW())) / 60 as minutes_until_send,
    CASE 
        WHEN post_collection_sms_scheduled_at <= NOW() THEN '🔴 READY TO SEND NOW'
        ELSE CONCAT('⏳ Will send in ', ROUND(EXTRACT(EPOCH FROM (post_collection_sms_scheduled_at - NOW())) / 60), ' minutes at ', TO_CHAR(post_collection_sms_scheduled_at, 'HH24:MI'))
    END as send_status
FROM public.jobs
WHERE post_collection_sms_scheduled_at IS NOT NULL
    AND post_collection_sms_sent_at IS NULL
    AND DATE(post_collection_sms_scheduled_at) = CURRENT_DATE
ORDER BY post_collection_sms_scheduled_at;

-- 6b. Check ALL jobs scheduled (to see if the 8 jobs from 14:04 are still queued)
SELECT 
    job_ref,
    customer_name,
    post_collection_sms_scheduled_at as scheduled_time,
    post_collection_sms_sent_at as sent_time,
    post_collection_sms_delivery_status
FROM public.jobs
WHERE post_collection_sms_scheduled_at IS NOT NULL
    AND post_collection_sms_sent_at IS NULL
ORDER BY post_collection_sms_scheduled_at;

-- 7. Check ALL COLLECTED jobs in last 30 days to see the full picture
SELECT 
    DATE(collected_at) as collection_date,
    COUNT(*) as total_collected,
    COUNT(CASE WHEN post_collection_sms_sent_at IS NOT NULL THEN 1 END) as sms_sent,
    COUNT(CASE WHEN post_collection_sms_scheduled_at IS NULL THEN 1 END) as not_scheduled
FROM public.jobs
WHERE status = 'COLLECTED'
    AND collected_at >= NOW() - INTERVAL '30 days'
GROUP BY DATE(collected_at)
ORDER BY collection_date DESC;

-- 8. Check jobs from April 8-10 that were scheduled but may not have been sent
SELECT 
    job_ref,
    customer_name,
    collected_at,
    post_collection_sms_scheduled_at as scheduled_time,
    post_collection_sms_sent_at as sent_time,
    post_collection_sms_delivery_status as delivery_status,
    CASE 
        WHEN post_collection_sms_sent_at IS NOT NULL THEN '✓ Sent'
        WHEN post_collection_sms_scheduled_at IS NULL THEN '⚠ Not scheduled'
        WHEN post_collection_sms_scheduled_at > NOW() THEN CONCAT('⏳ Scheduled for ', TO_CHAR(post_collection_sms_scheduled_at, 'HH24:MI'))
        ELSE '🔴 SCHEDULED BUT NOT SENT (overdue)'
    END as status_text
FROM public.jobs
WHERE status = 'COLLECTED'
    AND collected_at >= '2026-04-08'
    AND collected_at < '2026-04-11'
ORDER BY collected_at DESC;

-- 9. Check ALL jobs (any status) for April 2-7 to see if there's any activity on missing days
SELECT 
    job_ref,
    customer_name,
    status,
    created_at,
    collected_at
FROM public.jobs
WHERE created_at >= '2026-04-02'
    AND created_at < '2026-04-08'
ORDER BY created_at DESC;

-- 10. Check jobs collected before April 8 (April 2-7) that haven't had post-collection SMS scheduled
SELECT 
    job_ref,
    customer_name,
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
WHERE collected_at IS NOT NULL
    AND collected_at >= '2026-04-01'
    AND collected_at < '2026-04-08'
ORDER BY collected_at DESC;

-- 11. Check job_events for COMPLETED jobs to see if they were originally COLLECTED
SELECT 
    j.job_ref,
    j.customer_name,
    j.status as current_status,
    j.collected_at,
    je.type,
    je.message,
    je.created_at as event_time
FROM public.jobs j
JOIN public.job_events je ON j.id = je.job_id
WHERE j.job_ref IN (
    'NFD-20260327-001',
    'NFD-20260331-002',
    'NFD-20260402-001',
    'NFD-20260402-002',
    'NFD-20260330-006',
    'NFD-20260404-001',
    'NFD-20260331-004'
)
AND (je.message ILIKE '%COLLECTED%' OR je.message ILIKE '%COMPLETED%')
ORDER BY j.job_ref, je.created_at;
