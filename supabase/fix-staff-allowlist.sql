-- Repair: the Sep-16 RLS migration was partially applied.
-- staff_allowlist, is_staff() and the staff_all_* policies never landed,
-- which makes /api/jobs/diagnostic-reports return 403 for staff.
-- Safe to run more than once.

-- 1. staff_allowlist seeded from existing auth users (public signup is off).
CREATE TABLE IF NOT EXISTS public.staff_allowlist (
  email TEXT PRIMARY KEY,
  added_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.staff_allowlist ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.staff_allowlist FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.staff_allowlist TO service_role;

INSERT INTO public.staff_allowlist (email)
  SELECT lower(email) FROM auth.users WHERE email IS NOT NULL
  ON CONFLICT (email) DO NOTHING;

-- 2. is_staff() — checks the caller's JWT email against the allowlist.
CREATE OR REPLACE FUNCTION public.is_staff()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.staff_allowlist
    WHERE email = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

REVOKE ALL ON FUNCTION public.is_staff() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_staff() TO authenticated, service_role;

-- 3. Staff-only table access for the authenticated role (skips missing tables).
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'jobs','enquiries','password_requests','quotes','job_events',
    'notifications','sms_logs','email_logs','tracking_page_views',
    'send_in_requests','push_subscriptions','nf_hub_devices',
    'quote_analytics_events','missed_call_log','admin_settings',
    'warranty_tickets','warranty_ticket_events','sms_templates',
    'email_templates','notification_config','magic_links','inbound_dedup',
    'repairs','repair_updates','issues','customers'
  ]
  LOOP
    IF to_regclass('public.' || t) IS NOT NULL
       AND (SELECT relkind FROM pg_class WHERE oid = to_regclass('public.' || t)) IN ('r','p') THEN
      EXECUTE format('DROP POLICY IF EXISTS "staff_all_%s" ON public.%I', t, t);
      EXECUTE format(
        'CREATE POLICY "staff_all_%s" ON public.%I FOR ALL TO authenticated USING (public.is_staff()) WITH CHECK (public.is_staff())',
        t, t
      );
    END IF;
  END LOOP;
END $$;
