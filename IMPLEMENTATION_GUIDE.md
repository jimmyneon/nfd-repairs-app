# Repair App Enhancements - Implementation Guide

## Overview

This guide covers the implementation of several major enhancements to the repair app:

1. **Auto-close jobs** 3 days after collection
2. **Job history page** with search and filtering
3. **Priority scoring system** based on device type and repair type
4. **Customer flagging system** for sensitive/awkward customers
5. **Review request toggle** per job
6. **Randomized review request scheduling**

## Database Changes

### Step 1: Run Database Migration

Execute the following SQL files in your Supabase SQL Editor in this order:

```sql
-- 1. Add new fields and priority scoring system
-- File: /repair-app/supabase/add-job-enhancements.sql
```

This migration adds:
- `collected_at` - Timestamp when job was collected
- `closed_at` - Timestamp when job was closed/completed
- `priority_score` - Integer (0-100) for job prioritization
- `customer_flag` - Enum: 'sensitive', 'awkward', 'vip', 'normal'
- `customer_flag_notes` - Text notes about the flag
- `skip_review_request` - Boolean to disable review requests
- `repair_type` - Text field for repair categorization
- `device_type` - Text field for device categorization

### Step 2: Setup Auto-Close Cron Job

```sql
-- 2. Setup cron job for auto-closing collected jobs
-- File: /repair-app/supabase/setup-auto-close-cron.sql
```

This creates a cron job that runs every hour to automatically close jobs that have been collected for 3+ days.

## Priority Scoring System

### How It Works

Jobs are automatically scored 0-100 based on device type and repair type:

**Highest Priority (90-100):**
- Mobile phone screens: 100
- Mobile phone batteries: 95
- Mobile phone charging ports: 90

**High Priority (80-85):**
- Tablet screens: 85
- Tablet batteries: 80

**Medium-High Priority (70-80):**
- Laptop screens: 80
- Laptop batteries: 75
- Laptop keyboards: 70

**Medium Priority (60-70):**
- Other mobile repairs: 70
- Other tablet repairs: 65
- Other laptop repairs: 60

**Lower Priority (35-50):**
- Consoles: 45 (customers expect 1+ day turnaround)
- Motherboard/logic board issues: 35
- Water damage: 35

### Automatic Calculation

Priority scores are automatically calculated when:
- A new job is created
- Device make/model is updated
- Issue description is updated
- Repair type is updated

The calculation uses the `calculate_priority_score()` PostgreSQL function.

## Customer Flag System

### Flag Types

1. **Sensitive** - Handle with care, no review request
2. **Awkward** - Difficult customer, no review request
3. **VIP** - Important customer, normal handling
4. **Normal** - Standard customer

### How to Use

1. Open any job detail page
2. Scroll to "Customer Management" card
3. Click "Update Customer Settings"
4. Select flag type and add notes
5. Toggle "Disable Review Request" if needed

**Note:** Sensitive and awkward flags automatically disable review requests.

## Review Request System

### Existing Functionality (Enhanced)

The review request system was already implemented and has been enhanced with:

1. **Customer flag checking** - Skips sensitive/awkward customers
2. **Per-job toggle** - Can disable for specific jobs
3. **Randomized scheduling** - Prevents all reviews going out at same time

### Scheduling Logic

**If collected before 4:00 PM:**
- Send 1-3 hours later (randomized)

**If collected after 4:00 PM:**
- Send between 10:00 AM - 12:00 PM next day (randomized)

### Review Request Flow

1. Job status changes to `COLLECTED`
2. System checks `skip_review_request` flag
3. System checks `customer_flag` (sensitive/awkward)
4. If both pass, schedule review SMS with random delay
5. Cron job sends SMS at scheduled time
6. SMS includes Google review link and warranty info

## Job History Page

### Features

- **Automatic filtering** - Only shows COMPLETED and CANCELLED jobs
- **Search** - Search by job ref, customer name, phone, device, issue
- **Date filters** - Last 7/30/90 days, last year, or all time
- **Sorted by closure date** - Most recent first
- **Shows key info** - Created, collected, and closed dates

### Access

Navigate to `/app/history` or click the History icon in the main jobs list header.

## Jobs List Changes

### Priority Sorting

