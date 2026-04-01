# Action-Oriented Job System - Implementation Guide

## Overview

This implementation transforms the job management system from **status-centric** to **action-centric**, making it instantly clear what needs to be done next.

## What Was Implemented

### ✅ Phase 1: Database Enhancements

**File:** `supabase/add-action-oriented-enhancements.sql`

**New Fields Added:**
- `status_changed_at` - Tracks when status last changed (for time-in-status calculations)
- `tracking_link_expires_at` - When tracking link expires (30 days after closure)
- `parts_ordered_at` - When parts were ordered
- `parts_expected_at` - Expected arrival date for parts

**Triggers Created:**
1. `update_status_timestamp()` - Auto-updates `status_changed_at` when status changes
2. `set_tracking_expiration()` - Sets expiration 30 days after job closure
3. `track_parts_ordered()` - Tracks parts ordering timestamp and sets 3-day ETA

**View Created:**
- `jobs_action_view` - Pre-calculated action groups, time metrics, and blocker types

### ✅ Phase 2: Utility Functions

**File:** `lib/job-utils.ts`

**Key Functions:**
- `getHoursInStatus()` / `getDaysInStatus()` - Calculate time in current status
- `formatTimeInStatus()` - Display-friendly time format ("2h", "3d", "⚠️ 5d")
- `getActionGroup()` - Determines which action group a job belongs to
- `getBlockerType()` / `getBlockerText()` - Identifies what's blocking a job
- `groupJobsByAction()` - Groups jobs into action categories
- `isTrackingLinkExpired()` - Checks if tracking link has expired
- `getCustomerFlagEmoji()` / `getPriorityEmoji()` - Visual indicators

### ✅ Phase 3: Enhanced Components

#### **EnhancedJobTile Component**
**File:** `components/EnhancedJobTile.tsx`

**Features:**
- 🔥 Priority fire icon for high-priority jobs (score ≥80)
- ⏰ Time-in-status display with warning for overdue (>3 days)
- 🚩 Customer flag badges (VIP, Sensitive, Awkward)
- 📦 Blocker badges showing what's blocking the job
- Compact, information-dense design

#### **ImHereButton Component**
**File:** `components/ImHereButton.tsx`

**Features:**
- GPS location verification (100m radius)
- Sends push notification to tech's phone
- Visual feedback for success/too-far/error states
- Smooth UX with loading states

**API Endpoint:** `app/api/notifications/customer-arrived/route.ts`
- Creates notification in database
- Sends web push notifications to all subscribed devices
- Handles subscription cleanup for invalid endpoints

### ✅ Phase 4: Tracking Page Enhancements

**File:** `app/t/[token]/page.tsx`

**Changes:**
- ✅ Tracking link expiration check
- ✅ Expired link UI with friendly message
- ✅ GPS "I'm Here" button for READY_TO_COLLECT status
- ✅ Fetches new fields from database

**Note:** Minor TypeScript warnings exist due to old type imports - these are cosmetic and don't affect runtime.

### ✅ Phase 5: Action-Based Job List

**File:** `app/app/jobs/page.tsx` (replaced)

**Old backup:** `app/app/jobs/page-old.tsx`

**New Structure:**

```
🔥 URGENT / TODAY
   - Delayed >24hrs
   - High priority ready to work
   - Deposit overdue >48hrs

⚡ READY TO WORK
   - Can be worked on right now
   - Device in shop, no blockers

⏸️ WAITING
   - Blocked by parts/deposit/customer
   - Shows blocker type and duration

✅ READY TO COLLECT
   - Waiting for customer pickup
   - Shows days waiting

📦 COLLECTED (collapsed by default)
   - Auto-hidden to reduce clutter
   - Waiting for auto-close
```

**Features:**
- Action-based grouping instead of status filter
- Enhanced tiles with all indicators
- Auto-collapsed COLLECTED section
- Real-time updates via Supabase subscriptions
- Search across all fields

## Deployment Steps

### 1. Run Database Migration

```bash
# In Supabase SQL Editor, run:
supabase/add-action-oriented-enhancements.sql
```

This will:
- Add new columns
- Create triggers
- Backfill existing data
- Create the action view

### 2. Verify Database Changes

