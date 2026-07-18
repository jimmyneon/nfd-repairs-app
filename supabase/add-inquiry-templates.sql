-- Add inquiry SMS templates for parts in stock and special order parts

-- PARTS_IN_STOCK - Parts already in stock, customer can drop off anytime
INSERT INTO sms_templates (key, body, is_active)
VALUES (
  'PARTS_IN_STOCK',
  'Hi {first_name},

We''ve got the parts for your {device_make} {device_model} in stock! Pop it in any time at your convenience and we''ll get it sorted.

Our opening times:
{hours_link}

New Forest Device Repairs',
  true
)
ON CONFLICT (key) DO UPDATE SET body = EXCLUDED.body;

-- SPECIAL_ORDER_PARTS - Customer approved quote, need to order parts, deposit required
INSERT INTO sms_templates (key, body, is_active)
VALUES (
  'SPECIAL_ORDER_PARTS',
  'Hi {first_name},

Thanks for approving the quote for your {device_make} {device_model}! I''m ordering the parts in now — they usually arrive next day. We just need a £{deposit_amount} deposit to get the order placed.

Pay online here:
{deposit_link}

Or pop in to the shop to pay. Please check our live hours before setting off: {hours_link}

New Forest Device Repairs',
  true
)
ON CONFLICT (key) DO UPDATE SET body = EXCLUDED.body;

-- Verify
SELECT key, LEFT(body, 80) as body_preview, is_active FROM sms_templates WHERE key IN ('PARTS_IN_STOCK', 'SPECIAL_ORDER_PARTS') ORDER BY key;
