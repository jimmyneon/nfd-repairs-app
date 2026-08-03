-- Update READY_TO_COLLECT SMS template to make the hours link clearer
-- The old template just had the bare link without explaining what it does

UPDATE sms_templates SET body =
'Hi {first_name}, great news — your {device_make} {device_model} is all repaired and ready to collect.

Before setting off, please tap here to check our live opening hours on Google (sometimes we need to pop out):
{hours_link}

Many thanks,
New Forest Device Repairs'
WHERE key = 'READY_TO_COLLECT';

-- Verify the update
SELECT key, body, is_active FROM sms_templates WHERE key = 'READY_TO_COLLECT';
