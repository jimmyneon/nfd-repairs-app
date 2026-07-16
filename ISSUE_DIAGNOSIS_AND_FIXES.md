# Issue Diagnosis & Fixes

## Issue 1: CSS Not Loading on Mobile 📱

### Problem
CSS not displaying on certain mobile devices - app appears broken/unstyled.

### Root Cause
This is likely a **Tailwind CSS production build issue** or **browser caching problem**.

### Immediate Fixes

#### Fix 1: Add Missing Environment Variable for Webhook
```bash
# Add to Vercel environment variables
AI_RESPONDER_WEBHOOK_SECRET=TDc4nQug0r09fQN6+kn0Imr8XXFY5J9fMslmGATaqQU=
```

#### Fix 2: Force Clean Rebuild
The CSS issue is likely due to a stale build cache. Force a clean rebuild:

1. **In Vercel Dashboard:**
   - Go to your project
   - Settings → General
   - Scroll to "Build & Development Settings"
   - Click "Redeploy" with "Use existing Build Cache" **UNCHECKED**

2. **Or via Git (recommended):**
   - Make a small change (add comment)
   - Commit and push
   - This will trigger fresh build

#### Fix 3: Verify Tailwind Configuration
The configuration looks correct, but ensure production optimization is working:

```typescript
// tailwind.config.ts - Already correct ✅
content: [
  './pages/**/*.{js,ts,jsx,tsx,mdx}',
  './components/**/*.{js,ts,jsx,tsx,mdx}',
  './app/**/*.{js,ts,jsx,tsx,mdx}',
]
```

### Testing Steps

1. **Clear mobile browser cache:**
   - Safari iOS: Settings → Safari → Clear History and Website Data
   - Chrome Android: Settings → Privacy → Clear browsing data

2. **Test in incognito/private mode:**
   - This bypasses cache completely

3. **Check browser console:**
   - Look for CSS loading errors
   - Check Network tab for failed CSS requests

4. **Test on multiple devices:**
   - iPhone Safari
   - Android Chrome
   - Desktop browsers

### If Issue Persists

Check these in browser DevTools:
- Network tab: Are CSS files loading? (look for `.css` files)
- Console: Any errors about stylesheets?
- Elements tab: Are Tailwind classes being applied?

---

## Issue 2: Quote Search Not Showing New Quotes 🔍

### Problem
Quote search was working but new quotes from AI Responder aren't appearing.

### Root Cause
**AI Responder is NOT sending quotes to the Repair App webhook.**

The integration requires the AI Responder team to implement webhook calls, which hasn't been done yet.

### Current Status

**Repair App (Your Side) - ✅ READY:**
- ✅ Webhook endpoint: `/api/quotes/sync`
- ✅ Quote search API: `/api/quotes/search`
- ✅ Database table: `quotes`
- ✅ UI component: `QuoteLookupModal`

**AI Responder (Their Side) - ❌ NOT IMPLEMENTED:**
- ❌ Webhook function not created
- ❌ Not calling webhook after quote creation
- ❌ Not calling webhook after quote updates
- ❌ Bulk sync script not run

### Why Old Quotes Might Work

If you see ANY quotes in the search, they were either:
1. Manually added to the database
2. Created via test API calls
3. From an old integration that's no longer working

### Immediate Action Required

**You need to contact the AI Responder development team** and ask them to:

1. **Implement the webhook integration** (see `MESSAGE_TO_AI_RESPONDER_TEAM.md`)
2. **Run the bulk sync script** to import existing quotes
3. **Test the integration** with the curl command below

### Testing the Webhook (Do This Now)

Run this command to test if the webhook works:

