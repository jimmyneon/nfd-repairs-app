# 🚨 CRITICAL: SMS Not Being Created - Deployment Checklist

## Problem
New jobs are being created with AWAITING_DEPOSIT status, but **NO SMS is being created in the database**.

## Root Cause Analysis
The API code at `/api/jobs/create-v3` tries to:
1. Look up SMS template by key (e.g., `DEPOSIT_REQUIRED`)
2. If template found → create SMS log in database
3. If template NOT found → **silently fails, no SMS created**

## ✅ Fixes Applied

### 1. Enhanced Logging
Added comprehensive logging to `/api/jobs/create-v3/route.ts`:
- 🔍 Shows which template key is being looked up
- ❌ Logs error if template not found
- ✅ Logs success when SMS log created
- 📤 Logs SMS send trigger response
- **Errors are now logged to `job_events` table**

### 2. SMS Templates SQL File
Created `/supabase/ensure-sms-templates.sql` with ALL required templates:
- `DEPOSIT_REQUIRED` - Parts needed, deposit required
- `RECEIVED` - Manual job entry
- `READY_TO_BOOK_IN` - Online submission, no parts
- `ONBOARDING_REQUIRED` - Missing customer info
- `ONBOARDING_WITH_DEPOSIT` - Missing info + deposit
- `READY_TO_COLLECT` - Repair complete
- `IN_REPAIR` - Repair in progress
- `PARTS_ORDERED` - Parts ordered

### 3. Manual Retry Button
Added "Send SMS Again" button to job detail page:
- Shows on FAILED or PENDING SMS
- Triggers `/api/sms/send` to retry
- Refreshes page after retry

## 🚀 DEPLOYMENT STEPS (CRITICAL)

### Step 1: Run SQL in Supabase
```sql
-- In Supabase SQL Editor, run this file:
-- /supabase/ensure-sms-templates.sql
```

This will create/update all SMS templates. **This is why SMS isn't working - templates don't exist!**

### Step 2: Deploy Code Changes
```bash
cd repair-app
git add .
git commit -m "Fix SMS creation with logging and templates"
git push
```

### Step 3: Test
1. Create a new job via API (with parts required)
2. Check Vercel logs for:
   - `🔍 Template key: DEPOSIT_REQUIRED`
   - `✅ Template found: DEPOSIT_REQUIRED`
   - `✅ SMS log created: [id]`
3. Check `sms_logs` table - should have new entry
4. Check `job_events` - should show any errors

### Step 4: If Still Failing
Check `job_events` table for error messages:
```sql
SELECT * FROM job_events 
WHERE type = 'ERROR' 
AND message LIKE '%SMS%'
ORDER BY created_at DESC;
```

## 📧 Email System Status

**Email system is working but needs templates:**
- ✅ API endpoint exists: `/api/email/send`
- ✅ Template generation exists: `generateEmbeddedJobEmail()`
- ✅ Notification config table exists
- ⚠️ Email templates table exists but may need more templates
- ✅ Checks `notification_config` to see if email enabled for status

**Email templates to verify in Supabase:**
- `JOB_CREATED`
- `STATUS_UPDATE`

## 🔔 Push Notification Status

**Push notifications need database trigger:**

### What Exists:
- ✅ Service worker (`/public/sw.js`)
- ✅ VAPID keys setup
- ✅ API endpoint: `/api/notifications/send-push`
- ✅ Subscription system working
- ✅ Test page: `/app/test-notifications`

### What's Missing:
❌ **Database trigger to auto-send push when notification created**

### To Fix:
Run in Supabase SQL Editor:
```sql
-- Enable pg_net extension
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Then run: /supabase/fix-push-notification-trigger.sql
```

This creates a trigger that automatically calls `/api/notifications/send-push` whenever a row is inserted into the `notifications` table.

## 🎯 Summary

**Why SMS not working:**
1. Templates don't exist in database
2. Code silently fails if template not found
3. No error logging (now fixed)

**Fixes:**
1. ✅ Added comprehensive logging
2. ✅ Created SQL file with all templates
3. ✅ Added manual retry button
4. ⚠️ **MUST RUN SQL FILE IN SUPABASE**

**Next steps:**
1. Run `ensure-sms-templates.sql` in Supabase
2. Deploy code
3. Test new job creation
4. Check logs for template lookup
5. Run push notification trigger SQL
