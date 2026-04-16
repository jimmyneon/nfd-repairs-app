-- Check if there's an SMS template for COLLECTED status
SELECT 
    key,
    body,
    is_active
FROM public.sms_templates
WHERE key = 'COLLECTED';
