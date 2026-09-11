-- Fix job_events type constraint to allow CUSTOMER_SMS and SMS_SENT
--
-- The SMS reply handler inserts type='CUSTOMER_SMS' and the MacroDroid
-- sms-sent handler inserts type='SMS_SENT', but the original constraint
-- only allowed: STATUS_CHANGE, NOTE, SYSTEM, SMS, EMAIL, ERROR,
-- PRICE_UPDATE, DIAGNOSTIC.
--
-- This caused every inbound customer SMS to active jobs and every
-- outbound SMS-sent event to be silently rejected (caught by try/catch).
--
-- We add CUSTOMER_SMS and SMS_SENT to the allowed types.

ALTER TABLE job_events DROP CONSTRAINT IF EXISTS job_events_type_check;

ALTER TABLE job_events ADD CONSTRAINT job_events_type_check CHECK (
  type IN (
    'STATUS_CHANGE',
    'NOTE',
    'SYSTEM',
    'SMS',
    'EMAIL',
    'ERROR',
    'PRICE_UPDATE',
    'DIAGNOSTIC',
    'CUSTOMER_SMS',
    'SMS_SENT'
  )
);
