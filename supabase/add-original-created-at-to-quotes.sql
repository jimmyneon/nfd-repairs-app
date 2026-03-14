-- Add original_created_at field to quotes table
-- This captures when the quote was originally created in AI Responder
-- (not when it was synced to Repair App)

ALTER TABLE quotes 
ADD COLUMN IF NOT EXISTS original_created_at TIMESTAMPTZ;

-- Create index for sorting by original creation date
CREATE INDEX IF NOT EXISTS idx_quotes_original_created_at ON quotes(original_created_at DESC);

-- Update existing quotes to use created_at as fallback if original_created_at is null
UPDATE quotes 
SET original_created_at = created_at 
WHERE original_created_at IS NULL;

-- Add comment to clarify the difference
COMMENT ON COLUMN quotes.created_at IS 'When the quote was synced to Repair App database';
COMMENT ON COLUMN quotes.original_created_at IS 'When the quote was originally created in AI Responder system';
