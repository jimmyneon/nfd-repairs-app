-- Migration: Add 'remote_support' enquiry type to enquiries table
-- This allows remote support requests submitted from the website to be stored.

-- Update the enquiry_type CHECK constraint to allow 'remote_support'
ALTER TABLE enquiries DROP CONSTRAINT IF EXISTS enquiries_enquiry_type_check;
ALTER TABLE enquiries ADD CONSTRAINT enquiries_enquiry_type_check
    CHECK (enquiry_type IN ('web_services', 'home_services', 'business', 'repair_quote', 'remote_support'));

-- Add index for remote support enquiries
CREATE INDEX IF NOT EXISTS idx_enquiries_remote_support ON enquiries(enquiry_type) WHERE enquiry_type = 'remote_support';
