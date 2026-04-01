-- Add GPS coordinates to admin_settings for "I'm Here" button
-- Run this in Supabase SQL Editor

-- Add GPS coordinate fields
ALTER TABLE admin_settings 
ADD COLUMN IF NOT EXISTS shop_latitude DECIMAL(10, 8),
ADD COLUMN IF NOT EXISTS shop_longitude DECIMAL(11, 8),
ADD COLUMN IF NOT EXISTS gps_radius_meters INTEGER DEFAULT 100;

-- Add helpful comments
COMMENT ON COLUMN admin_settings.shop_latitude IS 'Shop GPS latitude for customer arrival verification';
COMMENT ON COLUMN admin_settings.shop_longitude IS 'Shop GPS longitude for customer arrival verification';
COMMENT ON COLUMN admin_settings.gps_radius_meters IS 'Acceptable radius in meters for "I''m Here" button (default 100m)';

-- Set default values (you can update these in the admin panel)
-- Example coordinates - UPDATE THESE with your actual shop location from Google Maps
UPDATE admin_settings 
SET 
    shop_latitude = 55.7558,
    shop_longitude = -3.9626,
    gps_radius_meters = 100
WHERE id = 1;
