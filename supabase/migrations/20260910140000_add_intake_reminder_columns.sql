-- Add columns for tracking quick-intake completion and reminders
ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS quick_intake BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS intake_reminder_sent_at TIMESTAMPTZ;

-- Backfill quick_intake for existing walk_in_self jobs that were created
-- with the quick intake flow (onboarding not completed, device not in shop)
UPDATE jobs
SET quick_intake = TRUE
WHERE source = 'walk_in_self'
  AND onboarding_completed = FALSE
  AND device_in_shop = FALSE;
