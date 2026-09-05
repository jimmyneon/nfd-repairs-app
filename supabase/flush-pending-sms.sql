-- ============================================================
-- FLUSH ALL PENDING SMS FROM THE QUEUE
-- ============================================================
-- Run this in the Supabase SQL Editor to immediately drain
-- all stuck PENDING SMS via the /api/sms/send-all endpoint.
--
-- This is useful for:
--   1. Clearing the backlog caused by the create-v3 bug
--      (where SMS was queued but the wrong one was sent)
--   2. Re-trying SMS that failed during a MacroDroid outage
--   3. Manual flush after deploying the fix
--
-- The endpoint respects the 8am-8pm sending window by default.
-- To override (send outside hours), change the URL below to:
--   /api/sms/send-all?skip_hours_check=true
--
-- PREREQUISITES:
--   - CRON_SECRET env var on Vercel must match the secret below
--   - http extension must be enabled in Supabase
--   - MACRODROID_WEBHOOK_URL must be set on Vercel
-- ============================================================

-- Step 1: Check what's currently stuck in the queue (optional, read-only)
SELECT
    sl.id,
    sl.job_id,
    sl.template_key,
    sl.status,
    sl.created_at,
    sl.body_rendered,
    j.job_ref,
    j.customer_name,
    j.customer_phone
FROM sms_logs sl
LEFT JOIN jobs j ON sl.job_id = j.id
WHERE sl.status = 'PENDING'
ORDER BY sl.created_at ASC;

-- Step 2: Flush all pending SMS by calling the drain endpoint
DO $$
DECLARE
    v_cron_secret TEXT;
    v_response TEXT;
BEGIN
    -- This secret MUST match the CRON_SECRET env var on Vercel
    v_cron_secret := 'REPLACE_WITH_CRON_SECRET_FROM_VAULT';

    SELECT content INTO v_response
    FROM http((
        'GET',
        'https://nfd-repairs-app.vercel.app/api/sms/send-all',
        ARRAY[http_header('Authorization', 'Bearer ' || v_cron_secret)],
        'application/json',
        ''
    )::http_request);

    RAISE NOTICE 'Flush response: %', v_response;
END;
$$;

-- Step 3: Verify the queue is now empty (run after Step 2 completes)
SELECT
    status,
    COUNT(*) as count
FROM sms_logs
WHERE status IN ('PENDING', 'SENT', 'FAILED')
GROUP BY status
ORDER BY status;

-- ============================================================
-- OPTIONAL: Mark old stuck PENDING SMS as CANCELLED instead
-- of sending them (use if the backlog is stale/irrelevant)
-- ============================================================
-- Uncomment and run this block INSTEAD of Step 2 if you want
-- to discard old stuck SMS rather than send them:
--
-- UPDATE sms_logs
-- SET status = 'CANCELLED',
--     error_message = 'Cancelled - stale SMS from create-v3 bug'
-- WHERE status = 'PENDING'
--   AND created_at < NOW() - INTERVAL '7 days';
--
-- SELECT id, template_key, created_at, status
-- FROM sms_logs
-- WHERE status = 'CANCELLED'
-- ORDER BY created_at DESC;
