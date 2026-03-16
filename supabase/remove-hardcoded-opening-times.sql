-- Remove hardcoded opening times from all SMS templates
-- Google Maps link shows live opening times, so we don't hardcode them

-- Note: This file is for reference only - the main update-sms-templates-friendly.sql 
-- has already been corrected to remove hardcoded times from READY_TO_COLLECT

-- If you need to remove hardcoded times from other old templates, use these:

-- Remove from QUOTE_APPROVED (if it exists with hardcoded times)
UPDATE sms_templates 
SET body = REPLACE(body, 'Opening hours: Mon-Fri 9am-5:30pm', '')
WHERE key = 'QUOTE_APPROVED' AND body LIKE '%Opening hours: Mon-Fri 9am-5:30pm%';

-- Remove from PARTS_ARRIVED (if it exists with hardcoded times)
UPDATE sms_templates 
SET body = REPLACE(body, 'Opening hours: Mon-Fri 9am-5:30pm', '')
WHERE key = 'PARTS_ARRIVED' AND body LIKE '%Opening hours: Mon-Fri 9am-5:30pm%';

-- Remove from READY_TO_COLLECT (if it exists with hardcoded times)
UPDATE sms_templates 
SET body = REPLACE(body, 'We''re open Mon-Fri 9am-5:30pm.', '')
WHERE key = 'READY_TO_COLLECT' AND body LIKE '%Mon-Fri 9am-5:30pm%';

-- Clean up any double line breaks that might result
UPDATE sms_templates 
SET body = REPLACE(REPLACE(body, E'\n\n\n', E'\n\n'), E'\n\n\n', E'\n\n')
WHERE body LIKE '%' || E'\n\n\n' || '%';

-- Verify no hardcoded times remain
SELECT key, body 
FROM sms_templates 
WHERE body LIKE '%Mon-Fri%' 
   OR body LIKE '%9am-5%'
   OR body LIKE '%Opening hours:%'
ORDER BY key;
