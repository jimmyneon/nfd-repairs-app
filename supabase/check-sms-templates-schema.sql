-- Check the actual schema of sms_templates table
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'sms_templates'
ORDER BY ordinal_position;
