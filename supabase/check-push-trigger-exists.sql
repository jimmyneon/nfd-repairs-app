-- Check if push notification trigger and function exist in Supabase

-- 1. Check if pg_net extension is enabled
SELECT * FROM pg_extension WHERE extname = 'pg_net';

-- 2. Check if the function exists
SELECT 
    routine_name,
    routine_type,
    routine_definition
FROM information_schema.routines
WHERE routine_name = 'send_push_notification_on_insert';

-- 3. Check if the trigger exists
SELECT 
    trigger_name,
    event_manipulation,
    event_object_table,
    action_statement,
    action_timing
FROM information_schema.triggers
WHERE trigger_name = 'trigger_send_push_on_notification';

-- 4. List all triggers on notifications table
SELECT 
    trigger_name,
    event_manipulation,
    action_statement
FROM information_schema.triggers
WHERE event_object_table = 'notifications';
