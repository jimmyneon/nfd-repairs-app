alter table public.enquiries
  add column if not exists quote_followup_at timestamptz,
  add column if not exists quote_followup_suppressed boolean not null default false;

create index if not exists idx_enquiries_quote_followup
  on public.enquiries (status, created_at, quote_followup_at)
  where enquiry_type = 'repair_quote'
    and status = 'pending'
    and quote_followup_suppressed = false;

comment on column public.enquiries.quote_followup_at is
  'Timestamp when the one-off post-quote follow-up SMS was attempted.';

comment on column public.enquiries.quote_followup_suppressed is
  'True when this enquiry must never receive the automatic post-quote follow-up.';
