-- ============================================
-- SHOW SCHEDULED REVIEW SMS JOBS
-- ============================================
-- This shows which jobs have review SMS scheduled and when they'll be sent

-- SIMPLE VIEW: Jobs with scheduled review SMS
-- ============================================
SELECT 
    job_ref,
    customer_name,
    customer_phone,
    collected_at as when_collected,
    post_collection_sms_scheduled_at as when_sms_will_send,
    post_collection_sms_sent_at as when_sms_was_sent,
    post_collection_sms_delivery_status as delivery_status,
    CASE 
        WHEN post_collection_sms_sent_at IS NOT NULL THEN 'Already sent'
        WHEN post_collection_sms_scheduled_at < NOW() THEN 'Ready to send (waiting for cron)'
        ELSE 'Scheduled for future'
    END as status
FROM jobs
WHERE post_collection_sms_scheduled_at IS NOT NULL
   OR post_collection_sms_sent_at IS NOT NULL
ORDER BY post_collection_sms_scheduled_at DESC NULLS LAST;
