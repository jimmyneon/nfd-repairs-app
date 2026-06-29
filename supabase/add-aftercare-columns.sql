-- Add aftercare SMS tracking columns to jobs table
-- Run this in Supabase SQL Editor

-- Aftercare SMS: sent 2 days after collection as a simple check-in (no review link)
ALTER TABLE jobs
ADD COLUMN IF NOT EXISTS aftercare_sms_scheduled_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS aftercare_sms_sent_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS aftercare_sms_delivery_status TEXT
