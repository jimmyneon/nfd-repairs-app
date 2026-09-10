-- Fix missing columns in enquiries table
-- The business-enquiry API tries to insert best_time, gdpr_consent, and postcode
-- but these columns don't exist in the database

ALTER TABLE enquiries ADD COLUMN IF NOT EXISTS best_time TEXT;
ALTER TABLE enquiries ADD COLUMN IF NOT EXISTS gdpr_consent BOOLEAN DEFAULT false;
ALTER TABLE enquiries ADD COLUMN IF NOT EXISTS postcode TEXT;
