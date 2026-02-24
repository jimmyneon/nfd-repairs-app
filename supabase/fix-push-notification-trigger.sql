-- Fix push notifications by adding database trigger to send push when notification is created
-- This ensures push notifications are sent automatically when a notification is inserted

-- Create function to send push notification via API
CREATE OR REPLACE FUNCTION send_push_notification_on_insert()
RETURNS TRIGGER AS $$
DECLARE
  app_url TEXT := 'https://nfd-repairs-app.vercel.app';
BEGIN
  -- Call the push notification API endpoint
  PERFORM
    net.http_post(
      url := app_url || '/api/notifications/send-push',
      headers := '{"Content-Type": "application/json"}'::jsonb,
      body := jsonb_build_object(
        'title', NEW.title,
        'body', NEW.body,
        'url', CASE 
          WHEN NEW.job_id IS NOT NULL THEN app_url || '/app/jobs/' || NEW.job_id
          ELSE app_url || '/app/jobs'
        END,
        'jobId', NEW.job_id
      )
    );
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger on notifications table
DROP TRIGGER IF EXISTS trigger_send_push_on_notification ON notifications;

CREATE TRIGGER trigger_send_push_on_notification
  AFTER INSERT ON notifications
  FOR EACH ROW
  EXECUTE FUNCTION send_push_notification_on_insert();

-- Note: This requires the pg_net extension to be enabled
-- Run this in Supabase SQL Editor:
-- CREATE EXTENSION IF NOT EXISTS pg_net;