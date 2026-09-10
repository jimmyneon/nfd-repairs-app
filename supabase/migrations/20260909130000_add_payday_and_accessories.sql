-- Add payday_date and accessories columns to enquiries table
-- Supports the "Reserve for Payday" feature and accessory upsells

ALTER TABLE enquiries ADD COLUMN IF NOT EXISTS payday_date DATE;
ALTER TABLE enquiries ADD COLUMN IF NOT EXISTS accessories JSONB DEFAULT '[]'::jsonb;
