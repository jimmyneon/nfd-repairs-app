-- ============================================================================
-- Security hardening: enable RLS on every public-schema table, revoke anon
-- access, restrict authenticated access to staff, and add
-- cryptographically-random quote-action tokens.
--
-- HOW THE PROTECTION WORKS (important — policies are ADDITIVE, never
-- subtractive):
--
--   * A `USING (false)` policy does NOT deny anything on its own and does
--     NOT override a permissive policy — all permissive policies are ORed.
--     This migration therefore does NOT create `USING (false)` policies.
--   * The actual protections are:
--       1. REVOKE ALL ON <table> FROM anon — removes the table-level
--          privilege entirely; PostgREST then treats the table as not
--          visible to the anon role at all (PGRST205).
--       2. ENABLE ROW LEVEL SECURITY — with no permissive policy, zero
--          rows are visible even if a grant were re-added later.
--       3. Dropping every existing permissive anon/public policy.
--   * Authenticated access is restricted to staff via public.is_staff(),
--     which checks the caller's email against public.staff_allowlist.
--     Public signup is disabled and every existing auth user is staff, so
--     the allowlist is seeded from auth.users. If customer auth accounts
--     are ever introduced, they will NOT pass is_staff().
--   * service_role bypasses RLS entirely; API routes keep working.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. quote_action_token columns + expiry + revocation
-- ---------------------------------------------------------------------------
-- gen_random_bytes lives in pgcrypto (installed as `extensions` on Supabase).
CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS quote_action_token TEXT,
  ADD COLUMN IF NOT EXISTS quote_action_token_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS quote_action_token_revoked_at TIMESTAMPTZ;

ALTER TABLE enquiries
  ADD COLUMN IF NOT EXISTS quote_action_token TEXT,
  ADD COLUMN IF NOT EXISTS quote_action_token_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS quote_action_token_revoked_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_jobs_quote_action_token
  ON jobs (quote_action_token) WHERE quote_action_token IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_enquiries_quote_action_token
  ON enquiries (quote_action_token) WHERE quote_action_token IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 2. Backfill tokens for existing rows (64-char hex random, 256-bit).
--    Rows without a token are NOT publicly accessible (the API routes
--    reject them), so every existing row gets one. Idempotent.
-- ---------------------------------------------------------------------------
UPDATE jobs
  SET quote_action_token = encode(gen_random_bytes(32), 'hex')
  WHERE quote_action_token IS NULL;

UPDATE enquiries
  SET quote_action_token = encode(gen_random_bytes(32), 'hex')
  WHERE quote_action_token IS NULL;

-- Backfill expiry: 60 days. A token with NULL expiry is treated as
-- invalid by the app (isQuoteActionTokenValid returns false), so expiry
-- must always be set for issued tokens.
UPDATE jobs
  SET quote_action_token_expires_at = NOW() + INTERVAL '60 days'
  WHERE quote_action_token IS NOT NULL AND quote_action_token_expires_at IS NULL;

UPDATE enquiries
  SET quote_action_token_expires_at = NOW() + INTERVAL '60 days'
  WHERE quote_action_token IS NOT NULL AND quote_action_token_expires_at IS NULL;

-- Every NEW row gets a token automatically so a row can never be created
-- without one (NULL-token rows are denied by the API anyway — fail closed).
ALTER TABLE jobs
  ALTER COLUMN quote_action_token SET DEFAULT encode(gen_random_bytes(32), 'hex');
ALTER TABLE enquiries
  ALTER COLUMN quote_action_token SET DEFAULT encode(gen_random_bytes(32), 'hex');

COMMENT ON COLUMN jobs.quote_action_token IS 'Long random token authorising public quote view/approve/reject (NOT the guessable job_ref)';
COMMENT ON COLUMN enquiries.quote_action_token IS 'Long random token authorising public quote view/approve/reject (NOT the guessable enquiry_ref)';