The main jobs list now:
1. **Excludes** completed and cancelled jobs (they're in history)
2. **Sorts by priority score** (highest first)
3. **Then sorts by creation date** (newest first)

This ensures urgent repairs (phone screens, batteries) appear at the top.

## TypeScript Types

Updated `lib/types-v3.ts` to include:

```typescript
interface Job {
  // ... existing fields ...
  
  // Priority & Customer Management
  collected_at?: string | null
  closed_at?: string | null
  priority_score?: number
  customer_flag?: 'sensitive' | 'awkward' | 'vip' | 'normal' | null
  customer_flag_notes?: string | null
  skip_review_request?: boolean
  repair_type?: string | null
  device_type?: string | null
  
  // Post-collection SMS tracking
  post_collection_sms_scheduled_at?: string | null
  post_collection_sms_sent_at?: string | null
  post_collection_sms_delivery_status?: string | null
  post_collection_sms_body?: string | null
}
```

## Components Created

### 1. CustomerFlagControls Component
**Location:** `/components/CustomerFlagControls.tsx`

Provides UI for:
- Viewing current customer flag
- Setting/updating customer flag
- Adding flag notes
- Toggling review requests

### 2. Job History Page
**Location:** `/app/app/history/page.tsx`

Full-featured history page with search and filtering.

## API Routes Updated

### `/api/jobs/schedule-collection-sms/route.ts`

Enhanced to:
- Check `skip_review_request` flag
- Check `customer_flag` for sensitive/awkward
- Use randomized scheduling
- Log skipped reviews to job events

## Testing Checklist

### Database
- [ ] Run `add-job-enhancements.sql` migration
- [ ] Run `setup-auto-close-cron.sql` for auto-close
- [ ] Verify cron job is scheduled: `SELECT * FROM cron.job WHERE jobname = 'auto-close-collected-jobs'`
- [ ] Check priority scores are calculated: `SELECT job_ref, priority_score FROM jobs ORDER BY priority_score DESC`

### Priority Scoring
- [ ] Create a mobile phone screen repair - should get priority ~100
- [ ] Create a console repair - should get priority ~45
- [ ] Create a water damage repair - should get priority ~35
- [ ] Verify jobs list shows highest priority first

### Customer Flags
- [ ] Open a job detail page
- [ ] Set customer flag to "sensitive"
- [ ] Verify review request is automatically disabled
- [ ] Add flag notes
- [ ] Check job events log shows the flag change

### Review Requests
- [ ] Mark a job as COLLECTED
- [ ] Check `post_collection_sms_scheduled_at` is set with random delay
- [ ] Set a job's `skip_review_request` to true
- [ ] Mark it as COLLECTED
- [ ] Verify no SMS is scheduled

### Auto-Close
- [ ] Manually set a job's `collected_at` to 4 days ago: 
  ```sql
  UPDATE jobs SET collected_at = NOW() - INTERVAL '4 days' WHERE id = 'YOUR_JOB_ID';
  ```
- [ ] Wait for cron to run (or manually call): `SELECT auto_close_collected_jobs();`
- [ ] Verify job status changed to COMPLETED
- [ ] Verify `closed_at` is set
- [ ] Check job appears in history page

### Job History
- [ ] Navigate to `/app/history`
- [ ] Verify only COMPLETED/CANCELLED jobs appear
- [ ] Test search functionality
- [ ] Test date filters
- [ ] Verify clicking a job opens detail page

## Configuration

### Google Review Link

Set your Google review link in admin settings:

```sql
UPDATE admin_settings 
SET value = 'https://g.page/r/YOUR_ACTUAL_REVIEW_LINK/review'
WHERE key = 'google_review_link';
```

### Warranty Form Link (Optional)

```sql
INSERT INTO admin_settings (key, value, description) VALUES
('warranty_form_link', 'https://your-warranty-form-url', 'Warranty claim form link')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
```

## Troubleshooting

### Priority scores not calculating
- Check if trigger is installed: `\df update_job_priority`
- Manually recalculate: `UPDATE jobs SET priority_score = calculate_priority_score(device_make, device_model, issue, repair_type);`

### Auto-close not working
- Check cron job: `SELECT * FROM cron.job WHERE jobname = 'auto-close-collected-jobs'`
- Check cron history: `SELECT * FROM cron.job_run_details WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'auto-close-collected-jobs') ORDER BY start_time DESC LIMIT 10`
- Manually run: `SELECT auto_close_collected_jobs();`

### Review requests still sending to flagged customers
- Verify `customer_flag` is set correctly
- Check `skip_review_request` boolean
- Review `/api/jobs/schedule-collection-sms` logs

### TypeScript errors
The TypeScript errors you see are due to Supabase's auto-generated types not being regenerated after schema changes. These are safe to ignore or you can regenerate types with:

```bash
npx supabase gen types typescript --project-id YOUR_PROJECT_ID > lib/database.types.ts
```

## Future Enhancements

Potential improvements:
- Manual priority override
- Priority score adjustments based on customer history
- Automated priority boost for overdue jobs
- Customer flag history/audit trail
- Bulk flag operations
- Review request analytics
