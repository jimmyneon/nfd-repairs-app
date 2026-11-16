-- Unify the two conflicting cancellation_reason CHECK constraints on jobs.
--
-- jobs_cancellation_reason_check (20260904160000_fix_security_and_constraints.sql)
-- and valid_cancellation_reason (add-new-statuses-and-cancellation.sql) have
-- different allowed value sets, so only values in BOTH can ever be saved.
-- Drop both and re-create a single constraint covering the full set.

ALTER TABLE jobs DROP CONSTRAINT IF EXISTS jobs_cancellation_reason_check;
ALTER TABLE jobs DROP CONSTRAINT IF EXISTS valid_cancellation_reason;

ALTER TABLE jobs ADD CONSTRAINT jobs_cancellation_reason_check
  CHECK (
    cancellation_reason IS NULL OR cancellation_reason IN (
      'CUSTOMER_CANCELLED',
      'UNECONOMICAL',
      'UNREPAIRABLE',
      'BEYOND_REPAIR',
      'TOO_EXPENSIVE',
      'NO_RESPONSE',
      'CUSTOMER_UNREACHABLE',
      'PARTS_UNAVAILABLE',
      'CUSTOMER_FOUND_ALTERNATIVE',
      'CUSTOMER_DECLINED_QUOTE',
      'DUPLICATE',
      'OTHER'
    )
  );
