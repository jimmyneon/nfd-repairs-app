-- Sample Jobs for Testing
-- Run this in Supabase SQL Editor to create test data

-- Insert sample jobs with new schema fields
INSERT INTO jobs (
  customer_name,
  customer_phone,
  customer_email,
  device_make,
  device_model,
  issue,
  description,
  additional_issues,
  type,
  source,
  status,
  quoted_price,
  price_total,
  requires_parts_order,
  parts_required,
  deposit_required,
  deposit_amount,
  deposit_received
) VALUES
-- Job 1: iPhone screen repair - awaiting deposit
(
  'John Smith',
  '+447410381247',
  'john.smith@email.com',
  'Apple',
  'iPhone 12 Pro',
  'Cracked screen',
  'Screen shattered after drop, touch still works',
  '[{"issue": "Battery replacement", "description": "Battery health at 78%"}]'::jsonb,
  'repair',
  'ai_responder',
  'AWAITING_DEPOSIT',
  89.99,
  89.99,
  true,
  true,
  true,
  30.00,
  false
),

-- Job 2: Samsung repair - in progress
(
  'Sarah Johnson',
  '+447890123456',
  'sarah.j@email.com',
  'Samsung',
  'Galaxy S21',
  'Charging port not working',
  'Phone not charging, tried multiple cables',
  '[]'::jsonb,
  'repair',
  'website',
  'IN_REPAIR',
  65.00,
  65.00,
  true,
  true,
  true,
  20.00,
  true
),

-- Job 3: iPad ready to collect
(
  'Michael Brown',
  '+447123456789',
  null,
  'Apple',
  'iPad Air 4th Gen',
  'Screen replacement',
  'Cracked display, digitizer working',
  '[]'::jsonb,
  'repair',
  'ai_responder',
  'READY_TO_COLLECT',
  120.00,
  120.00,
  true,
  true,
  true,
  40.00,
  true
),

-- Job 4: MacBook - parts ordered
(
  'Emma Wilson',
  '+447567890123',
  'emma.w@email.com',
  'Apple',
  'MacBook Pro 13" 2020',
  'Keyboard not working',
  'Several keys not responding, liquid damage suspected',
  '[{"issue": "Trackpad replacement", "description": "Trackpad clicking intermittently"}]'::jsonb,
  'repair',
  'website',
  'PARTS_ORDERED',
  180.00,
  180.00,
  true,
  true,
  true,
  60.00,
  true
),

-- Job 5: Google Pixel - received
(
  'David Lee',
  '+447234567890',
  null,
  'Google',
  'Pixel 6 Pro',
  'Battery draining fast',
  'Battery life reduced to 2-3 hours, phone getting hot',
  '[]'::jsonb,
  'repair',
  'ai_responder',
  'RECEIVED',
  75.00,
  75.00,
  false,
  false,
  false,
  null,
  false
),

-- Job 6: OnePlus - ready to book in
(
  'Lisa Anderson',
  '+447345678901',
  'lisa.a@email.com',
  'OnePlus',
  'OnePlus 9',
  'Camera not focusing',
  'Rear camera blurry, autofocus not working',
  '[]'::jsonb,
  'repair',
  'website',
  'READY_TO_BOOK_IN',
  95.00,
  95.00,
  true,
  true,
  true,
  30.00,
  true
),

-- Job 7: iPhone - completed
(
  'James Taylor',
  '+447456789012',
  'james.t@email.com',
  'Apple',
  'iPhone 11',
  'Back glass replacement',
  'Back glass cracked, needs replacement',
  '[]'::jsonb,
  'repair',
  'ai_responder',
  'COMPLETED',
  55.00,
  55.00,
  true,
  true,
  true,
  20.00,
  true
),

-- Job 8: Huawei - awaiting deposit
(
  'Sophie Martin',
  '+447567890234',
  null,
  'Huawei',
  'P30 Pro',
  'Water damage',
  'Phone dropped in water, not turning on',
  '[{"issue": "Full diagnostic", "description": "Need to assess extent of damage"}]'::jsonb,
  'repair',
  'website',
  'AWAITING_DEPOSIT',
  150.00,
  150.00,
  true,
  true,
  true,
  50.00,
  false
),

-- Job 9: Xiaomi - in repair
(
  'Oliver Harris',
  '+447678901345',
  'oliver.h@email.com',
  'Xiaomi',
  'Mi 11',
  'Speaker not working',
  'No sound from earpiece speaker during calls',
  '[]'::jsonb,
  'repair',
  'ai_responder',
  'IN_REPAIR',
  45.00,
  45.00,
  true,
  true,
  true,
  15.00,
  true
),

-- Job 10: Sony - ready to collect
(
  'Charlotte Davis',
  '+447789012456',
  'charlotte.d@email.com',
  'Sony',
  'Xperia 5 II',
  'Fingerprint sensor not working',
  'Fingerprint reader not responding',
  '[]'::jsonb,
  'repair',
  'website',
  'READY_TO_COLLECT',
  80.00,
  80.00,
  true,
  true,
  true,
  25.00,
  true
);

-- Verify the jobs were created
SELECT 
  job_ref,
  customer_name,
  device_make || ' ' || device_model as device,
  issue,
  status,
  price_total
FROM jobs
ORDER BY created_at DESC;
