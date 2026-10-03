-- Atomic dedup for missed-call SMS: MacroDroid's missed-call event and
-- AI Desk's initial-SMS call can hit /api/macrodroid/missed-call within a
-- second of each other for the SAME call. The previous check-then-mark flow
-- raced (both pass "sent recently?" before either marks sent), producing
-- duplicate texts. A primary key conflict makes only one claim win.
create table if not exists public.missed_call_sms_claims (
  phone text not null,
  -- 30-minute window bucket (epoch seconds truncated to 1800s)
  bucket bigint not null,
  created_at timestamptz not null default now(),
  primary key (phone, bucket)
);

alter table public.missed_call_sms_claims enable row level security;
-- Service role bypasses RLS; no client access needed.
