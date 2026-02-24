-- Check if notifications are being created and if HTTP calls are being made

-- 1. Recent notifications created (should have records)
SELECT 
    id,
    type,
    title,
    body,
    job_id,
    created_at
FROM notifications
ORDER BY created_at DESC
LIMIT 5;

-- 2. Check pg_net HTTP request logs (this shows if trigger is making API calls)
SELECT 
    id,
    method,
    url,
    status_code,
    created_at
FROM net._http_response
ORDER BY created_at DESC
LIMIT 10;

-- 3. Count total notifications vs total HTTP calls
SELECT 
    (SELECT COUNT(*) FROM notifications) as total_notifications,
    (SELECT COUNT(*) FROM net._http_response) as total_http_calls;
