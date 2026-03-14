-- Add passcode requirement and security fields to jobs table
-- Supports the new booking-in workflow with passcode options

-- Add passcode requirement selector field
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS passcode_requirement TEXT 
  CHECK (passcode_requirement IN ('not_required', 'recommended', 'required'));

-- Add passcode method tracking
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS passcode_method TEXT
  CHECK (passcode_method IN ('provided', 'will_remove', 'send_link', 'not_applicable'));

-- Add scheduled deletion timestamp for passcode security
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS passcode_deletion_scheduled_at TIMESTAMPTZ;

-- Add linked quote reference
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS linked_quote_id UUID REFERENCES quotes(quote_request_id) ON DELETE SET NULL;

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_jobs_linked_quote ON jobs(linked_quote_id);
CREATE INDEX IF NOT EXISTS idx_jobs_passcode_deletion ON jobs(passcode_deletion_scheduled_at) 
  WHERE passcode_deletion_scheduled_at IS NOT NULL;

-- Comment for documentation
COMMENT ON COLUMN jobs.passcode_requirement IS 'Technician sets: not_required, recommended, or required';
COMMENT ON COLUMN jobs.passcode_method IS 'Customer choice: provided, will_remove, send_link, or not_applicable';
COMMENT ON COLUMN jobs.passcode_deletion_scheduled_at IS 'Auto-delete passcode 7 days after collection for security';
COMMENT ON COLUMN jobs.linked_quote_id IS 'Reference to quote_request_id from AI Responder if converted from quote';
