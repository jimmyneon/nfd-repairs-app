-- Disable COMPLETED status SMS notification
-- COMPLETED should not send SMS - customer already collected device
-- Only send email if needed

UPDATE notification_config 
SET send_sms = false, 
    send_email = true,
    description = 'Job completed - email only, no SMS needed (customer already has device)'
WHERE status_key = 'COMPLETED';

-- Verify the setting
SELECT status_key, status_label, send_sms, send_email, is_active, description
FROM notification_config
WHERE status_key = 'COMPLETED';

-- Note: COMPLETED is different from COLLECTED
-- COLLECTED = customer picked up device (triggers delayed review SMS)
-- COMPLETED = admin marks job as complete (no SMS needed)
