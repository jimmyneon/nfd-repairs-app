-- Create a function to send intake reminders for incomplete walk-in self-booking forms
-- Runs daily via pg_cron at 10am UTC (11am BST / 10am GMT)
-- Sends one reminder 24 hours after the form was started, if not yet completed

CREATE OR REPLACE FUNCTION public.send_intake_reminders()
RETURNS void AS $$
DECLARE
  job_record RECORD;
  sms_body TEXT;
  first_name TEXT;
  walk_in_url TEXT := 'https://nfd-repairs-app.vercel.app/walk-in';
  webhook_url TEXT := 'https://trigger.macrodroid.com/4e59ada0-b4c6-443d-b189-3c7aa21a8454/send-sms';
  response_id INTEGER;
  uk_hour INTEGER;
BEGIN
  -- Check if within UK sending hours (8am-8pm)
  uk_hour := EXTRACT(HOUR FROM (NOW() AT TIME ZONE 'Europe/London'));
  IF uk_hour < 8 OR uk_hour >= 20 THEN
    RETURN;
  END IF;

  -- Find pending quick-intake jobs (24h old, not completed, no reminder sent yet)
  FOR job_record IN
    SELECT id, job_ref, customer_name, customer_phone
    FROM jobs
    WHERE source = 'walk_in_self'
      AND quick_intake = true
      AND onboarding_completed = false
      AND intake_reminder_sent_at IS NULL
      AND created_at < NOW() - INTERVAL '24 hours'
      AND created_at > NOW() - INTERVAL '7 days'
      AND customer_phone ~ '^07[1-57-9][0-9]{8}$'
  LOOP
    -- Extract first name
    first_name := split_part(job_record.customer_name, ' ', 1);

    -- Build SMS body
    sms_body := 'Hi ' || first_name || '! 👋' || E'\n\n' ||
      'Just a friendly reminder — you started checking in your device with us but haven''t finished yet.' || E'\n\n' ||
      'Tap here to complete it (takes 2 minutes):' || E'\n' || walk_in_url || E'\n\n' ||
      'NFD Repairs';

    -- Send via MacroDroid using pg_net
    SELECT id INTO response_id FROM net.http_post(
      url := webhook_url,
      headers := '{"Content-Type": "application/json"}'::jsonb,
      body := jsonb_build_object('phone', job_record.customer_phone, 'message', sms_body)::text
    );

    -- Log the SMS
    INSERT INTO sms_logs (job_id, template_key, body_rendered, status, recipient_phone)
    VALUES (job_record.id, 'INTAKE_REMINDER', sms_body, 'SENT', job_record.customer_phone);

    -- Mark as reminded
    UPDATE jobs SET intake_reminder_sent_at = NOW() WHERE id = job_record.id;
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Schedule it to run daily at 10am UTC
SELECT cron.schedule(
  'send-intake-reminders-daily',
  '0 10 * * *',
  $$SELECT public.send_intake_reminders();$$
);

-- Grant permissions
GRANT EXECUTE ON FUNCTION public.send_intake_reminders() TO postgres;
