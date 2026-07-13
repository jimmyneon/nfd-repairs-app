-- Migration: Add post-quote journey fields to enquiries table
-- Run this in Supabase SQL editor

-- 1. Add fields for the new post-quote customer journey
ALTER TABLE enquiries ADD COLUMN IF NOT EXISTS hesitation_reason TEXT;
ALTER TABLE enquiries ADD COLUMN IF NOT EXISTS customer_budget DECIMAL(10,2);
ALTER TABLE enquiries ADD COLUMN IF NOT EXISTS quote_sent_method TEXT;
ALTER TABLE enquiries ADD COLUMN IF NOT EXISTS repair_reserved BOOLEAN DEFAULT FALSE;
ALTER TABLE enquiries ADD COLUMN IF NOT EXISTS part_reserved BOOLEAN DEFAULT FALSE;
ALTER TABLE enquiries ADD COLUMN IF NOT EXISTS preferred_contact_method TEXT DEFAULT 'sms';
ALTER TABLE enquiries ADD COLUMN IF NOT EXISTS customer_notes TEXT;
ALTER TABLE enquiries ADD COLUMN IF NOT EXISTS quote_valid_until TIMESTAMPTZ;

-- 2. Comments for documentation
COMMENT ON COLUMN enquiries.hesitation_reason IS 'Post-quote: why customer hesitated (more_than_expected, comparing_prices, need_more_info, wait_until_payday, other)';
COMMENT ON COLUMN enquiries.customer_budget IS 'Post-quote: budget customer was hoping to stay within';
COMMENT ON COLUMN enquiries.quote_sent_method IS 'Post-quote: how quote was sent to customer (sms, email, both)';
COMMENT ON COLUMN enquiries.repair_reserved IS 'Post-quote: customer chose to reserve their repair slot';
COMMENT ON COLUMN enquiries.part_reserved IS 'Post-quote: customer chose to reserve a part for payday';
COMMENT ON COLUMN enquiries.preferred_contact_method IS 'Post-quote: preferred contact method (sms, email, phone)';
COMMENT ON COLUMN enquiries.customer_notes IS 'Post-quote: free-text notes from customer (other reason, questions, etc.)';
COMMENT ON COLUMN enquiries.quote_valid_until IS 'Post-quote: when the quote expires (default 14 days from creation)';

-- 3. Add index for filtering by hesitation reason (staff follow-up)
CREATE INDEX IF NOT EXISTS idx_enquiries_hesitation ON enquiries(hesitation_reason) WHERE hesitation_reason IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_enquiries_reserved ON enquiries(repair_reserved) WHERE repair_reserved = true;
CREATE INDEX IF NOT EXISTS idx_enquiries_part_reserved ON enquiries(part_reserved) WHERE part_reserved = true;
