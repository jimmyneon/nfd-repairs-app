-- Intake reminder cron job
-- Calls the Next.js endpoint which handles SMS sending via MacroDroid
-- Runs daily at 10am UTC (11am BST / 10am GMT)

CREATE OR REPLACE FUNCTION public.send_intake_reminders()
RETURNS void AS $$
DECLARE
    v_cron_secret TEXT;
    v_response TEXT;
BEGIN
    v_cron_secret := '74f5d06ea99badfeb73748de6b4efbc96f6c8aee489aafb1d2d7a573eb221263';
    PERFORM http_set_curlopt('CURLOPT_TIMEOUT', '30');
    PERFORM http_set_curlopt('CURLOPT_CONNECTTIMEOUT', '10');

    SELECT content INTO v_response
    FROM http((
        'GET',
        'https://nfd-repairs-app.vercel.app/api/jobs/send-intake-reminders',
        ARRAY[http_header('Authorization', 'Bearer ' || v_cron_secret)],
        'application/json',
        ''
    )::http_request);

    RAISE NOTICE 'Intake reminders cron executed. Response: %', left(v_response, 200);
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE 'Intake reminders cron error: %', SQLERRM;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Schedule it to run daily at 10am UTC (if not already scheduled)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'send-intake-reminders-daily') THEN
        PERFORM cron.schedule(
            'send-intake-reminders-daily',
            '0 10 * * *',
            $$SELECT public.send_intake_reminders();$$
        );
    END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.send_intake_reminders() TO postgres;
