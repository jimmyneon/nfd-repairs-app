-- Add warranty job support to jobs table
-- Allows marking a job as a warranty repair (no charge, no deposit, no diagnostic fee)

ALTER TABLE jobs ADD COLUMN IF NOT EXISTS is_warranty BOOLEAN DEFAULT FALSE;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS linked_warranty_ticket_id UUID REFERENCES warranty_tickets(id) ON DELETE SET NULL;

-- Index for filtering warranty jobs
CREATE INDEX IF NOT EXISTS idx_jobs_is_warranty ON jobs(is_warranty) WHERE is_warranty = true;
CREATE INDEX IF NOT EXISTS idx_jobs_linked_warranty_ticket ON jobs(linked_warranty_ticket_id) WHERE linked_warranty_ticket_id IS NOT NULL;

-- Comments
COMMENT ON COLUMN jobs.is_warranty IS 'True if this is a warranty repair (no charge to customer)';
COMMENT ON COLUMN jobs.linked_warranty_ticket_id IS 'Reference to warranty_tickets table if this job was created from a warranty claim';
