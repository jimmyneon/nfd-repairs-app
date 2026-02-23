-- Add Google Maps link to admin_settings
-- Run this in Supabase SQL Editor

INSERT INTO admin_settings (key, value, description)
VALUES (
  'google_maps_link',
  'https://maps.app.goo.gl/oVczouUePXkRbrKb7',
  'Google Maps link to shop location for SMS messages'
)
ON CONFLICT (key) 
DO UPDATE SET 
  value = EXCLUDED.value,
  updated_at = NOW();
