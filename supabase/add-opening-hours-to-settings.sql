-- Add opening_hours and special_hours to admin_settings
-- This allows the /api/public/opening-hours endpoint to read from DB

-- Insert structured opening hours (JSONB format)
-- The API reads this and returns it to the static site's shop-status.js
INSERT INTO admin_settings (key, value, description)
VALUES (
  'opening_hours',
  '{
    "Sunday":    { "isOpen": false, "formatted": "Closed" },
    "Monday":    { "isOpen": true, "formatted": "10:00 AM - 5:00 PM", "open": "10:00", "close": "17:00" },
    "Tuesday":   { "isOpen": true, "formatted": "10:00 AM - 5:00 PM", "open": "10:00", "close": "17:00" },
    "Wednesday": { "isOpen": true, "formatted": "10:00 AM - 5:00 PM", "open": "10:00", "close": "17:00" },
    "Thursday":  { "isOpen": true, "formatted": "10:00 AM - 5:00 PM", "open": "10:00", "close": "17:00" },
    "Friday":    { "isOpen": true, "formatted": "10:00 AM - 5:00 PM", "open": "10:00", "close": "17:00" },
    "Saturday":  { "isOpen": true, "formatted": "10:00 AM - 3:00 PM", "open": "10:00", "close": "15:00" }
  }'::jsonb,
  'Weekly opening hours for shop status API. Format: { "Day": { "isOpen": bool, "formatted": "display text", "open": "HH:MM", "close": "HH:MM" } }'
)
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

-- Insert special_hours (for holidays, temporary closures, etc.)
INSERT INTO admin_settings (key, value, description)
VALUES (
  'special_hours',
  '{ "active": false, "note": null }'::jsonb,
  'Special hours for holidays/closures. Set active=true and note="message" to show a holiday banner.'
)
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

-- Verify
SELECT key, value, description FROM admin_settings WHERE key IN ('opening_hours', 'special_hours', 'google_maps_link', 'opening_hours_link');
