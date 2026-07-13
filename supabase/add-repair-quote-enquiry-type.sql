-- Migration: Add 'repair_quote' enquiry type and repair-specific fields to enquiries table
-- Run this in Supabase SQL editor

-- 1. Add repair quote specific columns
ALTER TABLE enquiries ADD COLUMN IF NOT EXISTS device_category TEXT;
ALTER TABLE enquiries ADD COLUMN IF NOT EXISTS device_make TEXT;
ALTER TABLE enquiries ADD COLUMN IF NOT EXISTS device_model TEXT;
ALTER TABLE enquiries ADD COLUMN IF NOT EXISTS repair_type TEXT;
ALTER TABLE enquiries ADD COLUMN IF NOT EXISTS screen_option TEXT;
ALTER TABLE enquiries ADD COLUMN IF NOT EXISTS quoted_price DECIMAL(10,2);
ALTER TABLE enquiries ADD COLUMN IF NOT EXISTS quote_type TEXT;
ALTER TABLE enquiries ADD COLUMN IF NOT EXISTS issue_description TEXT;
ALTER TABLE enquiries ADD COLUMN IF NOT EXISTS terms_accepted BOOLEAN DEFAULT FALSE;
ALTER TABLE enquiries ADD COLUMN IF NOT EXISTS proceed_with_repair BOOLEAN DEFAULT FALSE;
ALTER TABLE enquiries ADD COLUMN IF NOT EXISTS marketing_consent BOOLEAN DEFAULT FALSE;
ALTER TABLE enquiries ADD COLUMN IF NOT EXISTS quote_source TEXT;

-- 2. Update the enquiry_type CHECK constraint to allow 'repair_quote'
ALTER TABLE enquiries DROP CONSTRAINT IF EXISTS enquiries_enquiry_type_check;
ALTER TABLE enquiries ADD CONSTRAINT enquiries_enquiry_type_check 
    CHECK (enquiry_type IN ('web_services', 'home_services', 'business', 'repair_quote'));

-- 3. Make customer_email nullable (repair quotes use phone as primary contact)
ALTER TABLE enquiries ALTER COLUMN customer_email DROP NOT NULL;

-- 4. Add index for repair quotes
CREATE INDEX IF NOT EXISTS idx_enquiries_repair_quote ON enquiries(enquiry_type) WHERE enquiry_type = 'repair_quote';
CREATE INDEX IF NOT EXISTS idx_enquiries_quoted_price ON enquiries(quoted_price) WHERE quoted_price IS NOT NULL;

COMMENT ON COLUMN enquiries.device_category IS 'Repair quote: device category (Phone, Tablet, etc.)';
COMMENT ON COLUMN enquiries.device_make IS 'Repair quote: device manufacturer';
COMMENT ON COLUMN enquiries.device_model IS 'Repair quote: specific device model';
COMMENT ON COLUMN enquiries.repair_type IS 'Repair quote: type of repair (Screen, Battery, etc.)';
COMMENT ON COLUMN enquiries.screen_option IS 'Repair quote: screen quality option (Budget LCD, Premium OLED, etc.)';
COMMENT ON COLUMN enquiries.quoted_price IS 'Repair quote: price quoted to customer (null = personalized quote)';
COMMENT ON COLUMN enquiries.quote_type IS 'Repair quote: instant or personalized';
COMMENT ON COLUMN enquiries.issue_description IS 'Repair quote: customer description of the issue';
COMMENT ON COLUMN enquiries.terms_accepted IS 'Repair quote: customer agreed to T&Cs';
COMMENT ON COLUMN enquiries.proceed_with_repair IS 'Repair quote: customer wants to proceed with booking';
COMMENT ON COLUMN enquiries.marketing_consent IS 'Repair quote: customer opted in to marketing';
COMMENT ON COLUMN enquiries.quote_source IS 'Repair quote: where the quote came from (instant_quote_form, instant_quote_reject, etc.)';
