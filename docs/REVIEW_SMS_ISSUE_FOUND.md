# Google Review SMS Issue - Diagnosis & Fix

## Issue Found
Date: March 31, 2026

### Problem
4 COLLECTED jobs are missing review SMS:
- NFD-20260330-001 (Lewis Wilson)
- NFD-20260330-003 (Graham Shields)  
- NFD-20260330-004 (Victoria Mortimer)
- NFD-20260327-002 (Rob Latimore)

### Root Cause
The `/api/jobs/schedule-collection-sms` endpoint was not automatically called when jobs were marked as COLLECTED. This means:

1. The status change to COLLECTED happened
2. But the automatic trigger to schedule review SMS didn't fire
3. Jobs have `post_collection_sms_scheduled_at = NULL`

### System Status
✅ Google review link configured: `https://g.page/r/CbcFSzUq4CoZEAE/review?hl=en-GB`
✅ All database columns exist
✅ Code is implemented correctly
❌ Automatic scheduling not triggering

### Possible Causes
1. **Status change not going through the API** - Jobs might be updated directly in database
2. **Missing trigger** - The queue-status-sms endpoint might not be calling schedule-collection-sms
3. **Cron job not set up** - No automated process to send scheduled SMS

## Fix Options

### Option 1: Manual Schedule (Immediate)
Run the SQL in `manually-schedule-missing-reviews.sql` to schedule review SMS for existing COLLECTED jobs.

### Option 2: Check Status Change Flow
Verify that when a job status changes to COLLECTED, it calls:
1. `/api/jobs/queue-status-sms` 
2. Which should call `/api/jobs/schedule-collection-sms`

### Option 3: Set Up Cron Job
Create a cron job to automatically send scheduled review SMS:
- Check for jobs where `post_collection_sms_scheduled_at < NOW()` and `post_collection_sms_sent_at IS NULL`
- Call `/api/jobs/send-collection-sms` for each

## Next Steps
1. Run STEP 1 of `manually-schedule-missing-reviews.sql` to preview
2. Uncomment and run STEP 2 to schedule the missing review SMS
3. Set up a cron job or manual process to actually send the scheduled SMS
4. Fix the automatic trigger so future COLLECTED jobs get scheduled automatically
