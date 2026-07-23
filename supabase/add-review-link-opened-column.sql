-- Add review_link_opened_at column to track when customers open the review link from SMS
-- This is separate from review_platforms_completed which tracks platform button clicks
-- Run this in Supabase SQL Editor

ALTER TABLE jobs
ADD COLUMN IF NOT EXISTS review_link_opened_at TIMESTAMPTZ;
