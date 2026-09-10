-- Keep the legacy screen_option display field aligned with the richer part_option
-- field used by the current quote catalogue. The Enquiries UI currently labels
-- screen_option simply as "Option", so this makes the customer's selected part
-- quality visible without discarding part_option.

-- Backfill existing repair enquiries where the richer option exists but the
-- compatibility display field is blank.
UPDATE enquiries
SET screen_option = part_option
WHERE enquiry_type = 'repair_quote'
  AND part_option IS NOT NULL
  AND BTRIM(part_option) <> ''
  AND (screen_option IS NULL OR BTRIM(screen_option) = '');

CREATE OR REPLACE FUNCTION sync_repair_quote_option_display()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.enquiry_type = 'repair_quote'
     AND NEW.part_option IS NOT NULL
     AND BTRIM(NEW.part_option) <> ''
     AND (NEW.screen_option IS NULL OR BTRIM(NEW.screen_option) = '') THEN
    NEW.screen_option := NEW.part_option;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_repair_quote_option_display ON enquiries;

CREATE TRIGGER trg_sync_repair_quote_option_display
BEFORE INSERT OR UPDATE OF part_option, screen_option
ON enquiries
FOR EACH ROW
EXECUTE FUNCTION sync_repair_quote_option_display();
