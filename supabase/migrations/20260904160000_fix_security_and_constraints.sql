-- Security and constraint fixes from audit
-- Fixes: C1 (jobs RLS), C2 (password_requests RLS), C8 (QUOTE_REQUESTED status),
--        H9 (job_events type constraint), H10 (cancellation reasons constraint)

-- ============================================================================
-- C1: Fix RLS on jobs — public SELECT must filter by tracking_token
-- ============================================================================
-- The old policy used USING(true), exposing ALL jobs to anyone with the anon key.
-- We can't reference the request's tracking_token directly in RLS, so we restrict
-- public access to a SECURITY DEFINER function that checks the token against the row.

-- Drop the broken policy
DROP POLICY IF EXISTS "Public can view job by tracking token" ON jobs;

-- The tracking page API route uses the service role key (bypasses RLS).
-- The anon key is only used by the browser Supabase client for auth.
-- So we can safely deny anon SELECT entirely.
DROP POLICY IF EXISTS "Public can view job by tracking token" ON jobs;

-- No anon SELECT on jobs. The tracking page uses /api/tracking/view (service role).
-- The public intake uses /api/public/intake/[token] (service role).
-- No browser code should be doing direct anon SELECT on jobs.
CREATE POLICY "Public can view job by tracking token"
    ON jobs FOR SELECT
    TO anon
    USING (false);

-- Allow authenticated (staff) to view all jobs
DROP POLICY IF EXISTS "Staff can view jobs" ON jobs;
CREATE POLICY "Staff can view jobs"
    ON jobs FOR SELECT
    TO authenticated
    USING (true);

-- ============================================================================
-- C2: Fix RLS on password_requests — filter by token
-- ============================================================================
-- Same issue: USING(true) exposes all password requests.
-- The public submission page uses the API route (service role key).
-- So we deny anon access entirely.

DROP POLICY IF EXISTS "Public can view by token" ON password_requests;
DROP POLICY IF EXISTS "Public can update by token" ON password_requests;

-- No anon access. API routes use service role key.
DROP POLICY IF EXISTS "Public can view by token" ON password_requests;
CREATE POLICY "Public can view by token" ON password_requests
    FOR SELECT TO anon USING (false);

DROP POLICY IF EXISTS "Public can update by token" ON password_requests;
CREATE POLICY "Public can update by token" ON password_requests
    FOR UPDATE TO anon USING (false);

-- Allow authenticated (staff) to view
DROP POLICY IF EXISTS "Staff can view password requests" ON password_requests;
CREATE POLICY "Staff can view password requests" ON password_requests
    FOR SELECT TO authenticated USING (true);

-- ============================================================================
-- C8: Add QUOTE_REQUESTED to valid_status constraint
-- ============================================================================
ALTER TABLE jobs DROP CONSTRAINT IF EXISTS valid_status;

ALTER TABLE jobs ADD CONSTRAINT valid_status
CHECK (
  status IN (
    'QUOTE_REQUESTED',
    'QUOTE_APPROVED',
    'RECEIVED',
    'DIAGNOSTIC',
    'AWAITING_DEPOSIT',
    'AWAITING_DEVICE',
    'PARTS_ORDERED',
    'PARTS_ARRIVED',
    'IN_REPAIR',
    'DELAYED',
    'READY_TO_COLLECT',
    'IN_STORAGE',
    'COLLECTED',
    'COMPLETED',
    'CANCELLED'
  )
);

-- Also update notification_config constraint
ALTER TABLE notification_config DROP CONSTRAINT IF EXISTS valid_status_key;

ALTER TABLE notification_config ADD CONSTRAINT valid_status_key
CHECK (status_key IN (
    'QUOTE_REQUESTED',
    'QUOTE_APPROVED',
    'RECEIVED',
    'DIAGNOSTIC',
    'AWAITING_DEPOSIT',
    'AWAITING_DEVICE',
    'PARTS_ORDERED',
    'PARTS_ARRIVED',
    'IN_REPAIR',
    'DELAYED',
    'READY_TO_COLLECT',
    'IN_STORAGE',
    'COLLECTED',
    'COMPLETED',
    'CANCELLED'
));

-- ============================================================================
-- H9: Fix job_events type constraint — add ERROR and PRICE_UPDATE
-- ============================================================================
ALTER TABLE job_events DROP CONSTRAINT IF EXISTS job_events_type_check;

ALTER TABLE job_events ADD CONSTRAINT job_events_type_check
CHECK (type IN (
    'STATUS_CHANGE',
    'NOTE',
    'SYSTEM',
    'SMS',
    'EMAIL',
    'ERROR',
    'PRICE_UPDATE',
    'DIAGNOSTIC'
));

-- ============================================================================
-- H10: Fix cancellation reasons constraint — align with UI
-- ============================================================================
ALTER TABLE jobs DROP CONSTRAINT IF EXISTS jobs_cancellation_reason_check;

ALTER TABLE jobs ADD CONSTRAINT jobs_cancellation_reason_check
CHECK (
    cancellation_reason IS NULL OR cancellation_reason IN (
        'CUSTOMER_CANCELLED',
        'UNECONOMICAL',
        'BEYOND_REPAIR',
        'PARTS_UNAVAILABLE',
        'CUSTOMER_UNREACHABLE',
        'DUPLICATE',
        'OTHER'
    )
);
