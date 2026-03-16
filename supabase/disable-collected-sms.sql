-- Disable immediate COLLECTED SMS notification
-- Only send email on collection, not SMS
-- The delayed post-collection SMS (3 hours later or next day) handles the review request

-- Option 1: Disable COLLECTED SMS in notification_config
UPDATE notification_config 
SET send_sms = false, 
    send_email = true,
    description = 'Device collected - email only, delayed SMS for review request'
WHERE status_key = 'COLLECTED';

-- Option 2: Verify the setting
SELECT status_key, status_label, send_sms, send_email, is_active, description
FROM notification_config
WHERE status_key = 'COLLECTED';

-- The post-collection SMS flow:
-- 1. Job status changed to COLLECTED
-- 2. Email sent immediately (if enabled)
-- 3. SMS disabled (no immediate SMS)
-- 4. Post-collection SMS scheduled (via schedule-collection-sms endpoint)
-- 5. Delayed SMS sent 3 hours later (or 10am next day if after 4pm)
-- 6. Delayed SMS includes: warranty info, Google review request, support contact
