-- Add customer_notes field to jobs table
-- This allows adding customer-visible notes without changing job status

ALTER TABLE public.jobs
ADD COLUMN IF NOT EXISTS customer_notes TEXT;

COMMENT ON COLUMN public.jobs.customer_notes IS 'Customer-visible notes that appear on tracking page. Can be updated without changing job status.';

-- Verify the column was added
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'jobs' AND column_name = 'customer_notes';
