-- DIAGNOSIS 4: Check if there are any database triggers that might interfere
-- Database triggers could be preventing updates or causing issues

-- Check for triggers on jobs table
SELECT 
    trigger_name,
    event_manipulation,
    event_object_table,
    action_statement,
    action_timing
FROM information_schema.triggers
WHERE event_object_table = 'jobs'
ORDER BY trigger_name;

-- Check for any policies on jobs table that might block updates
SELECT 
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd,
    qual,
    with_check
FROM pg_policies
WHERE tablename = 'jobs';
