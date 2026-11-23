-- Native repair-app invoice scheduling. No ChatGPT task or external agent is involved.
-- Prerequisite: store the existing Vercel CRON_SECRET in Supabase Vault under
-- nfdr_invoice_cron_secret. Never put its value in this repository.
-- Uses the existing pg_cron and http extensions.
CREATE OR REPLACE FUNCTION public.billing_dispatch_invoices()
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  v_secret text;
  v_response extensions.http_response;
  v_result jsonb;
BEGIN
  SELECT decrypted_secret INTO v_secret FROM vault.decrypted_secrets
    WHERE name = 'nfdr_invoice_cron_secret';
  IF v_secret IS NULL OR length(v_secret) < 24 THEN
    RAISE EXCEPTION 'Native invoice scheduler credential is missing';
  END IF;
  PERFORM extensions.http_set_curlopt('CURLOPT_TIMEOUT', '55');
  PERFORM extensions.http_set_curlopt('CURLOPT_CONNECTTIMEOUT', '10');
  SELECT * INTO v_response FROM extensions.http((
    'GET',
    'https://nfd-repairs-app.vercel.app/api/invoices/run',
    ARRAY[extensions.http_header('Authorization', 'Bearer ' || v_secret)],
    'application/json', ''
  )::extensions.http_request);
  IF v_response.status <> 200 THEN
    RAISE EXCEPTION 'Native invoice runner returned HTTP %', v_response.status;
  END IF;
  v_result := v_response.content::jsonb;
  IF jsonb_typeof(v_result->'results') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Native invoice runner returned an invalid response';
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(v_result->'results') r
    WHERE r->>'error' IS NOT NULL) THEN
    RAISE EXCEPTION 'Native invoice delivery failed; inspect invoice delivery status in the repair app';
  END IF;
  RETURN v_result;
END;
$$;
-- Only the database scheduler/owner can call this. It is not a public RPC.
REVOKE ALL ON FUNCTION public.billing_dispatch_invoices() FROM PUBLIC, anon, authenticated, service_role;

-- pg_cron uses UTC. At 05:00 and 06:00 UTC, run only the occurrence that
-- corresponds to 06:00 Europe/London (BST and GMT respectively).
SELECT cron.schedule(
  'billing-invoices-0600-london',
  '0 5,6 * * *',
  $job$SELECT CASE WHEN extract(hour FROM now() AT TIME ZONE 'Europe/London') = 6
    THEN public.billing_dispatch_invoices()
    ELSE '{"skipped":"outside 06:00 Europe/London"}'::jsonb END;$job$
);

