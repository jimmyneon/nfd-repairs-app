-- Staff job deletion: RLS had no DELETE policies on jobs or the related
-- tables the tile removes first, so deletes silently affected zero rows.
create policy "Staff can delete jobs" on public.jobs for delete to authenticated using (true);
create policy "Staff can delete job events" on public.job_events for delete to authenticated using (true);
create policy "Staff can delete sms logs" on public.sms_logs for delete to authenticated using (true);
create policy "Staff can delete email logs" on public.email_logs for delete to authenticated using (true);
create policy "Staff can delete notifications" on public.notifications for delete to authenticated using (true);
