-- Add quote_approved_at column if it doesn't exist
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS quote_approved_at TIMESTAMPTZ;

-- Also ensure quoted_at exists
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS quoted_at TIMESTAMPTZ;
