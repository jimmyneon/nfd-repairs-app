-- Migration: Add additional fields to enquiries table for repair quotes
-- Run this in Supabase SQL editor

ALTER TABLE enquiries ADD COLUMN IF NOT EXISTS additional_repairs JSONB;
ALTER TABLE enquiries ADD COLUMN IF NOT EXISTS part_option TEXT;
ALTER TABLE enquiries ADD COLUMN IF NOT EXISTS display_price TEXT;
ALTER TABLE enquiries ADD COLUMN IF NOT EXISTS warranty TEXT;
ALTER TABLE enquiries ADD COLUMN IF NOT EXISTS estimated_time TEXT;
ALTER TABLE enquiries ADD COLUMN IF NOT EXISTS quote_key TEXT;
ALTER TABLE enquiries ADD COLUMN IF NOT EXISTS quote_sent_method TEXT;
ALTER TABLE enquiries ADD COLUMN IF NOT EXISTS repair_reserved BOOLEAN DEFAULT FALSE;
ALTER TABLE enquiries ADD COLUMN IF NOT EXISTS part_reserved BOOLEAN DEFAULT FALSE;
ALTER TABLE enquiries ADD COLUMN IF NOT EXISTS hesitation_reason TEXT;
ALTER TABLE enquiries ADD COLUMN IF NOT EXISTS customer_notes TEXT;
ALTER TABLE enquiries ADD COLUMN IF NOT EXISTS preferred_contact_method TEXT;

COMMENT ON COLUMN enquiries.additional_repairs IS 'Repair quote: JSON array of additional repairs selected';
COMMENT ON COLUMN enquiries.part_option IS 'Repair quote: selected part option (e.g. Budget LCD, Premium OLED)';
COMMENT ON COLUMN enquiries.display_price IS 'Repair quote: formatted price string for display';
COMMENT ON COLUMN enquiries.warranty IS 'Repair quote: warranty text for selected option';
COMMENT ON COLUMN enquiries.estimated_time IS 'Repair quote: estimated turnaround time';
COMMENT ON COLUMN enquiries.quote_key IS 'Repair quote: unique key for the selected quote option';
COMMENT ON COLUMN enquiries.quote_sent_method IS 'How the quote was sent (sms, email, both)';
