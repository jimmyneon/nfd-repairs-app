-- ============================================================
-- FIX PARTS_REASSURANCE SMS TEMPLATE
-- ============================================================
-- The template was using double curly braces ({{first_name}})
-- but the renderSmsTemplate() function only replaces single
-- curly braces ({first_name}). As a result, customers received
-- the literal text "{{first_name}}" instead of their actual name.
--
-- This migration updates the template to use single braces,
-- matching every other template in the system.
-- ============================================================

-- Update the template body: replace {{var}} with {var}
UPDATE sms_templates
SET body = 'Hi {first_name}, just an update on your {device_make} {device_model} repair ({job_ref}) - we''re still waiting for parts to arrive. They''re on order and we''ll text you the moment they arrive and your repair starts. No action needed from you. Track here: {tracking_link}',
    updated_at = NOW()
WHERE key = 'PARTS_REASSURANCE';

-- Verify the fix
SELECT key, body, is_active, updated_at
FROM sms_templates
WHERE key = 'PARTS_REASSURANCE';
