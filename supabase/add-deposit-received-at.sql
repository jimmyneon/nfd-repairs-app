-- Add deposit_received_at column to jobs table
-- Used by PAID auto-detection to record when the customer confirmed payment via SMS

ALTER TABLE jobs
ADD COLUMN IF NOT EXISTS deposit_received_at timestamp with time zone;
