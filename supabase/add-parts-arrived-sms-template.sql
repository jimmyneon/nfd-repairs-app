-- Add PARTS_ARRIVED SMS template to database

INSERT INTO sms_templates (key, body, is_active)
VALUES (
  'PARTS_ARRIVED',
  'Hi {customer_name}, great news! The parts for your {device_make} {device_model} have arrived. Please drop off your device at New Forest Device Repairs, Lyndhurst. Opening hours: Mon-Sat 9am-5pm. Google Maps: https://maps.google.com/?q=New+Forest+Device+Repairs+Lyndhurst Track: {tracking_link}',
  true
)
ON CONFLICT (key) DO UPDATE SET
  body = EXCLUDED.body,
  is_active = EXCLUDED.is_active;
