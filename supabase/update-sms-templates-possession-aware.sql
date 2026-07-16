-- Update SMS templates to be possession-aware with Google Maps links
-- These templates will have {google_maps_link} placeholder that gets conditionally replaced

-- 1. QUOTE_APPROVED - Customer needs to drop off device (always include maps)
UPDATE sms_templates 
SET body = 'Great news {customer_name}! Your repair quote for {device_make} {device_model} has been approved (£{price_total}).

Please drop off your device at New Forest Device Repairs at your convenience.

Find us: {google_maps_link}
Opening hours: Mon-Fri 9am-5:30pm

Track your repair: {tracking_link}

New Forest Device Repairs'
WHERE key = 'QUOTE_APPROVED';

-- 2. PARTS_ARRIVED - Possession-aware (maps only if device NOT in shop)
UPDATE sms_templates 
SET body = 'Hi {customer_name}, great news! The parts for your {device_make} {device_model} have arrived and we''re ready to complete your repair.

Please drop off your device at your earliest convenience.

Find us: {google_maps_link}
Opening hours: Mon-Fri 9am-5:30pm

Track: {tracking_link}

New Forest Device Repairs'
WHERE key = 'PARTS_ARRIVED';

-- 3. RECEIVED - Device now in shop (no maps needed)
UPDATE sms_templates 
SET body = 'Hi {customer_name}, we''ve received your {device_make} {device_model}. We''ll assess it and keep you updated on progress.

Track your repair: {tracking_link}

New Forest Device Repairs'
WHERE key = 'RECEIVED';

-- 4. DELAYED - Include reason in message
UPDATE sms_templates 
SET body = 'Hi {customer_name}, your {device_make} {device_model} repair is experiencing a delay: {delay_reason}

{delay_notes}

We''ll keep you updated. Track: {tracking_link}

New Forest Device Repairs'
WHERE key = 'DELAYED';

-- Verify templates
SELECT key, LEFT(body, 100) as body_preview, is_active 
FROM sms_templates 
WHERE key IN ('QUOTE_APPROVED', 'PARTS_ARRIVED', 'RECEIVED', 'DELAYED')
ORDER BY key;
