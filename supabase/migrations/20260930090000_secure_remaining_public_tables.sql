-- Secure remaining public tables flagged by the Supabase security advisor.
-- Public customer flows use server-side service-role API routes, so anon does
-- not need direct table access. Signed-in repair-app staff retain full access.

ALTER TABLE public.warranty_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.warranty_ticket_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.temp_phone ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tracking_page_views ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.missed_call_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff can manage warranty tickets" ON public.warranty_tickets;
CREATE POLICY "Staff can manage warranty tickets"
  ON public.warranty_tickets
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "Staff can manage warranty ticket events" ON public.warranty_ticket_events;
CREATE POLICY "Staff can manage warranty ticket events"
  ON public.warranty_ticket_events
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "Staff can manage admin settings" ON public.admin_settings;
CREATE POLICY "Staff can manage admin settings"
  ON public.admin_settings
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "Staff can manage temp phone" ON public.temp_phone;
CREATE POLICY "Staff can manage temp phone"
  ON public.temp_phone
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "Staff can manage tracking page views" ON public.tracking_page_views;
CREATE POLICY "Staff can manage tracking page views"
  ON public.tracking_page_views
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "Staff can manage missed call log" ON public.missed_call_log;
CREATE POLICY "Staff can manage missed call log"
  ON public.missed_call_log
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);
