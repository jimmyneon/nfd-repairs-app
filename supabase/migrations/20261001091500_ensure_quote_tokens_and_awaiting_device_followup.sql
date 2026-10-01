-- Ensure secure quote-action links are backed by database columns and add
-- one-off awaiting-device follow-up tracking.
-- Safe to run more than once.

create extension if not exists pgcrypto;

alter table public.jobs
  add column if not exists quote_action_token text,
  add column if not exists quote_action_token_expires_at timestamptz,
  add column if not exists quote_action_token_revoked_at timestamptz,
  add column if not exists awaiting_device_followup_at timestamptz;

alter table public.enquiries
  add column if not exists quote_action_token text,
  add column if not exists quote_action_token_expires_at timestamptz,
  add column if not exists quote_action_token_revoked_at timestamptz;

create index if not exists idx_jobs_quote_action_token
  on public.jobs (quote_action_token)
  where quote_action_token is not null;

create index if not exists idx_enquiries_quote_action_token
  on public.enquiries (quote_action_token)
  where quote_action_token is not null;

create index if not exists idx_jobs_awaiting_device_followup
  on public.jobs (status, device_in_shop, awaiting_device_followup_at)
  where status in ('AWAITING_DEVICE','QUOTE_APPROVED','PARTS_ARRIVED');

update public.jobs
set quote_action_token = encode(gen_random_bytes(32), 'hex')
where quote_action_token is null;

update public.enquiries
set quote_action_token = encode(gen_random_bytes(32), 'hex')
where quote_action_token is null;

update public.jobs
set quote_action_token_expires_at = now() + interval '60 days'
where quote_action_token is not null
  and quote_action_token_expires_at is null;

update public.enquiries
set quote_action_token_expires_at = now() + interval '60 days'
where quote_action_token is not null
  and quote_action_token_expires_at is null;

alter table public.jobs
  alter column quote_action_token set default encode(gen_random_bytes(32), 'hex');

alter table public.enquiries
  alter column quote_action_token set default encode(gen_random_bytes(32), 'hex');

comment on column public.jobs.awaiting_device_followup_at is
  'Timestamp when the one-off waiting-for-device service follow-up was attempted.';
