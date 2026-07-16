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

### Payment Integration (Optional)
```
NEXT_PUBLIC_DEPOSIT_URL=https://pay.sumup.com/b2c/YOUR_LINK
```

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
