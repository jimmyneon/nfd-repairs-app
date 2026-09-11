-- Create a unified conversation_messages view
--
-- Unifies all customer communication channels into a single queryable view:
--   - sms_logs (outbound SMS sent by system or staff)
--   - job_events with type CUSTOMER_SMS (inbound SMS from customers on active jobs)
--   - job_events with type SMS_SENT (outbound SMS logged by MacroDroid tracker)
--   - email_logs (outbound emails)
--   - enquiries.customer_notes (inbound SMS replies on enquiries, stored as JSON array)
--
-- Each row has a consistent shape:
--   id, phone, direction, channel, message, template_key, job_id, enquiry_id,
--   status, staff_author, created_at, metadata

DROP VIEW IF EXISTS conversation_messages CASCADE;

CREATE VIEW conversation_messages AS

-- 1. Outbound SMS from sms_logs
SELECT
  sms_logs.id::text AS id,
  sms_logs.recipient_phone AS phone,
  'outbound' AS direction,
  'sms' AS channel,
  sms_logs.body_rendered AS message,
  sms_logs.template_key,
  sms_logs.job_id,
  NULL::uuid AS enquiry_id,
  sms_logs.status,
  NULL::text AS staff_author,
  sms_logs.created_at,
  NULL::jsonb AS metadata
FROM sms_logs

UNION ALL

-- 2. Inbound customer SMS stored as job_events (type = CUSTOMER_SMS)
SELECT
  job_events.id::text AS id,
  COALESCE(job_events.metadata->>'phone', '') AS phone,
  'inbound' AS direction,
  'sms' AS channel,
  job_events.message AS message,
  'CUSTOMER_SMS' AS template_key,
  job_events.job_id,
  NULL::uuid AS enquiry_id,
  NULL::text AS status,
  NULL::text AS staff_author,
  job_events.created_at,
  job_events.metadata
FROM job_events
WHERE job_events.type = 'CUSTOMER_SMS'

UNION ALL

-- 3. Outbound SMS tracked by MacroDroid (type = SMS_SENT in job_events)
SELECT
  job_events.id::text AS id,
  COALESCE(job_events.metadata->>'phone', '') AS phone,
  'outbound' AS direction,
  'sms' AS channel,
  job_events.message AS message,
  'SMS_SENT' AS template_key,
  job_events.job_id,
  NULL::uuid AS enquiry_id,
  NULL::text AS status,
  job_events.metadata->>'sender' AS staff_author,
  job_events.created_at,
  job_events.metadata
FROM job_events
WHERE job_events.type = 'SMS_SENT'

UNION ALL

-- 4. Outbound emails from email_logs
SELECT
  email_logs.id::text AS id,
  NULL::text AS phone,
  'outbound' AS direction,
  'email' AS channel,
  COALESCE(email_logs.body_text, email_logs.subject) AS message,
  email_logs.template_key,
  email_logs.job_id,
  NULL::uuid AS enquiry_id,
  email_logs.status,
  NULL::text AS staff_author,
  email_logs.created_at,
  NULL::jsonb AS metadata
FROM email_logs

UNION ALL

-- 5. Inbound SMS replies on enquiries (stored as JSON array in customer_notes)
SELECT
  (enquiries.id::text || '-' || (notes.idx - 1)::text) AS id,
  enquiries.customer_phone AS phone,
  'inbound' AS direction,
  'sms' AS channel,
  notes.note->>'message' AS message,
  'ENQUIRY_REPLY' AS template_key,
  NULL::uuid AS job_id,
  enquiries.id AS enquiry_id,
  NULL::text AS status,
  NULL::text AS staff_author,
  COALESCE((notes.note->>'timestamp')::timestamptz, enquiries.updated_at) AS created_at,
  to_jsonb(notes.note) AS metadata
FROM enquiries
CROSS JOIN LATERAL jsonb_array_elements(enquiries.customer_notes::jsonb) WITH ORDINALITY AS notes(note, idx)
WHERE enquiries.customer_notes IS NOT NULL
  AND enquiries.customer_notes::jsonb IS NOT NULL
  AND jsonb_typeof(enquiries.customer_notes::jsonb) = 'array'

ORDER BY created_at DESC;
