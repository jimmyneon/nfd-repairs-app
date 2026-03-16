-- Consolidate DROPPED_OFF status into RECEIVED
-- This migration removes the redundant DROPPED_OFF status
-- Both statuses represent "device is now in shop"

-- STEP 1: Migrate existing DROPPED_OFF jobs to RECEIVED
UPDATE jobs 
SET status = 'RECEIVED' 
WHERE status = 'DROPPED_OFF';

-- STEP 2: Update job_events that reference DROPPED_OFF
UPDATE job_events 
SET message = REPLACE(message, 'DROPPED_OFF', 'RECEIVED')
WHERE message LIKE '%DROPPED_OFF%';

-- STEP 3: Remove DROPPED_OFF from notification_config
DELETE FROM notification_config 
WHERE status_key = 'DROPPED_OFF';

-- STEP 4: Remove DROPPED_OFF SMS template
DELETE FROM sms_templates 
WHERE key = 'DROPPED_OFF';

-- STEP 5: Update status constraint to remove DROPPED_OFF
ALTER TABLE jobs
DROP CONSTRAINT IF EXISTS valid_status;

ALTER TABLE jobs
ADD CONSTRAINT valid_status 
CHECK (
  status IN (
    'QUOTE_APPROVED',
    'RECEIVED',
    'AWAITING_DEPOSIT',
    'PARTS_ORDERED',
    'PARTS_ARRIVED',
    'IN_REPAIR',
    'DELAYED',
    'READY_TO_COLLECT',
    'COLLECTED',
    'COMPLETED',
    'CANCELLED'
  )
);

-- STEP 6: Update notification_config constraint
ALTER TABLE notification_config
DROP CONSTRAINT IF EXISTS valid_status_key;

ALTER TABLE notification_config
ADD CONSTRAINT valid_status_key CHECK (status_key IN (
    'QUOTE_APPROVED',
    'RECEIVED',
    'AWAITING_DEPOSIT',
    'PARTS_ORDERED',
    'PARTS_ARRIVED',
    'IN_REPAIR',
    'DELAYED',
    'READY_TO_COLLECT',
    'COLLECTED',
    'COMPLETED',
    'CANCELLED'
));

-- STEP 7: Update RECEIVED template to handle both scenarios
UPDATE sms_templates 
SET body = 'Hi {customer_name}, we''ve received your {device_make} {device_model}. We''ll assess it and keep you updated on progress. Track your repair: {tracking_link} - New Forest Device Repairs'
WHERE key = 'RECEIVED';

-- STEP 8: Verify migration
SELECT 
  'Jobs with DROPPED_OFF status' as check_name,
  COUNT(*) as count
FROM jobs 
WHERE status = 'DROPPED_OFF'
UNION ALL
SELECT 
  'Notification config entries for DROPPED_OFF',
  COUNT(*)
FROM notification_config 
WHERE status_key = 'DROPPED_OFF'
UNION ALL
SELECT 
  'SMS templates for DROPPED_OFF',
  COUNT(*)
FROM sms_templates 
WHERE key = 'DROPPED_OFF';

-- Expected result: All counts should be 0

COMMENT ON CONSTRAINT valid_status ON jobs IS 'Valid job statuses - DROPPED_OFF consolidated into RECEIVED (both mean device in shop)';
