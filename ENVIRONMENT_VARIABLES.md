# Environment Variables Setup

## Required Environment Variables

Add these to **Vercel** → **Settings** → **Environment Variables**

### Core Supabase (Required)
```
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

### SMS Integration (Required for SMS features)
```
MACRODROID_WEBHOOK_URL=https://trigger.macrodroid.com/your-webhook-id/send-sms
```

### Email Integration (Optional - for email notifications)
```
RESEND_API_KEY=re_your_resend_api_key
```
**Note:** If not configured, email features will be disabled but app will still build and run.

### Cron Job Security (Required for automated SMS)
```
CRON_SECRET=your-random-secret-here
```
Generate with: `openssl rand -hex 32`

### Payment Integration (Stripe)
```
STRIPE_SECRET_KEY=sk_live_...            # or sk_test_... for testing
STRIPE_WEBHOOK_SECRET=whsec_...          # from Stripe Dashboard → Webhooks
NEXT_PUBLIC_SITE_URL=https://newforestdevicerepairs.co.uk
```
- `STRIPE_SECRET_KEY` — already required for remote-support checkout; now also powers
  `/api/payments/checkout` (deposits, balances, enquiry payments, repair-fund top-ups).
- `STRIPE_WEBHOOK_SECRET` — required for `/api/webhooks/stripe`. In the Stripe
  Dashboard add an endpoint for `https://nfd-repairs-app.vercel.app/api/webhooks/stripe`
  listening to: `checkout.session.completed`, `checkout.session.expired`,
  `payment_intent.payment_failed`, `charge.refunded`.
- `NEXT_PUBLIC_SITE_URL` — base for customer pay links sent by SMS
  (`{SITE_URL}/pay/?t=...`). Defaults to newforestdevicerepairs.co.uk.
- Klarna: enable in Stripe Dashboard → Settings → Payment methods. It appears at
  checkout automatically on eligible amounts (card-only below Klarna's minimum).

Deprecated: `NEXT_PUBLIC_DEPOSIT_URL` (SumUp) is no longer used — deposit SMS links
now point at the per-job `/pay/` page which creates Stripe Checkout on demand.

---

## Vercel Cron Jobs

**Free Tier:** 2 cron jobs included  
**Pro Tier:** Unlimited cron jobs

### Current Cron Jobs Configured:

1. **Post-Collection SMS Sender**
   - Path: `/api/jobs/send-collection-sms`
   - Schedule: Every 15 minutes (`*/15 * * * *`)
   - Purpose: Sends scheduled review request SMS

---

## How to Add Environment Variables

1. Go to **Vercel Dashboard**
2. Select your project
3. Go to **Settings** → **Environment Variables**
4. Add each variable:
   - **Key:** Variable name (e.g., `RESEND_API_KEY`)
   - **Value:** Your actual value
   - **Environment:** Select all (Production, Preview, Development)
5. Click **Save**
6. **Redeploy** your app for changes to take effect

---

## Current Build Error Fix

The build error about missing `RESEND_API_KEY` has been fixed:
- Email service now has fallback for builds
- Runtime check prevents errors if not configured
- Email features gracefully disabled if API key missing

You can either:
1. **Add RESEND_API_KEY** to enable email features, OR
2. **Leave it unset** - app will work fine without email notifications

---

## Checking Your Configuration

After adding environment variables, verify in Vercel logs:
```
✓ NEXT_PUBLIC_SUPABASE_URL: configured
✓ SUPABASE_SERVICE_ROLE_KEY: configured
✓ MACRODROID_WEBHOOK_URL: configured
✓ CRON_SECRET: configured
⚠ RESEND_API_KEY: not configured (email disabled)
```
