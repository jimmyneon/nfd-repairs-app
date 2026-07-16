-- Add suggested_jobs field to warranty_tickets for smart matching
-- Instead of auto-linking, we show suggestions and let staff choose

ALTER TABLE warranty_tickets 
ADD COLUMN IF NOT EXISTS suggested_jobs JSONB DEFAULT '[]'::jsonb;

-- Add approval tracking fields
ALTER TABLE warranty_tickets
ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS approved_by UUID,
ADD COLUMN IF NOT EXISTS approval_notes TEXT,
ADD COLUMN IF NOT EXISTS requires_parts BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS parts_ordered_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS parts_arrived_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS decline_reason TEXT;

-- Add index for suggested_jobs
CREATE INDEX IF NOT EXISTS idx_warranty_tickets_suggested_jobs ON warranty_tickets USING GIN (suggested_jobs);

-- Add comments
COMMENT ON COLUMN warranty_tickets.suggested_jobs IS 'Array of suggested job matches with confidence scores - staff manually selects the correct one';
COMMENT ON COLUMN warranty_tickets.approved_at IS 'When warranty was approved by staff';
COMMENT ON COLUMN warranty_tickets.requires_parts IS 'Whether parts need to be ordered for this warranty repair';
COMMENT ON COLUMN warranty_tickets.parts_ordered_at IS 'When parts were ordered for warranty repair';
COMMENT ON COLUMN warranty_tickets.parts_arrived_at IS 'When parts arrived and customer can bring device in';
COMMENT ON COLUMN warranty_tickets.decline_reason IS 'Reason for declining warranty (if declined)';
