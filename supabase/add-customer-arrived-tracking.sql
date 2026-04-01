-- Add customer arrival tracking to jobs table
-- This allows the job list to show when a customer is waiting at the shop

ALTER TABLE jobs 
ADD COLUMN IF NOT EXISTS customer_arrived_at TIMESTAMPTZ;

COMMENT ON COLUMN jobs.customer_arrived_at IS 'Timestamp when customer clicked "I''m Here for Collection" button - used to show waiting indicator in job list';
