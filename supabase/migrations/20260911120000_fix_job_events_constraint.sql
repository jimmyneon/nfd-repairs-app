-- Fix job_events type constraints to allow CUSTOMER_SMS and SMS_SENT
--
-- The SMS reply handler inserts type='CUSTOMER_SMS' and the MacroDroid
-- sms-sent handler inserts type='SMS_SENT', but the original constraints
-- only allowed a subset of types.
--
-- There are TWO check constraints on job_events.type:
--   1. job_events_type_check — allows STATUS_CHANGE, NOTE, SYSTEM, SMS,
--      EMAIL, ERROR, PRICE_UPDATE, DIAGNOSTIC
--   2. valid_event_type — only allows STATUS_CHANGE, NOTE, SYSTEM
--
-- The second one (valid_event_type) was the stricter constraint actually
-- blocking inserts. Both must be updated.

-- Fix constraint 1: job_events_type_check
ALTER TABLE job_events DROP CONSTRAINT IF EXISTS job_events_type_check;
ALTER TABLE job_events ADD CONSTRAINT job_events_type_check CHECK (
  type IN (
    'STATUS_CHANGE', 'NOTE', 'SYSTEM', 'SMS', 'EMAIL',
    'ERROR', 'PRICE_UPDATE', 'DIAGNOSTIC',
    'CUSTOMER_SMS', 'SMS_SENT'
  )
);

-- Fix constraint 2: valid_event_type (the stricter one that was blocking)
ALTER TABLE job_events DROP CONSTRAINT IF EXISTS valid_event_type;
ALTER TABLE job_events ADD CONSTRAINT valid_event_type CHECK (
  type IN (
    'STATUS_CHANGE', 'NOTE', 'SYSTEM', 'SMS', 'EMAIL',
    'ERROR', 'PRICE_UPDATE', 'DIAGNOSTIC',
    'CUSTOMER_SMS', 'SMS_SENT'
  )
);