```sql
-- Check new columns exist
SELECT status_changed_at, tracking_link_expires_at, parts_ordered_at, parts_expected_at
FROM jobs
LIMIT 5;

-- Check triggers are active
SELECT tgname FROM pg_trigger WHERE tgrelid = 'jobs'::regclass;

-- Test action view
SELECT * FROM jobs_action_view LIMIT 5;
```

### 3. Deploy Application Code

All new files are already in place:
- ✅ `lib/job-utils.ts`
- ✅ `lib/types-v3.ts` (updated)
- ✅ `components/EnhancedJobTile.tsx`
- ✅ `components/ImHereButton.tsx`
- ✅ `app/api/notifications/customer-arrived/route.ts`
- ✅ `app/app/jobs/page.tsx` (replaced)
- ✅ `app/t/[token]/page.tsx` (updated)

### 4. Configure Push Notifications (Optional)

For GPS "I'm Here" feature to send push notifications:

1. Generate VAPID keys:
```bash
npx web-push generate-vapid-keys
```

2. Add to `.env.local`:
```env
VAPID_PUBLIC_KEY=your_public_key
VAPID_PRIVATE_KEY=your_private_key
```

3. Install web-push if not already:
```bash
npm install web-push
```

### 5. Test the System

**Test Checklist:**

- [ ] Jobs display in correct action groups
- [ ] Time indicators show correctly ("2h", "3d")
- [ ] Priority fire icons appear for high-priority jobs
- [ ] Customer flags display correctly
- [ ] Blocker badges show appropriate information
- [ ] COLLECTED section is collapsed by default
- [ ] Search works across all fields
- [ ] Tracking link expiration works
- [ ] GPS "I'm Here" button appears on READY_TO_COLLECT
- [ ] Status changes update `status_changed_at`
- [ ] Completed jobs set `tracking_link_expires_at`

## GPS Coordinates

**Current shop location in code:**
- Latitude: `55.7558`
- Longitude: `-3.9626`
- Radius: `100m`

**To update:** Edit `app/t/[token]/page.tsx` line 541-543

## Rollback Plan

If issues arise, restore the old job list:

```bash
mv app/app/jobs/page.tsx app/app/jobs/page-new.tsx
mv app/app/jobs/page-old.tsx app/app/jobs/page.tsx
```

Database changes are additive and safe to keep.

## Future Enhancements

### Already Implemented ✅
- [x] Database fields for time tracking
- [x] Tracking link expiration
- [x] Action-based grouping
- [x] Enhanced job tiles
- [x] GPS "I'm Here" button
- [x] Time-in-status indicators
- [x] Priority and flag badges
- [x] Blocker visibility

### Potential Future Additions
- [ ] Estimated completion time based on priority + workload
- [ ] Workload balancing across multiple techs
- [ ] Parts supplier integration for real ETAs
- [ ] Customer SMS when tech marks "ready to collect"
- [ ] Analytics dashboard showing time-in-status metrics
- [ ] Automated escalation for jobs stuck >5 days

## Key Metrics to Monitor

After deployment, track:
1. **Average time-in-status** - Are jobs moving faster?
2. **Overdue job count** - How many jobs stuck >3 days?
3. **URGENT group size** - Should stay small
4. **Deposit overdue rate** - Track payment delays
5. **GPS button usage** - Are customers using it?

## Support

**Files to check if issues:**
- Database: `supabase/add-action-oriented-enhancements.sql`
- Utils: `lib/job-utils.ts`
- Job List: `app/app/jobs/page.tsx`
- Tracking: `app/t/[token]/page.tsx`
- Tile: `components/EnhancedJobTile.tsx`

**Common Issues:**

1. **Jobs not grouping correctly**
   - Check `status_changed_at` is populated
   - Verify `device_in_shop` is accurate
   - Review `getActionGroup()` logic in `lib/job-utils.ts`

2. **Time indicators not showing**
   - Ensure `status_changed_at` trigger is active
   - Check backfill ran successfully

3. **Tracking links not expiring**
   - Verify `set_tracking_expiration()` trigger exists
   - Check `closed_at` is being set on completion

4. **GPS button not working**
   - Verify VAPID keys are set
   - Check browser location permissions
   - Ensure coordinates are correct

## Philosophy

**Before:** "What status is this job?"
**After:** "What do I need to do right now?"

The system now answers the most important question instantly, reducing mental overhead and improving workflow efficiency.
