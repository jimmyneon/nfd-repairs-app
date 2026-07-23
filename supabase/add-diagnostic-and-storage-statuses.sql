-- Add DIAGNOSTIC and IN_STORAGE to the valid_status CHECK constraint
-- These statuses are used in the app but were missing from the DB constraint,
-- causing status updates to DIAGNOSTIC to silently fail and revert to RECEIVED.

-- STEP 1: Drop the old constraint
ALTER TABLE jobs
DROP CONSTRAINT IF EXISTS valid_status;

-- STEP 2: Add new constraint with DIAGNOSTIC and IN_STORAGE included
ALTER TABLE jobs
ADD CONSTRAINT valid_status
CHECK (
  status IN (
    'QUOTE_APPROVED',
    'RECEIVED',
    'DIAGNOSTIC',
    'AWAITING_DEPOSIT',
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

-- STEP 3: Update notification_config constraint to include DIAGNOSTIC and IN_STORAGE
ALTER TABLE notification_config
DROP CONSTRAINT IF EXISTS valid_status_key;

ALTER TABLE notification_config
ADD CONSTRAINT valid_status_key CHECK (status_key IN (
    'QUOTE_APPROVED',
    'RECEIVED',
    'DIAGNOSTIC',
    'AWAITING_DEPOSIT',
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

-- STEP 4: Add notification_config entries for DIAGNOSTIC if they don't exist
INSERT INTO notification_config (status_key, status_label, send_sms, send_email, is_active, description) VALUES
    ('DIAGNOSTIC', 'Diagnostic', false, false, false, 'Diagnostic in progress - no customer notification by default'),
    ('IN_STORAGE', 'In Storage', false, false, false, 'Device moved to long-term storage - no customer notification by default')
ON CONFLICT (status_key) DO NOTHING;

-- STEP 5: Verify the constraint
SELECT pg_get_constraintdef(oid) as constraint_definition
FROM pg_constraint
WHERE conname = 'valid_status' AND conrelid = 'jobs'::regclass;
