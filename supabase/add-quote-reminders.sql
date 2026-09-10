-- Quote follow-up / reminder lifecycle for repair enquiries
-- Apply this migration before enabling the automatic reminder endpoint in production.
-- The customer chooses when they hope to get the repair done; one service
-- reminder is scheduled two days beforehand.

ALTER TABLE enquiries ADD COLUMN IF NOT EXISTS commitment_type TEXT;
ALTER TABLE enquiries ADD COLUMN IF NOT EXISTS planned_repair_date DATE;
ALTER TABLE enquiries ADD COLUMN IF NOT EXISTS reminder_requested BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE enquiries ADD COLUMN IF NOT EXISTS reminder_at TIMESTAMPTZ;
ALTER TABLE enquiries ADD COLUMN IF NOT EXISTS reminder_sent_at TIMESTAMPTZ;
ALTER TABLE enquiries ADD COLUMN IF NOT EXISTS reminder_cancelled_at TIMESTAMPTZ;
ALTER TABLE enquiries ADD COLUMN IF NOT EXISTS reminder_last_attempt_at TIMESTAMPTZ;
ALTER TABLE enquiries ADD COLUMN IF NOT EXISTS reminder_count INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN enquiries.commitment_type IS 'Customer journey action, e.g. remind_later. This is not a repair approval or booking.';
COMMENT ON COLUMN enquiries.planned_repair_date IS 'Non-binding date the customer hopes to get the repair done.';
COMMENT ON COLUMN enquiries.reminder_requested IS 'True only when the customer explicitly requested a service reminder.';
COMMENT ON COLUMN enquiries.reminder_at IS 'When the requested repair reminder becomes due, normally two days before planned_repair_date.';
COMMENT ON COLUMN enquiries.reminder_sent_at IS 'Timestamp of the successfully sent repair reminder.';
COMMENT ON COLUMN enquiries.reminder_cancelled_at IS 'Set when an outstanding reminder should no longer be sent.';
COMMENT ON COLUMN enquiries.reminder_last_attempt_at IS 'Last attempted reminder send; used to throttle retries after SMS failures.';
COMMENT ON COLUMN enquiries.reminder_count IS 'Number of repair reminders successfully sent.';

CREATE INDEX IF NOT EXISTS idx_enquiries_due_quote_reminders
ON enquiries(reminder_at)
WHERE reminder_requested = TRUE
  AND reminder_sent_at IS NULL
  AND reminder_cancelled_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_enquiries_planned_repair_date
ON enquiries(planned_repair_date)
WHERE planned_repair_date IS NOT NULL;

-- No backfill is required. This migration is intended to be applied before the
-- public Remind Me Later flow is enabled.
