-- Check the complete notification flow

-- 1. Check recent notifications in the database
SELECT 
    id,
    type,
    title,
    body,
    job_id,
    created_at
FROM notifications
ORDER BY created_at DESC
LIMIT 10;

-- 2. Check if pg_net extension is enabled (required for HTTP calls)
SELECT 
    extname,
    extversion
FROM pg_extension 
WHERE extname = 'pg_net';

-- 3. First check what columns exist in net._http_response
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_schema = 'net' 
AND table_name = '_http_response';

-- 4. Check pg_net request logs (if extension is enabled)
-- This shows if the trigger actually made HTTP calls
SELECT *
FROM net._http_response
ORDER BY created DESC
LIMIT 10;
