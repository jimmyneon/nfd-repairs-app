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

-- Set shop GPS coordinates for the first/main settings record
UPDATE admin_settings 
SET 
    shop_latitude = 50.75885792306448,
    shop_longitude = -1.542417216414494,
    gps_radius_meters = 100
WHERE key = 'google_review_link' 
   OR key = 'google_maps_link'
LIMIT 1;

-- If no rows were updated, insert default coordinates
-- (This ensures coordinates are set even if the table structure is different)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM admin_settings 
        WHERE shop_latitude IS NOT NULL
    ) THEN
        -- Update the first record found
        UPDATE admin_settings
        SET 
            shop_latitude = 50.75885792306448,
            shop_longitude = -1.542417216414494,
            gps_radius_meters = 100
        WHERE id = (SELECT id FROM admin_settings LIMIT 1);
    END IF;
END $$;
