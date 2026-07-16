-- Add missing SMS templates for COMPLETED and CANCELLED statuses

-- COMPLETED - Job marked as complete
INSERT INTO sms_templates (key, body, is_active)
VALUES (
  'COMPLETED',
  'Hi {customer_name}, your {device_make} {device_model} repair is now complete. Thank you for choosing New Forest Device Repairs! If you have any issues, please contact us.',
  true
)
ON CONFLICT (key) DO UPDATE SET
  body = EXCLUDED.body,
  is_active = EXCLUDED.is_active,
  updated_at = NOW();

-- CANCELLED - Job cancelled
INSERT INTO sms_templates (key, body, is_active)
VALUES (
  'CANCELLED',
  'Hi {customer_name}, your {device_make} {device_model} repair has been cancelled. If you have any questions, please contact New Forest Device Repairs.',
  true
)
ON CONFLICT (key) DO UPDATE SET
  body = EXCLUDED.body,
  is_active = EXCLUDED.is_active,
  updated_at = NOW();

-- Verify all SMS templates exist
SELECT key, LEFT(body, 50) as body_preview, is_active 
FROM sms_templates 
WHERE key IN (
    'QUOTE_APPROVED',
    'DROPPED_OFF',
    'RECEIVED',
    'DEPOSIT_REQUIRED',
    'PARTS_ORDERED',
    'PARTS_ARRIVED',
    'IN_REPAIR',
    'DELAYED',
    'READY_TO_COLLECT',
    'COLLECTED',
    'COMPLETED',
    'CANCELLED'
)
ORDER BY 
    CASE key
        WHEN 'QUOTE_APPROVED' THEN 1
        WHEN 'DROPPED_OFF' THEN 2
        WHEN 'RECEIVED' THEN 3
        WHEN 'DEPOSIT_REQUIRED' THEN 4
        WHEN 'PARTS_ORDERED' THEN 5
        WHEN 'PARTS_ARRIVED' THEN 6
        WHEN 'IN_REPAIR' THEN 7
        WHEN 'DELAYED' THEN 8
        WHEN 'READY_TO_COLLECT' THEN 9
        WHEN 'COLLECTED' THEN 10
        WHEN 'COMPLETED' THEN 11
        WHEN 'CANCELLED' THEN 12
    END;
