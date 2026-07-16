-- Migration: Add 'business' enquiry type and business-specific fields to enquiries table
-- Run this in Supabase SQL editor

-- 1. Add business-specific columns
ALTER TABLE enquiries ADD COLUMN IF NOT EXISTS help_type TEXT;
ALTER TABLE enquiries ADD COLUMN IF NOT EXISTS other_detail TEXT;
ALTER TABLE enquiries ADD COLUMN IF NOT EXISTS device_count TEXT;
ALTER TABLE enquiries ADD COLUMN IF NOT EXISTS urgency TEXT;
ALTER TABLE enquiries ADD COLUMN IF NOT EXISTS support_type TEXT;
ALTER TABLE enquiries ADD COLUMN IF NOT EXISTS company TEXT;

-- 2. Update the enquiry_type CHECK constraint to allow 'business'
-- First, drop the old constraint
ALTER TABLE enquiries DROP CONSTRAINT IF EXISTS enquiries_enquiry_type_check;

-- Then add the new one with 'business' included
ALTER TABLE enquiries ADD CONSTRAINT enquiries_enquiry_type_check 
    CHECK (enquiry_type IN ('web_services', 'home_services', 'business'));

-- 3. Add index for business enquiries
CREATE INDEX IF NOT EXISTS idx_enquiries_business ON enquiries(enquiry_type) WHERE enquiry_type = 'business';

COMMENT ON COLUMN enquiries.help_type IS 'Business enquiry: what the customer needs help with';
COMMENT ON COLUMN enquiries.other_detail IS 'Business enquiry: additional detail when help_type is Other';
COMMENT ON COLUMN enquiries.device_count IS 'Business enquiry: how many devices need support';
COMMENT ON COLUMN enquiries.urgency IS 'Business enquiry: how urgent the request is';
COMMENT ON COLUMN enquiries.support_type IS 'Business enquiry: one-off, occasional, or ongoing support';
COMMENT ON COLUMN enquiries.company IS 'Business enquiry: company or organisation name';