```bash
curl -X POST https://nfd-repairs-app.vercel.app/api/quotes/sync \
  -H "Content-Type: application/json" \
  -H "x-webhook-secret: TDc4nQug0r09fQN6+kn0Imr8XXFY5J9fMslmGATaqQU=" \
  -d '{
    "quote_request_id": "TEST-'$(date +%s)'",
    "customer_name": "Test Customer",
    "customer_phone": "+447410123456",
    "customer_email": "test@example.com",
    "device_make": "Apple",
    "device_model": "iPhone 14 Pro",
    "issue": "Screen Replacement",
    "quoted_price": 89.99,
    "status": "pending",
    "created_at": "'$(date -u +%Y-%m-%dT%H:%M:%SZ)'"
  }'
```

**Expected response:**
```json
{"success":true,"quote_id":"...","message":"Quote synced successfully"}
```

Then:
1. Go to Manual Job Creation
2. Click "Search Quotes"
3. Search for "Test Customer"
4. You should see the test quote

If this works, the webhook is fine - AI Responder just needs to call it.

### Verifying Database Access

Check if quotes table exists and is accessible:

```bash
# You can check in Supabase dashboard:
# 1. Go to Table Editor
# 2. Look for 'quotes' table
# 3. Check if any records exist
```

---

## Environment Variables Checklist

### Required in Vercel (Repair App):

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=<your-url>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<your-key>
SUPABASE_SERVICE_ROLE_KEY=<your-key>

# AI Responder Webhook (ADD THIS IF MISSING)
AI_RESPONDER_WEBHOOK_SECRET=TDc4nQug0r09fQN6+kn0Imr8XXFY5J9fMslmGATaqQU=

# SMS
MACRODROID_WEBHOOK_URL=<your-url>

# Email
RESEND_API_KEY=<your-key>

# App URL
NEXT_PUBLIC_APP_URL=https://nfd-repairs-app.vercel.app
```

### Required in Vercel (AI Responder App):

```bash
REPAIR_APP_WEBHOOK_URL=https://nfd-repairs-app.vercel.app/api/quotes/sync
REPAIR_APP_WEBHOOK_SECRET=TDc4nQug0r09fQN6+kn0Imr8XXFY5J9fMslmGATaqQU=
```

---

## Quick Fixes Summary

### For CSS Issue:
1. ✅ Clear mobile browser cache
2. ✅ Redeploy without build cache in Vercel
3. ✅ Test in incognito mode
4. ✅ Check browser console for errors

### For Quote Search Issue:
1. ✅ Add `AI_RESPONDER_WEBHOOK_SECRET` to Vercel env vars
2. ✅ Test webhook with curl command above
3. ✅ Contact AI Responder team to implement webhook
4. ✅ Verify quotes table in Supabase

---

## What to Tell AI Responder Team

"The quote search integration requires you to call our webhook when quotes are created or updated. The webhook endpoint and documentation are ready - see MESSAGE_TO_AI_RESPONDER_TEAM.md for implementation details. We need this implemented so technicians can search for quotes at the counter."

---

## Monitoring & Debugging

### Check Vercel Logs:
1. Go to Vercel Dashboard
2. Select your project
3. Click "Logs" tab
4. Filter by `/api/quotes/sync` to see webhook calls

### Check Supabase Logs:
1. Go to Supabase Dashboard
2. Click "Logs" in sidebar
3. Look for queries to `quotes` table

### Test Quote Search:
1. Open app → Manual Job Creation
2. Click "Search Quotes" button
3. Should show recent quotes (if any exist)
4. Search by name/phone should work

---

## Expected Timeline

**CSS Issue:** Should be fixed within 1 hour
- Clear cache + redeploy = 15 mins
- Testing = 15 mins
- Verification = 30 mins

**Quote Search:** Depends on AI Responder team
- If they implement webhook: 2-4 hours
- If they run bulk sync: +1 hour
- Testing: 30 mins

---

## Contact Points

**If CSS still broken after fixes:**
- Check specific device/browser
- Test on desktop first
- Look for JavaScript errors in console
- Verify Tailwind classes in HTML source

**If webhook test fails:**
- Check environment variable is set
- Verify Supabase connection
- Check quotes table permissions
- Review Vercel function logs
