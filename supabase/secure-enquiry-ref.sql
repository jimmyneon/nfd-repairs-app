-- Migration: Make enquiry_ref more secure (8-char alphanumeric instead of 4-digit number)
-- Run this in Supabase SQL editor

-- Drop old trigger and function
DROP TRIGGER IF EXISTS set_enquiry_ref ON enquiries;
DROP FUNCTION IF EXISTS generate_enquiry_ref();

-- New function: generates 8-character alphanumeric ref (e.g. ENQ-A7X9K2MQ)
-- 36^8 = ~2.8 trillion combinations — not guessable
CREATE OR REPLACE FUNCTION generate_enquiry_ref()
RETURNS TRIGGER AS $$
DECLARE
    chars TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; -- no confusing chars (0,O,1,I)
    ref TEXT;
    i INT;
BEGIN
    FOR i IN 1..100 LOOP
        ref := 'ENQ-';
        FOR j IN 1..8 LOOP
            ref := ref || substr(chars, FLOOR(RANDOM() * length(chars) + 1)::INT, 1);
        END LOOP;
        
        IF NOT EXISTS (SELECT 1 FROM enquiries WHERE enquiry_ref = ref) THEN
            NEW.enquiry_ref := ref;
            RETURN NEW;
        END IF;
    END LOOP;
    
    -- Fallback (extremely unlikely to reach here)
    NEW.enquiry_ref := 'ENQ-' || UPPER(SUBSTR(MD5(RANDOM()::TEXT), 1, 8));
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Recreate trigger
CREATE TRIGGER set_enquiry_ref
    BEFORE INSERT ON enquiries
    FOR EACH ROW
    WHEN (NEW.enquiry_ref IS NULL)
    EXECUTE FUNCTION generate_enquiry_ref();

-- Widen the column to accommodate longer refs
ALTER TABLE enquiries ALTER COLUMN enquiry_ref TYPE VARCHAR(20);
