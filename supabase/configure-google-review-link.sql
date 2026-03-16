-- Configure Google Review Link for Post-Collection SMS
-- Update this with your actual Google Business review link

-- Check if setting exists
SELECT * FROM admin_settings WHERE key = 'google_review_link';

-- Update with your actual Google review link
-- Replace YOUR_ACTUAL_GOOGLE_PLACE_ID with your Google Business place ID
UPDATE admin_settings 
SET value = 'https://g.page/r/YOUR_ACTUAL_GOOGLE_PLACE_ID/review',
    description = 'Google Business review link for post-collection SMS'
WHERE key = 'google_review_link';

-- If it doesn't exist, insert it
INSERT INTO admin_settings (key, value, description)
VALUES ('google_review_link', 'https://g.page/r/YOUR_ACTUAL_GOOGLE_PLACE_ID/review', 'Google Business review link for post-collection SMS')
ON CONFLICT (key) DO UPDATE 
SET value = EXCLUDED.value,
    description = EXCLUDED.description;

-- Verify the setting
SELECT key, value, description 
FROM admin_settings 
WHERE key = 'google_review_link';

-- INSTRUCTIONS:
-- 1. Find your Google Business review link
-- 2. It should look like: https://g.page/r/CabcdefGHIJKLMNO/review
-- 3. Replace YOUR_ACTUAL_GOOGLE_PLACE_ID in the SQL above
-- 4. Run this script in Supabase SQL Editor
