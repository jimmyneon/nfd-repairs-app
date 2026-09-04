-- Ensure the quick-intake SMS opens the form it promises, rather than tracking.
-- Safe to run repeatedly.
UPDATE sms_templates
SET body = 'Hi {first_name}, your device is now booked in with us. We just need a few more details and your repair agreement — please use this link to complete your check-in:

{onboarding_link}

We''ll update you as soon as possible.

Many thanks,
New Forest Device Repairs',
    is_active = true,
    updated_at = NOW()
WHERE key = 'QUICK_INTAKE';
