-- Multi-Platform Review System
-- Adds review_platforms_completed column to jobs table
-- Seeds review links for Google, Facebook, and Trustpilot in admin_settings

-- Add column to track which review platforms a customer has completed
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS review_platforms_completed JSONB DEFAULT '[]'::jsonb;

-- Add column to track which platform was last requested
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS last_review_platform_requested TEXT;

-- Grant access
GRANT UPDATE ON jobs TO authenticated;

-- Insert review links into admin_settings (if not already present)
INSERT INTO admin_settings (key, value, description)
VALUES
  ('google_review_link', 'https://g.page/r/YOUR_GOOGLE_REVIEW_LINK/review', 'Google Business review link')
ON CONFLICT (key) DO NOTHING;

INSERT INTO admin_settings (key, value, description)
VALUES
  ('facebook_review_link', 'https://www.facebook.com/NFDrepairs/reviews/', 'Facebook page reviews link')
ON CONFLICT (key) DO NOTHING;

INSERT INTO admin_settings (key, value, description)
VALUES
  ('trustpilot_review_link', 'https://uk.trustpilot.com/review/newforestdevicerepairs.co.uk', 'Trustpilot review link')
ON CONFLICT (key) DO NOTHING;

-- Update the main POST_COLLECTION_REVIEW template to use the review landing page
INSERT INTO sms_templates (key, body, is_active)
VALUES
  (
    'POST_COLLECTION_REVIEW',
    'Hi {first_name}, thanks for choosing New Forest Device Repairs! Could you spare 2 mins to leave us a review? It really helps our small business:

{review_link}

If anything isn''t quite right, just reply and we''ll put it right.

– New Forest Device Repairs',
    true
  )
ON CONFLICT (key) DO UPDATE SET body = EXCLUDED.body, is_active = true;

COMMENT ON COLUMN jobs.review_platforms_completed IS 'JSONB array of review platforms the customer has completed (e.g. ["google", "facebook"])';
COMMENT ON COLUMN jobs.last_review_platform_requested IS 'The last review platform that was requested via SMS (google, facebook, trustpilot)';
