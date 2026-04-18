-- Check when post-collection SMS were last sent (last 7 days)
SELECT 
    job_ref,
    customer_name,
    collected_at,
    post_collection_sms_scheduled_at,
    post_collection_sms_sent_at,
    post_collection_sms_delivery_status,
    EXTRACT(EPOCH FROM (post_collection_sms_sent_at - collected_at)) / 3600 as hours_between_collected_and_sent
FROM public.jobs
WHERE post_collection_sms_sent_at >= NOW() - INTERVAL '7 days'
ORDER BY post_collection_sms_sent_at DESC;

-- Check all jobs with scheduled SMS in last 7 days
SELECT 
    job_ref,
    customer_name,
    post_collection_sms_scheduled_at,
    post_collection_sms_sent_at,
    CASE 
        WHEN post_collection_sms_sent_at IS NOT NULL THEN '✓ Sent'
        WHEN post_collection_sms_scheduled_at <= NOW() THEN '🔴 Overdue'
        ELSE '⏳ Scheduled'
    END as status
FROM public.jobs
WHERE post_collection_sms_scheduled_at >= NOW() - INTERVAL '7 days'
ORDER BY post_collection_sms_scheduled_at DESC;
