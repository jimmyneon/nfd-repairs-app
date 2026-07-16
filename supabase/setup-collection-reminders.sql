-- Collection Reminder System
-- Aligned to T&Cs: 30 days to collect, 90 days to disposal
-- Timeline: Day 5 (nudge), Day 14 (2nd nudge), Day 20 (storage warning),
--           Day 28 (final pre-storage), Day 30 (auto-move to IN_STORAGE),
--           Day 60 (in storage reminder), Day 85 (final notice), Day 90 (disposal flag)
-- Run this in Supabase SQL Editor

-- Step 1: Add collection reminder tracking columns
ALTER TABLE jobs
ADD COLUMN IF NOT EXISTS collection_reminder_1_sent_at TIMESTAMPTZ,  -- Day 5
ADD COLUMN IF NOT EXISTS collection_reminder_2_sent_at TIMESTAMPTZ,  -- Day 14
ADD COLUMN IF NOT EXISTS collection_reminder_3_sent_at TIMESTAMPTZ,  -- Day 20
ADD COLUMN IF NOT EXISTS collection_reminder_4_sent_at TIMESTAMPTZ,  -- Day 28
ADD COLUMN IF NOT EXISTS collection_reminder_5_sent_at TIMESTAMPTZ,  -- Day 60
ADD COLUMN IF NOT EXISTS collection_reminder_6_sent_at TIMESTAMPTZ,  -- Day 85
ADD COLUMN IF NOT EXISTS storage_moved_at TIMESTAMPTZ,               -- Day 30
ADD COLUMN IF NOT EXISTS disposal_flagged_at TIMESTAMPTZ;            -- Day 90

-- Step 2: Insert collection reminder SMS templates
-- Friendly tone, "reply here" not "call us", "pop in at your convenience"

-- COLLECTION_REMINDER_1 - Day 5: Friendly nudge
INSERT INTO sms_templates (key, body, is_active)
VALUES (
  'COLLECTION_REMINDER_1',
  'Hi {first_name}, just a friendly reminder that your {device_model} is ready to collect. Pop in at your convenience — our opening times are here: {hours_link}

Any questions, just reply here.

New Forest Device Repairs',
  true
)
ON CONFLICT (key) DO UPDATE SET body = EXCLUDED.body, is_active = true;

-- COLLECTION_REMINDER_2 - Day 14: Second nudge, mention 30-day timeframe
INSERT INTO sms_templates (key, body, is_active)
VALUES (
  'COLLECTION_REMINDER_2',
  'Hi {first_name}, your {device_model} has been ready to collect for a couple of weeks now. Please try to pop in within 30 days of it being ready.

Opening times: {hours_link}

Any questions, just reply here.

New Forest Device Repairs',
  true
)
ON CONFLICT (key) DO UPDATE SET body = EXCLUDED.body, is_active = true;

-- COLLECTION_REMINDER_3 - Day 20: Warning about storage transition at day 30
INSERT INTO sms_templates (key, body, is_active)
VALUES (
  'COLLECTION_REMINDER_3',
  'Hi {first_name}, your {device_model} is coming up to our 30-day holding limit. After 30 days it will be moved to long-term storage. Please pop in to collect it in the next 10 days to avoid this.

Opening times: {hours_link}

Any questions, just reply here.

New Forest Device Repairs',
  true
)
ON CONFLICT (key) DO UPDATE SET body = EXCLUDED.body, is_active = true;

-- COLLECTION_REMINDER_4 - Day 28: Final reminder before storage move
INSERT INTO sms_templates (key, body, is_active)
VALUES (
  'COLLECTION_REMINDER_4',
  'Hi {first_name}, this is a quick reminder that your {device_model} will be moved to long-term storage in a couple of days if not collected. It will still be safe with us, but please pop in as soon as you can.

Opening times: {hours_link}

Any questions, just reply here.

New Forest Device Repairs',
  true
)
ON CONFLICT (key) DO UPDATE SET body = EXCLUDED.body, is_active = true;

-- COLLECTION_REMINDER_5 - Day 60: In storage, still friendly, mention 90-day disposal
INSERT INTO sms_templates (key, body, is_active)
VALUES (
  'COLLECTION_REMINDER_5',
  'Hi {first_name}, your {device_model} is currently in our long-term storage. It will still be here for another 30 days, but after 90 days it may be recycled. Please pop in to collect it when you can.

Opening times: {hours_link}

Any questions, just reply here.

New Forest Device Repairs',
  true
)
ON CONFLICT (key) DO UPDATE SET body = EXCLUDED.body, is_active = true;

-- COLLECTION_REMINDER_6 - Day 85: Final notice before disposal
INSERT INTO sms_templates (key, body, is_active)
VALUES (
  'COLLECTION_REMINDER_6',
  'Hi {first_name}, this is our final reminder about your {device_model}. If it isn''t collected in the next 5 days, it may be recycled or disposed of. Please reply here if you need to make arrangements.

Opening times: {hours_link}

New Forest Device Repairs',
  true
)
ON CONFLICT (key) DO UPDATE SET body = EXCLUDED.body, is_active = true;

-- Step 3: Create function to process collection reminders
CREATE OR REPLACE FUNCTION send_collection_reminders()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_cron_secret TEXT;
  v_response TEXT;
BEGIN
  v_cron_secret := '74f5d06ea99badfeb73748de6b4efbc96f6c8aee489aafb1d2d7a573eb221263';
  
  SELECT content INTO v_response
  FROM http((
    'GET',
    'https://nfd-repairs-app.vercel.app/api/jobs/send-collection-reminders',
    ARRAY[http_header('Authorization', 'Bearer ' || v_cron_secret)],
    'application/json',
    ''
  )::http_request);
  
  RAISE NOTICE 'Collection reminders cron executed. Response: %', v_response;
END;
$$;

-- Step 4: Schedule the cron job to run daily at 10am
SELECT cron.schedule(
  'send-collection-reminders-daily',
  '0 10 * * *',
  'SELECT send_collection_reminders();'
);

-- Step 5: Verify
SELECT * FROM cron.job WHERE jobname = 'send-collection-reminders-daily';
SELECT key, is_active FROM sms_templates WHERE key LIKE 'COLLECTION_REMINDER%';
