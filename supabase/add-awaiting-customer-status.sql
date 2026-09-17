-- Add AWAITING_CUSTOMER job status (run in Supabase SQL editor)
-- Used for jobs paused pending a customer decision/reply.
-- Changing to this status does NOT automatically send an SMS or email.

-- Keep both legacy status constraints aligned with the TypeScript JobStatus union.
ALTER TABLE jobs DROP CONSTRAINT IF EXISTS jobs_status_check;
ALTER TABLE jobs ADD CONSTRAINT jobs_status_check CHECK (
  status IN (
    'QUOTE_REQUESTED', 'QUOTE_APPROVED', 'AWAITING_DEVICE', 'DROPPED_OFF',
    'RECEIVED', 'DIAGNOSTIC', 'AWAITING_CUSTOMER', 'AWAITING_DEPOSIT',
    'PARTS_ORDERED', 'PARTS_ARRIVED', 'IN_REPAIR', 'DELAYED',
    'READY_TO_COLLECT', 'IN_STORAGE', 'COLLECTED', 'COMPLETED', 'CANCELLED'
  )
);

ALTER TABLE jobs DROP CONSTRAINT IF EXISTS valid_status;
ALTER TABLE jobs ADD CONSTRAINT valid_status CHECK (
  status IN (
    'QUOTE_REQUESTED', 'QUOTE_APPROVED', 'AWAITING_DEVICE', 'DROPPED_OFF',
    'RECEIVED', 'DIAGNOSTIC', 'AWAITING_CUSTOMER', 'AWAITING_DEPOSIT',
    'PARTS_ORDERED', 'PARTS_ARRIVED', 'IN_REPAIR', 'DELAYED',
    'READY_TO_COLLECT', 'IN_STORAGE', 'COLLECTED', 'COMPLETED', 'CANCELLED'
  )
);

-- Update the notification_config status-key constraint to allow the new status.
ALTER TABLE notification_config DROP CONSTRAINT IF EXISTS valid_status_key;
ALTER TABLE notification_config ADD CONSTRAINT valid_status_key CHECK (
  status_key IN (
    'QUOTE_REQUESTED', 'QUOTE_APPROVED', 'AWAITING_DEVICE', 'DROPPED_OFF',
    'RECEIVED', 'DIAGNOSTIC', 'AWAITING_CUSTOMER', 'AWAITING_DEPOSIT',
    'PARTS_ORDERED', 'PARTS_ARRIVED', 'IN_REPAIR', 'DELAYED',
    'READY_TO_COLLECT', 'IN_STORAGE', 'COLLECTED', 'COMPLETED', 'CANCELLED'
  )
);

-- Make the status visible to the notification settings UI, but deliberately
-- leave automatic customer notifications disabled.
INSERT INTO notification_config (status_key, status_label, send_sms, send_email, is_active)
VALUES ('AWAITING_CUSTOMER', 'Awaiting Customer', false, false, true)
ON CONFLICT (status_key) DO UPDATE SET
  status_label = EXCLUDED.status_label,
  send_sms = false,
  send_email = false,
  is_active = true;
