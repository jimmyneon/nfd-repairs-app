-- Test Job for SMS Testing
-- This creates a test repair job with your phone number to test SMS functionality
-- Run this in Supabase SQL Editor

-- Test 1: Job with parts required (will send DEPOSIT_REQUIRED SMS)
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
  page,
  status,
  quoted_price,
  price_total,
  requires_parts_order,
  parts_required,
  deposit_required,
  deposit_amount,
  deposit_received
) VALUES (
  'John Hopwood',
  '+447410381247',
  'john@test.com',
  'Apple',
  'iPhone 14 Pro',
  'Screen replacement',
  'Cracked screen, touch still works',
  '[]'::jsonb,
  'repair',
  'manual_test',
  '/test',
  'AWAITING_DEPOSIT',
  149.99,
  149.99,
  true,
  true,
  true,
  20.00,
  false
);

-- Test 2: Job WITHOUT parts required (will send READY_TO_BOOK_IN SMS)
-- Uncomment to test this scenario:
/*
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
  page,
  status,
  quoted_price,
  price_total,
  requires_parts_order,
  parts_required,
  deposit_required,
  deposit_amount,
  deposit_received
) VALUES (
  'John Hopwood',
  '+447410381247',
  'john@test.com',
  'Samsung',
  'Galaxy S23',
  'Battery replacement',
  'Battery draining quickly',
  '[]'::jsonb,
  'repair',
  'manual_test',
  '/test',
  'READY_TO_BOOK_IN',
  89.99,
  89.99,
  false,
  false,
  false,
  null,
  false
);
*/

-- Note: These inserts will NOT automatically trigger SMS
-- because they bypass the API endpoint that queues SMS.
-- 
-- To test SMS properly:
-- 1. Use the AI Responder to create a job via the API, OR
-- 2. After running this SQL, manually trigger SMS by calling:
--    POST https://nfd-repairs-app.vercel.app/api/sms/send
--
-- Or you can manually insert into sms_logs to queue an SMS:
/*
INSERT INTO sms_logs (job_id, template_key, body_rendered, status)
SELECT 
  id,
  'DEPOSIT_REQUIRED',
  'Hi John Hopwood, your Apple iPhone 14 Pro repair quote is £149.99. We need a £20.00 deposit to order parts. Pay here: https://pay.sumup.com/b2c/Q9OZOAJT. Track: https://nfd-repairs-app.vercel.app/t/' || tracking_token || ' - NFD Repairs',
  'PENDING'
FROM jobs 
WHERE customer_phone = '+447410381247' 
  AND device_make = 'Apple'
ORDER BY created_at DESC 
LIMIT 1;
*/
