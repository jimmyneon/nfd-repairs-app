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
  ('facebook_review_link', 'https://www.facebook.com/newforestdevicerepairs/reviews/', 'Facebook page reviews link')
ON CONFLICT (key) DO NOTHING;

INSERT INTO admin_settings (key, value, description)
VALUES
  ('trustpilot_review_link', 'https://www.trustpilot.com/evaluate/newforestdevicerepairs.co.uk', 'Trustpilot review link')
ON CONFLICT (key) DO NOTHING;

-- Insert SMS templates for Facebook and Trustpilot reviews
INSERT INTO sms_templates (key, body, is_active)
VALUES
  (
    'POST_COLLECTION_REVIEW_FACEBOOK',
    'Hi {first_name}, thanks for choosing New Forest Device Repairs. We noticed you''ve already left us a Google review (thank you!). If you have a spare minute, a Facebook review would mean the world to us too:

{review_link}

Every review helps us reach more local customers.

– New Forest Device Repairs',
    true
  )
ON CONFLICT (key) DO NOTHING;

INSERT INTO sms_templates (key, body, is_active)
VALUES
  (
    'POST_COLLECTION_REVIEW_TRUSTPILOT',
    'Hi {first_name}, thanks again for choosing New Forest Device Repairs. You''ve already reviewed us on Google and Facebook — amazing! If you''d like to help even more, a Trustpilot review would be hugely appreciated:

{review_link}

Thank you for supporting a local business!

– New Forest Device Repairs',
    true
  )
ON CONFLICT (key) DO NOTHING;

COMMENT ON COLUMN jobs.review_platforms_completed IS 'JSONB array of review platforms the customer has completed (e.g. ["google", "facebook"])';
COMMENT ON COLUMN jobs.last_review_platform_requested IS 'The last review platform that was requested via SMS (google, facebook, trustpilot)';
