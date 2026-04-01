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

-- Set shop GPS coordinates
UPDATE admin_settings 
SET 
    shop_latitude = 50.75885792306448,
    shop_longitude = -1.542417216414494,
    gps_radius_meters = 100
WHERE id = 1;
