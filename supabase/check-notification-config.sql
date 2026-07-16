-- Check notification config for COLLECTED status
SELECT 
    status_key,
    send_sms,
    send_email,
    is_active
FROM public.notification_config
WHERE status_key = 'COLLECTED';
