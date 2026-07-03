-- Add repair_outcome column to jobs table
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS repair_outcome TEXT DEFAULT NULL;
-- Values: 'repaired', 'unrepaired', 'partial', 'warranty_claim'
COMMENT ON COLUMN jobs.repair_outcome IS 'Repair outcome: repaired, unrepaired, partial, or warranty_claim. NULL = not yet recorded.';

-- Add message_preference column to jobs table
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS message_preference TEXT DEFAULT NULL;
-- Values: 'sms', 'whatsapp'. NULL = default to SMS.
COMMENT ON COLUMN jobs.message_preference IS 'Customer messaging preference: sms or whatsapp. NULL = default (SMS).';
