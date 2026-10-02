alter table public.enquiries
  add column if not exists quote_sent_at timestamptz,
  add column if not exists quote_followup_reply_at timestamptz;

create index if not exists idx_enquiries_quote_sent_followup
  on public.enquiries (quote_sent_at, quote_followup_at)
  where enquiry_type = 'repair_quote'
    and quote_followup_suppressed = false;

comment on column public.enquiries.quote_sent_at is
  'Timestamp when the current priced repair quote was successfully delivered by SMS or email.';

comment on column public.enquiries.quote_followup_reply_at is
  'Timestamp of the first inbound customer SMS after the one-off quote follow-up was sent.';
