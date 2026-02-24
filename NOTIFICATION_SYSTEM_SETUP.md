# Notification System Setup Guide

## Overview

The repair app has a complete multi-channel notification system that sends SMS, Email, and Push notifications when job statuses change.

## System Components

### 1. **Database Tables**
- `notification_config` - Controls which channels (SMS/Email/Push) are enabled for each status
- `email_templates` - HTML email templates for each status
- `sms_templates` - SMS message templates
- `notifications` - In-app notification records
- `push_subscriptions` - Browser push notification subscriptions

### 2. **Notification Channels**
- **SMS** - Via MacroDroid webhook
- **Email** - Via Resend API with HTML templates
- **Push** - Browser push notifications using Web Push API

### 3. **Status Flow with Notifications**

```
RECEIVED → AWAITING_DEPOSIT → PARTS_ORDERED → PARTS_ARRIVED → READY_TO_BOOK_IN → IN_REPAIR → READY_TO_COLLECT → COMPLETED
```

Each status change can trigger:
- ✅ SMS notification
- ✅ Email notification
- ✅ Push notification
- ✅ In-app notification

## Setup Instructions

### Step 1: Initialize Database Tables

Run this SQL in Supabase SQL Editor:

```sql
-- See: /supabase/initialize-notification-system.sql
```

This creates:
- `notification_config` table with default settings
- `email_templates` table with HTML templates for all statuses
- RLS policies for authenticated users

### Step 2: Verify Tables Exist

Run this to check:

```sql
-- See: /supabase/check-notification-system.sql
```

You should see:
- 10 rows in `notification_config` (one for each status)
- 10 rows in `email_templates` (one for each status)

### Step 3: Configure Notification Channels

Go to `/app/settings/notifications` in the app to:
- Toggle SMS on/off for each status
- Toggle Email on/off for each status
- Enable/disable entire status notifications
- Subscribe to push notifications

## Status-Specific Messages

### PARTS_ARRIVED (New!)

When parts arrive, the system sends:

**Email:**
- Subject: "Parts Arrived - Please Drop Off: {job_ref}"
- Body: Includes Google Maps link to shop location
- Link: `https://maps.google.com/?q=New+Forest+Device+Repairs+Lyndhurst`

**SMS:**
- Message includes shop address and directions

**Push:**
- Browser notification with job details

## How It Works

### Automatic Flow

1. **Status Changed** → Job status updated in database
2. **Notification Created** → Record inserted into `notifications` table
3. **Database Trigger Fires** → `trigger_send_push_on_notification` executes
4. **Push API Called** → `/api/notifications/send-push` sends to all subscribed devices
5. **Email Sent** → `/api/email/send` sends HTML email if enabled
6. **SMS Queued** → `/api/jobs/queue-status-sms` sends SMS if enabled

### Manual Testing

**Test Push Notifications:**
1. Go to `/app/settings/notifications`
2. Click "Subscribe to Push Notifications"
3. Allow browser permission
4. Click "Send Test Notification"

**Test Email:**
1. Create a test job with customer email
2. Change status
3. Check email inbox

**Test SMS:**
1. Create a test job with customer phone
2. Change status
3. Check MacroDroid webhook logs

## Configuration Files

### Email Templates
Location: `email_templates` table in database

Variables available:
- `{job_ref}` - Job reference number
- `{device_make}` - Device manufacturer
- `{device_model}` - Device model
- `{tracking_link}` - Customer tracking URL
- `{deposit_link}` - Payment link (if deposit required)

### SMS Templates
Location: `sms_templates` table in database

Same variables as email templates.

### Notification Config
Location: `notification_config` table in database

Each status has:
- `send_sms` - Boolean (enable/disable SMS)
- `send_email` - Boolean (enable/disable Email)
- `is_active` - Boolean (enable/disable all notifications for this status)

## Environment Variables Required

```env
# Email (Resend)
RESEND_API_KEY=re_xxxxx

# SMS (MacroDroid)
MACRODROID_WEBHOOK_URL=https://trigger.macrodroid.com/xxxxx

# Push Notifications
NEXT_PUBLIC_VAPID_PUBLIC_KEY=BPxxxxx
VAPID_PRIVATE_KEY=xxxxx

# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyxxxxx
SUPABASE_SERVICE_ROLE_KEY=eyxxxxx

# Deposit Payment
NEXT_PUBLIC_DEPOSIT_URL=https://pay.sumup.com/b2c/xxxxx
```

## Troubleshooting

### Push Notifications Not Working

1. **Check subscription exists:**
   ```sql
   SELECT * FROM push_subscriptions;
   ```

2. **Check trigger is firing:**
   ```sql
   SELECT * FROM net._http_response ORDER BY created DESC LIMIT 10;
   ```

3. **Check API is using service role key:**
   - File: `/app/api/notifications/send-push/route.ts`
   - Should use `SUPABASE_SERVICE_ROLE_KEY` not anon key

### Emails Not Sending

1. **Check notification config:**
   ```sql
   SELECT * FROM notification_config WHERE status_key = 'PARTS_ARRIVED';
   ```
   Ensure `send_email = true` and `is_active = true`

2. **Check Resend API key is set in Vercel**

3. **Check job has customer email:**
   ```sql
   SELECT customer_email FROM jobs WHERE id = 'job-id';
   ```

### SMS Not Sending

1. **Check MacroDroid webhook URL is set**
2. **Check notification config has `send_sms = true`**
3. **Check SMS template exists for the status**

## API Endpoints

- `POST /api/email/send` - Send email notification
- `POST /api/jobs/queue-status-sms` - Queue SMS notification
- `POST /api/notifications/send-push` - Send push notification
- `POST /api/notifications/subscribe` - Save push subscription

## Database Queries

### Check Recent Notifications
```sql
SELECT * FROM notifications ORDER BY created_at DESC LIMIT 10;
```

### Check Push Notification Logs
```sql
SELECT * FROM net._http_response ORDER BY created DESC LIMIT 10;
```

### Check Email/SMS Config for Status
```sql
SELECT * FROM notification_config WHERE status_key = 'PARTS_ARRIVED';
```

### Update Notification Settings
```sql
UPDATE notification_config 
SET send_email = true, send_sms = true 
WHERE status_key = 'PARTS_ARRIVED';
```

## Next Steps

1. ✅ Run `/supabase/initialize-notification-system.sql` in Supabase
2. ✅ Verify environment variables in Vercel
3. ✅ Test push notifications in `/app/settings/notifications`
4. ✅ Create a test job and change status to verify all channels
5. ✅ Customize email templates in database if needed
6. ✅ Adjust notification config per status as needed