-- ---------------------------------------------------------------------------
-- 3. staff_allowlist + is_staff() — staff-only access for the
--    `authenticated` role. Seeded from existing auth.users because public
--    signup is disabled, so every current account is staff.
--    To add a new staff member later:
--      INSERT INTO public.staff_allowlist (email) VALUES ('new@staff.com');
--    To remove access: delete their row (and their auth account).
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- 4. Enable RLS on every existing public table (skips missing ones so the
--    migration is safe to run against this project).
-- ---------------------------------------------------------------------------
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'jobs','enquiries','password_requests','quotes','job_events',
    'notifications','sms_logs','email_logs','tracking_page_views',
    'rate_limits','send_in_requests','push_subscriptions','nf_hub_devices',
    'quote_analytics_events','missed_call_log','admin_settings',
    'warranty_tickets','warranty_ticket_events','sms_templates',
    'email_templates','notification_config','magic_links','inbound_dedup',
    'repairs','repair_updates','issues','customers','staff_allowlist'
  ]
  LOOP
    IF to_regclass('public.' || t) IS NOT NULL
       AND (SELECT relkind FROM pg_class WHERE oid = to_regclass('public.' || t)) IN ('r','p') THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    END IF;
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 5. Drop EVERY existing policy on each protected table (known names and
--    unknown legacy ones alike), then create only the staff policies.
--    Policies are additive/ORed, so leaving a permissive one in place
--    would defeat the new restrictions.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  pol record;
  tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'jobs','enquiries','password_requests','quotes','job_events',
    'notifications','sms_logs','email_logs','tracking_page_views',
    'rate_limits','send_in_requests','push_subscriptions','nf_hub_devices',
    'quote_analytics_events','missed_call_log','admin_settings',
    'warranty_tickets','warranty_ticket_events','sms_templates',
    'email_templates','notification_config','magic_links','inbound_dedup',
    'repairs','repair_updates','issues','customers','staff_allowlist'
  ]
  LOOP
    IF to_regclass('public.' || tbl) IS NOT NULL THEN
      FOR pol IN
        SELECT policyname FROM pg_policies
        WHERE schemaname = 'public' AND tablename = tbl
      LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol.policyname, tbl);
      END LOOP;
    END IF;
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 6. Staff-only policies for the `authenticated` role.
--    is_staff() checks the JWT email against staff_allowlist — a signed-in
--    non-staff user gets zero rows. No policies are created for `anon`, so
--    the anon role gets nothing even if a grant were mistakenly re-added.
-- ---------------------------------------------------------------------------
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
      EXECUTE format(
        'CREATE POLICY "staff_all_%s" ON public.%I FOR ALL TO authenticated USING (public.is_staff()) WITH CHECK (public.is_staff())',
        t, t
      );
    END IF;
  END LOOP;
END $$;

-- rate_limits is written only by service-role API routes; authenticated
-- staff do not need direct access, so no authenticated policy is created.

-- ---------------------------------------------------------------------------
-- 7. conversation_messages is a VIEW — RLS/policies do not apply to views.
--    Set security_invoker so the underlying tables' RLS is evaluated as the
--    caller, and control access with grants: anon gets nothing,
--    authenticated reaches the view but sees only what the underlying
--    staff-only policies allow.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.conversation_messages') IS NOT NULL
     AND (SELECT relkind FROM pg_class WHERE oid = to_regclass('public.conversation_messages')) = 'v' THEN
    EXECUTE 'ALTER VIEW public.conversation_messages SET (security_invoker = on)';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 8. Revoke ALL privileges from anon on every protected table/view.
--    This is the primary protection: without a table-level grant the anon
--    role cannot reach the object at all, and PostgREST reports it as
--    absent (PGRST205) rather than returning empty result sets.
-- ---------------------------------------------------------------------------
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'jobs','enquiries','password_requests','quotes','job_events',
    'notifications','sms_logs','email_logs','tracking_page_views',
    'rate_limits','send_in_requests','push_subscriptions','nf_hub_devices',
    'quote_analytics_events','missed_call_log','admin_settings',
    'warranty_tickets','warranty_ticket_events','sms_templates',
    'email_templates','notification_config','magic_links','inbound_dedup',
    'repairs','repair_updates','issues','customers','conversation_messages',
    'staff_allowlist'
  ]
  LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);
    END IF;
  END LOOP;
END $$;

-- Also revoke any blanket PUBLIC grants that would reach every role.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'jobs','enquiries','password_requests','quotes','job_events',
    'notifications','sms_logs','email_logs','tracking_page_views',
    'rate_limits','send_in_requests','push_subscriptions','nf_hub_devices',
    'quote_analytics_events','missed_call_log','admin_settings',
    'warranty_tickets','warranty_ticket_events','sms_templates',
    'email_templates','notification_config','magic_links','inbound_dedup',
    'repairs','repair_updates','issues','customers','conversation_messages',
    'staff_allowlist'
  ]
  LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC', t);
    END IF;
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 9. Re-grant table privileges to the roles that need them.
--    service_role bypasses RLS and needs full DML for API routes.
--    authenticated needs table-level privileges; RLS + is_staff() decide
--    which rows (none for non-staff).
-- ---------------------------------------------------------------------------
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'jobs','enquiries','password_requests','quotes','job_events',
    'notifications','sms_logs','email_logs','tracking_page_views',
    'rate_limits','send_in_requests','push_subscriptions','nf_hub_devices',
    'quote_analytics_events','missed_call_log','admin_settings',
    'warranty_tickets','warranty_ticket_events','sms_templates',
    'email_templates','notification_config','magic_links','inbound_dedup',
    'repairs','repair_updates','issues','customers','conversation_messages',
    'staff_allowlist'
  ]
  LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
    END IF;
  END LOOP;
END $$;

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
    'repairs','repair_updates','issues','customers','conversation_messages'
  ]
  LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
    END IF;
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 9b. Default privileges: new tables created later must not silently grant
--     access to anon. (Applies to objects created by the migration role;
--     objects created by other roles still need their own review.)
-- ---------------------------------------------------------------------------
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO service_role;
