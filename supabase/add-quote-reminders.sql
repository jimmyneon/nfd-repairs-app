-- Quote-plan / reminder lifecycle for repair enquiries
-- Apply this migration before enabling the automatic reminder endpoint in production.

ALTER TABLE enquiries ADD COLUMN IF NOT EXISTS commitment_type TEXT;
ALTER TABLE enquiries ADD COLUMN IF NOT EXISTS planned_visit_date DATE;
ALTER TABLE enquiries ADD COLUMN IF NOT EXISTS reminder_requested BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE enquiries ADD COLUMN IF NOT EXISTS reminder_at TIMESTAMPTZ;
ALTER TABLE enquiries ADD COLUMN IF NOT EXISTS reminder_sent_at TIMESTAMPTZ;
ALTER TABLE enquiries ADD COLUMN IF NOT EXISTS reminder_cancelled_at TIMESTAMPTZ;
ALTER TABLE enquiries ADD COLUMN IF NOT EXISTS reminder_count INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN enquiries.commitment_type IS 'Customer commitment stage, e.g. planned_visit, reminder, reservation, special_part.';
COMMENT ON COLUMN enquiries.planned_visit_date IS 'Non-binding date the customer is thinking of bringing the device in.';
COMMENT ON COLUMN enquiries.reminder_requested IS 'True only when the customer has explicitly requested a service reminder.';
COMMENT ON COLUMN enquiries.reminder_at IS 'When the requested repair-plan reminder becomes due.';
COMMENT ON COLUMN enquiries.reminder_sent_at IS 'Timestamp of the most recent successfully sent repair-plan reminder.';
COMMENT ON COLUMN enquiries.reminder_cancelled_at IS 'Set when a reminder should no longer be sent.';
COMMENT ON COLUMN enquiries.reminder_count IS 'Number of repair-plan reminders successfully sent.';

CREATE INDEX IF NOT EXISTS idx_enquiries_due_quote_reminders
ON enquiries(reminder_at)
WHERE reminder_requested = TRUE
  AND reminder_sent_at IS NULL
  AND reminder_cancelled_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_enquiries_planned_visit_date
ON enquiries(planned_visit_date)
WHERE planned_visit_date IS NOT NULL;

-- Backfill the zero-cost website flow introduced before this migration.
-- These existing rows did NOT promise an automatic reminder, so reminder_requested stays false.
UPDATE enquiries
SET
  commitment_type = COALESCE(commitment_type, 'planned_visit'),
  planned_visit_date = COALESCE(planned_visit_date, payday_date::date)
WHERE quote_source = 'planned_visit'
  AND payday_date IS NOT NULL;
