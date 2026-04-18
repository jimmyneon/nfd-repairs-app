-- Check ALL jobs collected since April 11th to see the full picture
SELECT 
    job_ref,
    customer_name,
    status,
    collected_at,
    post_collection_sms_scheduled_at,
    post_collection_sms_sent_at,
    skip_review_request,
    customer_flag,
    CASE 
        WHEN post_collection_sms_sent_at IS NOT NULL THEN '✓ SMS sent'
        WHEN post_collection_sms_scheduled_at IS NOT NULL THEN '⏳ Scheduled'
        WHEN skip_review_request = true THEN '⊗ Review disabled'
        WHEN customer_flag IN ('sensitive', 'awkward') THEN '⊗ Flagged customer'
        ELSE '⚠ NOT SCHEDULED'
    END as sms_status
FROM public.jobs
WHERE collected_at >= '2026-04-11'
ORDER BY collected_at DESC;
