-- Reviewable production steps. Do not run before explicit migration approval.
-- Project: pmwwaorjzxwuagjvtkkn (repair app).
-- 1. Apply supabase/migrations/20261014101437_quote_payment_journey.sql
--    using Supabase's migration mechanism. Its isolated transaction tests pass.
-- 2. Enable the existing, verified shop account for staff payment controls:
UPDATE auth.users
SET raw_app_meta_data = COALESCE(raw_app_meta_data, '{}'::jsonb)
    || '{"role":"owner"}'::jsonb
WHERE id = '83b42626-814a-4ccb-8f31-4e66e2efbce2'
  AND email = 'nfdrepairs@gmail.com';

-- 3. After the migration, prepare recovery using the existing authenticated
--    HTTP scheduler. Reuse its credential inside Postgres without exporting it.
--    Stop if the known source definition has changed.
DO $rollout$
DECLARE definition text;
BEGIN
  definition := pg_get_functiondef('public.auto_parts_ordered_cron()'::regprocedure);
  IF position('https://nfd-repairs-app.vercel.app/api/jobs/auto-parts-ordered' in definition) = 0
  THEN RAISE EXCEPTION 'Existing scheduler definition changed; review required';
  END IF;
  EXECUTE replace(
    replace(definition, 'public.auto_parts_ordered_cron()', 'public.reconcile_repair_payments_cron()'),
    'https://nfd-repairs-app.vercel.app/api/jobs/auto-parts-ordered',
    'https://nfd-repairs-app.vercel.app/api/payments/reconcile'
  );
END
$rollout$;
-- No public/ordinary-client execution of this credential-bearing function.
REVOKE ALL ON FUNCTION public.reconcile_repair_payments_cron()
FROM PUBLIC, anon, authenticated;
ALTER FUNCTION public.reconcile_repair_payments_cron()
SET search_path TO pg_catalog, extensions;

-- Prepare the schedule, but leave it inactive during coordinated deployment.
SELECT cron.schedule(
  'nfdr-reconcile-payments',
  '*/10 * * * *',
  'SELECT public.reconcile_repair_payments_cron();'
);
UPDATE cron.job SET active = false WHERE jobname = 'nfdr-reconcile-payments';

-- 4. Deploy the coordinated app and website, then verify:
--    schema/function privileges, preserved deposits, authenticated staff APIs,
--    signed-link quote pages, paid/blocked balances and public customer assets.
--    Do not create live purchases or send test customer messages.
-- 5. Only after deployment checks succeed, activate the scheduler:
-- SELECT cron.alter_job(jobid, active := true)
-- FROM cron.job WHERE jobname = 'nfdr-reconcile-payments';
