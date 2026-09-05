-- Auto-generate short_token for new jobs that don't have one
-- This ensures every job gets a short tracking link (nfdr.uk/t/XXXXXX)
CREATE OR REPLACE FUNCTION generate_short_token()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.short_token IS NULL THEN
    -- Generate a unique 6-char hex token
    NEW.short_token := substring(md5(random()::text || clock_timestamp()::text), 1, 6);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_short_token ON jobs;
CREATE TRIGGER set_short_token
  BEFORE INSERT ON jobs
  FOR EACH ROW
  EXECUTE FUNCTION generate_short_token();
