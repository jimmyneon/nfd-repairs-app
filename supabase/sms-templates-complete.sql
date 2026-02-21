-- Complete SMS Templates for All Job Statuses and Events
-- Run this in Supabase SQL Editor to ensure all templates exist

-- Clear existing templates (optional - comment out if you want to keep existing)
-- DELETE FROM sms_templates;

-- Insert all SMS templates
INSERT INTO sms_templates (key, body, is_active) VALUES

-- Status: RECEIVED (when job first created manually)
('RECEIVED', 'Hi {customer_name}, we''ve received your {device_make} {device_model}. We''ll assess it and get back to you shortly with a quote. Track your repair: {tracking_link} - New Forest Device Repairs', true),

-- Status: AWAITING_DEPOSIT (when parts required and deposit needed)
('DEPOSIT_REQUIRED', 'Hi {customer_name},

Your {device_make} {device_model} repair quote is £{price_total}. We need a £{deposit_amount} deposit to order parts.

Pay here: {deposit_link}

Track your repair here: {tracking_link}

Many thanks,
New Forest Device Repairs', true),

-- Status: PARTS_ORDERED (when parts have been ordered)
('PARTS_ORDERED', 'Hi {customer_name}, parts for your {device_make} {device_model} have been ordered. We''ll notify you when they arrive and we''re ready to start the repair. Track: {tracking_link} - NFD Repairs', true),

-- Status: READY_TO_BOOK_IN (when no parts needed, ready to bring in)
('READY_TO_BOOK_IN', 'Hi {customer_name},

Your {device_make} {device_model} is ready to book in for repair. We''ll contact you to arrange a convenient time to drop it off.

Track your repair here: {tracking_link}

Many thanks,
New Forest Device Repairs', true),

-- Status: IN_REPAIR (when repair work has started)
('IN_REPAIR', 'Hi {customer_name}, your {device_make} {device_model} repair is now in progress. Our technicians are working on it and we''ll update you when it''s ready. Track: {tracking_link} - NFD Repairs', true),

-- Status: READY_TO_COLLECT (when repair is complete and ready for pickup)
('READY_TO_COLLECT', 'Hi {customer_name}, great news!

Your {device_make} {device_model} is ready to collect from New Forest Device Repairs.

Opening hours can be found here: https://share.google/wCwHX4X6N79tT6b5N

Track your repair here: {tracking_link}

Many thanks,
New Forest Device Repairs', true),

-- Status: COMPLETED (when job marked as complete)
('COMPLETED', 'Hi {customer_name},

Your {device_make} {device_model} repair is complete.

Track your repair here: {tracking_link}

Many thanks,
New Forest Device Repairs', true),

-- Status: CANCELLED (when job is cancelled)
('CANCELLED', 'Hi {customer_name}, your {device_make} {device_model} repair has been cancelled. If you have any questions, please contact us. Track: {tracking_link} - NFD Repairs', true),

-- Additional Event Templates

-- When deposit is received (optional - can be sent manually)
('DEPOSIT_RECEIVED', 'Hi {customer_name}, we''ve received your £{deposit_amount} deposit for {device_make} {device_model}. Parts are being ordered now. Track: {tracking_link} - NFD Repairs', true),

-- When there's a delay (can be sent manually)
('DELAY_NOTIFICATION', 'Hi {customer_name}, there''s a slight delay with your {device_make} {device_model} repair. We''ll keep you updated. Track: {tracking_link} - NFD Repairs', true),

-- Quote reminder (can be sent manually)
('QUOTE_REMINDER', 'Hi {customer_name}, just a reminder about your {device_make} {device_model} repair quote of £{price_total}. Let us know if you''d like to proceed. Track: {tracking_link} - NFD Repairs', true)

ON CONFLICT (key) DO UPDATE SET
  body = EXCLUDED.body,
  is_active = EXCLUDED.is_active,
  updated_at = NOW();
