-- Migration: Make enquiry_ref more secure (8-char alphanumeric instead of 4-digit number)
-- Run this in Supabase SQL editor

-- 1. Drop old trigger FIRST (can't alter column while trigger depends on it)
DROP TRIGGER IF EXISTS set_enquiry_ref ON enquiries;
DROP FUNCTION IF EXISTS generate_enquiry_ref();

-- 2. Widen the column to accommodate longer refs
ALTER TABLE enquiries ALTER COLUMN enquiry_ref TYPE VARCHAR(20);

-- 3. New function: generates 8-character alphanumeric ref (e.g. ENQ-A7X9K2MQ)
-- Uses 32 chars (no confusing 0,O,1,I) = 32^8 = ~1.1 trillion combinations
CREATE OR REPLACE FUNCTION generate_enquiry_ref()
RETURNS TRIGGER AS $$
DECLARE
    chars TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
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

-- 4. Recreate trigger
CREATE TRIGGER set_enquiry_ref
    BEFORE INSERT ON enquiries
    FOR EACH ROW
    WHEN (NEW.enquiry_ref IS NULL)
    EXECUTE FUNCTION generate_enquiry_ref();
