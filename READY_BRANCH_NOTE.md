# Production candidate contents

When rebuilding this feature on top of the latest `main`, carry only these files:

- `app/api/enquiries/plan-later/route.ts`
- `app/api/enquiries/send-plan-reminders/route.ts`
- `supabase/add-quote-reminders.sql`
- `supabase/setup-quote-reminder-cron.sql`
- `supabase/sync-quote-option-display.sql`
- `TEST_QUOTE_REMINDERS.md`

Do not carry the superseded generic £10 SumUp reservation experiment or the older duplicate follow-up notes.
