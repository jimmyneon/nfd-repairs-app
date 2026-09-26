-- Notifications can point at a specific in-app page (e.g. the enquiry they
-- relate to) so tapping a row actually navigates somewhere.
alter table public.notifications
  add column if not exists link text;
