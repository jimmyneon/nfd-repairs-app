-- Aftercare SMS is now manual-only (triggered via button on job page)
-- This migration clears any pending aftercare SMS schedules that were set
-- by the old automatic scheduling, so they won't be sent by the cron job.
-- Jobs that already had aftercare sent (aftercare_sms_sent_at IS NOT NULL)
-- are left alone since they're already done.

-- Clear pending aftercare schedules (scheduled but not yet sent)
UPDATE jobs
SET aftercare_sms_scheduled_at = NULL
WHERE aftercare_sms_scheduled_at IS NOT NULL
  AND aftercare_sms_sent_at IS NULL;

-- Note: The aftercare_sms_scheduled_at and aftercare_sms_sent_at columns
-- already exist from previous migrations. No new columns needed —
-- the manual button simply sends directly without scheduling.

-- Verify the cleanup
SELECT 
  COUNT(*) FILTER (WHERE aftercare_sms_scheduled_at IS NOT NULL AND aftercare_sms_sent_at IS NULL) as pending_aftercare,
  COUNT(*) FILTER (WHERE aftercare_sms_sent_at IS NOT NULL) as aftercare_sent
FROM jobs;
