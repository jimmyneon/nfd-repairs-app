# Push Notifications Not Working - Diagnosis & Fix

## Problem
Push notifications are not being sent when new jobs are created or status changes occur.

## Root Cause Analysis

### What's Working ✅
1. **RLS Policies are correct**
   - `notifications` table: Staff can view, insert, and update
   - `push_subscriptions` table: Staff can manage all operations
   - Both use `TO authenticated` with `USING (true)`

2. **Notification creation is working**
   - Notifications are being inserted into the database
   - Job creation API (`/api/jobs/create-v3`) inserts notifications correctly
   - Realtime subscriptions are listening for new notifications

3. **Push notification infrastructure exists**
   - `/api/notifications/send-push` endpoint exists
   - `web-push` library is configured with VAPID keys
   - Service worker registration is implemented
   - `NotificationSetup` component handles permission requests

### What's NOT Working ❌
**Push notifications are never actually sent because:**

The notification INSERT does not trigger the push notification API call. The system creates database notifications but never calls `/api/notifications/send-push`.

## Current Flow (Broken)
```
1. Job created → Notification inserted into DB
2. Realtime subscription detects INSERT
3. UI updates unread count
4. ❌ NO PUSH NOTIFICATION SENT
```

## Expected Flow (Fixed)
```
1. Job created → Notification inserted into DB
2. Database trigger calls /api/notifications/send-push
3. Push API sends to all subscribed devices
4. Realtime subscription updates UI
```

## Solutions

### Option 1: Database Trigger (Recommended) ⭐
**File:** `supabase/fix-push-notification-trigger.sql`

Add a PostgreSQL trigger that automatically calls the push notification API when a notification is inserted.

**Pros:**
- Automatic - no code changes needed
- Reliable - happens at database level
- Works for all notification sources

**Cons:**
- Requires `pg_net` extension in Supabase
- Slightly more complex setup

### Option 2: API Route Enhancement
Modify job creation and status change APIs to explicitly call the push notification endpoint after creating a notification.

**Pros:**
- No database extensions needed
- More explicit control

**Cons:**
- Need to update multiple API routes
- Easy to forget in new features
- More code to maintain

### Option 3: Supabase Edge Function
Create a Supabase Edge Function that listens to database changes and sends push notifications.

**Pros:**
- Serverless
- Scales automatically

**Cons:**
- More complex deployment
- Additional Supabase configuration

## Recommended Fix

**Use Option 1 (Database Trigger)** because:
1. It's automatic and reliable
2. Works for all current and future notification sources
3. Centralized logic
4. No code changes needed in multiple places

## Implementation Steps

1. **Enable pg_net extension in Supabase:**
   ```sql
   CREATE EXTENSION IF NOT EXISTS pg_net;
   ```

2. **Run the trigger SQL:**
   ```sql
   -- See: supabase/fix-push-notification-trigger.sql
   ```

3. **Test:**
   - Create a new job
   - Check if push notification is received
   - Verify in browser DevTools → Application → Service Workers

## Alternative Quick Fix (If pg_net not available)

If `pg_net` extension is not available, modify the job creation API:

```typescript
// In /api/jobs/create-v3/route.ts
// After creating notification:
await supabase.from('notifications').insert({...})

// Add this:
await fetch(`${appUrl}/api/notifications/send-push`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    title: 'New repair job created',
    body: `${jobData.device_make} ${jobData.device_model} - ${jobData.issue}`,
    url: `${appUrl}/app/jobs/${job.id}`,
    jobId: job.id
  })
})
```

## Verification Checklist

After implementing the fix:
- [ ] VAPID keys are set in environment variables
- [ ] Service worker is registered (`/sw.js` exists)
- [ ] User has granted notification permission
- [ ] Push subscription is saved in database
- [ ] Trigger/API call is sending push notifications
- [ ] Browser receives and displays notifications

## Environment Variables Required

```env
VAPID_PUBLIC_KEY=your_public_key
VAPID_PRIVATE_KEY=your_private_key
```

Generate VAPID keys if needed:
```bash
npx web-push generate-vapid-keys
```
