-- Quote follow-up / reminder lifecycle for repair enquiries
-- Apply before enabling /api/enquiries/plan-later or the reminder cron in production.

ALTER TABLE enquiries ADD COLUMN IF NOT EXISTS commitment_type TEXT;
ALTER TABLE enquiries ADD COLUMN IF NOT EXISTS follow_up_date DATE;
ALTER TABLE enquiries ADD COLUMN IF NOT EXISTS planned_visit_date DATE;
ALTER TABLE enquiries ADD COLUMN IF NOT EXISTS reminder_requested BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE enquiries ADD COLUMN IF NOT EXISTS reminder_at TIMESTAMPTZ;
ALTER TABLE enquiries ADD COLUMN IF NOT EXISTS reminder_sent_at TIMESTAMPTZ;
ALTER TABLE enquiries ADD COLUMN IF NOT EXISTS reminder_cancelled_at TIMESTAMPTZ;
ALTER TABLE enquiries ADD COLUMN IF NOT EXISTS reminder_last_attempt_at TIMESTAMPTZ;
ALTER TABLE enquiries ADD COLUMN IF NOT EXISTS reminder_count INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN enquiries.commitment_type IS 'Customer commitment stage, e.g. follow_up, planned_visit, paid_reservation, special_part.';
COMMENT ON COLUMN enquiries.follow_up_date IS 'Date the customer asked us to contact/remind them about this repair quote.';
COMMENT ON COLUMN enquiries.planned_visit_date IS 'Optional non-binding date the customer says they may bring the device in.';
COMMENT ON COLUMN enquiries.reminder_requested IS 'True only when the customer explicitly requests a service reminder.';
COMMENT ON COLUMN enquiries.reminder_at IS 'Timestamp when the requested quote follow-up becomes due.';
COMMENT ON COLUMN enquiries.reminder_sent_at IS 'Timestamp of the most recent successfully sent quote reminder.';
COMMENT ON COLUMN enquiries.reminder_cancelled_at IS 'Set when an outstanding quote reminder should no longer be sent.';
COMMENT ON COLUMN enquiries.reminder_last_attempt_at IS 'Last attempt to send this quote reminder; used to avoid rapid retry loops.';
COMMENT ON COLUMN enquiries.reminder_count IS 'Number of quote reminders successfully sent.';

CREATE INDEX IF NOT EXISTS idx_enquiries_due_quote_reminders
ON enquiries(reminder_at)
WHERE reminder_requested = TRUE
  AND reminder_sent_at IS NULL
  AND reminder_cancelled_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_enquiries_follow_up_date
ON enquiries(follow_up_date)
WHERE follow_up_date IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_enquiries_planned_visit_date
ON enquiries(planned_visit_date)
WHERE planned_visit_date IS NOT NULL;

-- Compatibility/backfill for the short-lived zero-cost website experiment.
-- These rows did not promise an automatic reminder, so reminder_requested stays false.
UPDATE enquiries
SET
  commitment_type = COALESCE(commitment_type, 'planned_visit'),
  planned_visit_date = COALESCE(planned_visit_date, payday_date::date)
WHERE quote_source = 'planned_visit'
  AND payday_date IS NOT NULL;
