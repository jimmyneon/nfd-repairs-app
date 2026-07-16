# Review SMS System Fixes

## Issues Identified and Fixed

### 1. **SMS Template Issues** ✅ FIXED
**Problem:**
- Template included warranty form links that don't work
- Template had emojis and unnecessary warranty language
- Message was too long and confusing

**Solution:**
- Removed all warranty form links and warranty language
- Simplified message to focus on two things:
  1. "If you have problems, reply to this message"
  2. "Otherwise, please leave a 5-star review"
- Clean, professional tone without emojis

**New Template:**
```
Hi {FirstName}, thanks for choosing New Forest Device Repairs.

If you have any problems at all, just reply to this message and we'll sort it out.

Alternatively, we'd really appreciate a quick 5-star review - it helps other local customers find us:

{GoogleReviewLink}

Thanks for supporting a local business!
```

### 2. **Time Guardrails** ✅ FIXED
**Problem:**
- SMS could be sent at inappropriate times (too early/too late)
- No restrictions on when messages are scheduled or sent

**Solution:**
- **Scheduling:** When a job is marked as COLLECTED, the scheduled time is automatically adjusted to fall within 8am-8pm
- **Sending:** Cron job checks current time and only sends between 8am-8pm
- If cron runs outside these hours, it skips sending and waits for next run
- Any scheduled times outside 8am-8pm are automatically moved to next available window

**Files Modified:**
- `app/api/jobs/schedule-collection-sms/route.ts` - Added guardrails to scheduling logic
- `app/api/jobs/send-collection-sms/route.ts` - Added time check before sending

### 3. **Duplicate Sending** ✅ FIXED
**Problem:**
- Same customer could receive multiple SMS if they had multiple jobs
- MacroDroid can't handle simultaneous sends
- No deduplication logic

**Solution:**
- **Deduplication:** Cron job now groups by phone number and only sends one SMS per customer
- **Tracking:** Duplicate jobs are marked as `SKIPPED_DUPLICATE` to prevent retry loops
- **Logging:** Clear logs show which jobs were skipped and why

**Files Modified:**
- `app/api/jobs/send-collection-sms/route.ts` - Added deduplication logic

### 4. **MacroDroid Rate Limiting** ✅ FIXED
**Problem:**
- MacroDroid can't send multiple SMS at the same time
- Needs at least 30 seconds between messages

**Solution:**
- **Sequential Sending:** Messages are sent one at a time
- **30-Second Delay:** Automatic 30-second wait between each SMS
- **Progress Logging:** Clear console logs showing progress (e.g., "Sending SMS 2/5...")

**Files Modified:**
- `app/api/jobs/send-collection-sms/route.ts` - Added delay function and sequential processing

## Files Changed

### Modified Files
1. **`app/api/jobs/send-collection-sms/route.ts`**
   - Updated SMS template (removed warranty links)
   - Added time guardrails (8am-8pm check)
   - Added deduplication by phone number
   - Added 30-second delay between sends
   - Added helper functions: `isWithinAllowedHours()`, `getNextAllowedSendTime()`, `delay()`

2. **`app/api/jobs/schedule-collection-sms/route.ts`**
   - Added time guardrails to scheduling logic
   - Ensures scheduled times fall within 8am-8pm
   - Automatically adjusts times outside allowed window

### New Files
1. **`supabase/fix-review-sms-system.sql`**
   - Comprehensive script to fix existing scheduled messages
   - Moves scheduled times outside 8am-8pm to next available window
   - Removes duplicates (keeps earliest scheduled)
   - Verification queries to confirm fixes

2. **`docs/REVIEW_SMS_FIXES.md`** (this file)
   - Complete documentation of all fixes

## How to Apply Fixes

### Step 1: Run the SQL Fix Script
```sql
-- Run this in Supabase SQL Editor
-- File: supabase/fix-review-sms-system.sql
```

This will:
- Move any scheduled SMS outside 8am-8pm to appropriate times
- Remove duplicate scheduled SMS (keeping earliest)
- Verify all fixes were applied correctly

### Step 2: Deploy Code Changes
The code changes are already in place. Next deployment will include:
- New SMS template (no warranty links)
- Time guardrails
- Deduplication
- 30-second delays

### Step 3: Monitor
After deployment, monitor the cron job logs to verify:
- SMS only send between 8am-8pm
- No duplicates are sent
- 30-second delays are working
- New template is being used

## Testing

### Test Time Guardrails
1. Check cron job logs during off-hours (before 8am or after 8pm)
2. Should see: "Outside allowed sending hours (8am-8pm), skipping SMS send"

### Test Deduplication
1. Create two jobs for same customer
2. Mark both as COLLECTED
3. Only one SMS should be scheduled/sent
4. Second job should show `SKIPPED_DUPLICATE` status

### Test 30-Second Delays
1. Have multiple SMS scheduled
2. Check cron job logs
3. Should see: "Waiting 30 seconds before next SMS..." between each send

### Verify Template
1. Check recent sent SMS in database
2. Should NOT contain warranty links
3. Should have simplified message format

## SQL Queries for Monitoring

### Check Scheduled SMS
```sql
SELECT 
    job_ref,
    customer_name,
    post_collection_sms_scheduled_at,
    EXTRACT(HOUR FROM post_collection_sms_scheduled_at) as hour,
    CASE 
        WHEN EXTRACT(HOUR FROM post_collection_sms_scheduled_at) < 8 THEN '⚠ TOO EARLY'
        WHEN EXTRACT(HOUR FROM post_collection_sms_scheduled_at) >= 20 THEN '⚠ TOO LATE'
        ELSE '✓ OK'
    END as time_check
FROM jobs
WHERE post_collection_sms_scheduled_at IS NOT NULL
    AND post_collection_sms_sent_at IS NULL
ORDER BY post_collection_sms_scheduled_at;
```

### Check for Duplicates
```sql
SELECT 
    customer_phone,
    COUNT(*) as count,
    STRING_AGG(job_ref, ', ') as jobs
FROM jobs
WHERE post_collection_sms_scheduled_at IS NOT NULL
    AND post_collection_sms_sent_at IS NULL
GROUP BY customer_phone
HAVING COUNT(*) > 1;
```

### Check Recent Sent SMS
```sql
SELECT 
    job_ref,
    customer_name,
    post_collection_sms_sent_at,
    post_collection_sms_delivery_status,
    LEFT(post_collection_sms_body, 100) as preview
FROM jobs
WHERE post_collection_sms_sent_at > NOW() - INTERVAL '24 hours'
ORDER BY post_collection_sms_sent_at DESC;
```

## Summary

All issues have been addressed:

✅ **Template Fixed** - No warranty links, simplified message  
✅ **Time Guardrails** - Only sends 8am-8pm  
✅ **No Duplicates** - Deduplication by phone number  
✅ **Rate Limiting** - 30-second delays between messages  
✅ **Proper Logging** - Clear visibility into what's happening  

The system is now production-ready and will handle review SMS properly.
