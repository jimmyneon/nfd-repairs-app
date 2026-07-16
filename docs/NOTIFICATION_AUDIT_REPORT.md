# Notification System Audit Report

## Current Job Statuses (12 Total)

Based on `/lib/constants.ts`:

1. **QUOTE_APPROVED** - Quote Approved (API/Responder jobs)
2. **DROPPED_OFF** - Dropped Off (API jobs after customer brings device)
3. **RECEIVED** - Received (Manual jobs when device received)
4. **AWAITING_DEPOSIT** - Awaiting Deposit (Parts need ordering)
5. **PARTS_ORDERED** - Parts Ordered
6. **PARTS_ARRIVED** - Parts Arrived
7. **IN_REPAIR** - In Repair
8. **DELAYED** - Delayed
9. **READY_TO_COLLECT** - Ready to Collect
10. **COLLECTED** - Collected
11. **COMPLETED** - Completed
12. **CANCELLED** - Cancelled

---

## SMS Templates Status

### ✅ Templates That Exist:

1. **QUOTE_APPROVED** - ✅ Created in `add-new-status-sms-templates.sql`
2. **DROPPED_OFF** - ✅ Created in `add-new-status-sms-templates.sql`
3. **RECEIVED** - ✅ Created in `ensure-sms-templates.sql`
4. **DEPOSIT_REQUIRED** - ✅ Created (used for AWAITING_DEPOSIT status)
5. **PARTS_ORDERED** - ✅ Created in `ensure-sms-templates.sql`
6. **PARTS_ARRIVED** - ✅ Created and updated in `add-new-status-sms-templates.sql`
7. **IN_REPAIR** - ✅ Created in `ensure-sms-templates.sql`
8. **DELAYED** - ✅ Created in `add-new-status-sms-templates.sql`
9. **READY_TO_COLLECT** - ✅ Created in `ensure-sms-templates.sql`
10. **COLLECTED** - ✅ Created in `add-new-status-sms-templates.sql`
11. **COMPLETED** - ❌ **MISSING**
12. **CANCELLED** - ❌ **MISSING**

### Special Templates:
- **ONBOARDING_REQUIRED** - For incomplete customer onboarding
- **ONBOARDING_WITH_DEPOSIT** - Onboarding + deposit needed
- **READY_TO_BOOK_IN** - ⚠️ **DEPRECATED** (old status, should be removed)

---

## Email Templates Status

### ✅ Email Status Messages Defined:

In `/app/api/email/send/route.ts`, all statuses have email messages:

1. **QUOTE_APPROVED** - ✅
2. **DROPPED_OFF** - ✅
3. **RECEIVED** - ✅
4. **AWAITING_DEPOSIT** - ✅
5. **PARTS_ORDERED** - ✅
6. **PARTS_ARRIVED** - ✅
7. **IN_REPAIR** - ✅
8. **DELAYED** - ✅
9. **READY_TO_COLLECT** - ✅
10. **COLLECTED** - ✅
11. **COMPLETED** - ✅
12. **CANCELLED** - ✅

### Email Template Generation:

All emails use `generateEmbeddedJobEmail()` from `/lib/email-templates-embedded.ts` which dynamically generates HTML/text emails with:
- Status-specific colors and labels
- Tracking link
- Deposit link (if applicable)
- Professional branding

---

## Notification Config Table Status

### ⚠️ CRITICAL ISSUE: Missing New Statuses

The `notification_config` table (defined in `initialize-notification-system.sql`) only has these statuses:

1. **RECEIVED** - ✅
2. **AWAITING_DEPOSIT** - ✅
3. **PARTS_ORDERED** - ✅
4. **PARTS_ARRIVED** - ✅
5. **READY_TO_BOOK_IN** - ⚠️ **DEPRECATED STATUS** (should be removed)
6. **IN_REPAIR** - ✅
7. **DELAYED** - ✅
8. **READY_TO_COLLECT** - ✅
9. **COMPLETED** - ✅
10. **CANCELLED** - ✅

### ❌ Missing from notification_config:

1. **QUOTE_APPROVED** - Not in config table
2. **DROPPED_OFF** - Not in config table
3. **COLLECTED** - Not in config table

### ⚠️ Should be removed:

- **READY_TO_BOOK_IN** - Deprecated status, replaced by QUOTE_APPROVED/DROPPED_OFF flow

---

## Notification Trigger Logic

### SMS Triggers (`/app/api/jobs/queue-status-sms/route.ts`):

**Hardcoded list of statuses that trigger SMS:**
```typescript
const smsStatuses = [
  'QUOTE_APPROVED', 
  'DROPPED_OFF', 
  'AWAITING_DEPOSIT', 
  'PARTS_ORDERED', 
  'PARTS_ARRIVED', 
  'IN_REPAIR', 
  'READY_TO_COLLECT', 
  'COLLECTED', 
  'COMPLETED', 
  'CANCELLED', 
  'DELAYED'
]
```

**Special handling:**
- `AWAITING_DEPOSIT` → Uses `DEPOSIT_REQUIRED` SMS template
- `COLLECTED` → Also schedules post-collection SMS

### Email Triggers (`/app/api/email/send/route.ts`):

- Checks `notification_config` table for `send_email` and `is_active` flags
- Only sends if both are true
- All status changes can trigger emails if enabled

---

## Issues Found

### 🔴 Critical Issues:

1. **Missing notification_config entries:**
   - QUOTE_APPROVED
   - DROPPED_OFF
   - COLLECTED
   
   **Impact:** These statuses cannot be controlled via the notification settings UI. They will always send notifications (if templates exist) because the config check fails gracefully.

2. **Missing SMS templates:**
   - COMPLETED
   - CANCELLED
   
   **Impact:** These statuses are in the SMS trigger list but have no templates, so no SMS will be sent.

3. **Deprecated status in notification_config:**
   - READY_TO_BOOK_IN still exists in the table
   
   **Impact:** Shows in settings UI but is no longer used in the system.

### ⚠️ Medium Issues:

4. **Constraint mismatch in notification_config:**
   - The `valid_status_key` constraint in `initialize-notification-system.sql` doesn't include new statuses
   - This prevents adding QUOTE_APPROVED, DROPPED_OFF, COLLECTED to the table

---

## Recommendations

### 1. Update notification_config table:

**Add missing statuses:**
- QUOTE_APPROVED
- DROPPED_OFF  
- COLLECTED

**Remove deprecated status:**
- READY_TO_BOOK_IN

**Update constraint to match current statuses**

### 2. Create missing SMS templates:

- COMPLETED
- CANCELLED

### 3. Update constraint in notification_config:

Change from:
```sql
CONSTRAINT valid_status_key CHECK (status_key IN (
    'RECEIVED', 'AWAITING_DEPOSIT', 'PARTS_ORDERED', 'PARTS_ARRIVED',
    'READY_TO_BOOK_IN', 'IN_REPAIR', 'DELAYED', 'READY_TO_COLLECT',
    'COMPLETED', 'CANCELLED'
))
```

To:
```sql
CONSTRAINT valid_status_key CHECK (status_key IN (
    'QUOTE_APPROVED', 'DROPPED_OFF', 'RECEIVED', 'AWAITING_DEPOSIT',
    'PARTS_ORDERED', 'PARTS_ARRIVED', 'IN_REPAIR', 'DELAYED',
    'READY_TO_COLLECT', 'COLLECTED', 'COMPLETED', 'CANCELLED'
))
```

---

## Summary Table

| Status | SMS Template | Email Message | notification_config | Notes |
|--------|-------------|---------------|---------------------|-------|
| QUOTE_APPROVED | ✅ | ✅ | ❌ Missing | Need to add to config |
| DROPPED_OFF | ✅ | ✅ | ❌ Missing | Need to add to config |
| RECEIVED | ✅ | ✅ | ✅ | Working |
| AWAITING_DEPOSIT | ✅ (as DEPOSIT_REQUIRED) | ✅ | ✅ | Working |
| PARTS_ORDERED | ✅ | ✅ | ✅ | Working |
| PARTS_ARRIVED | ✅ | ✅ | ✅ | Working |
| IN_REPAIR | ✅ | ✅ | ✅ | Working |
| DELAYED | ✅ | ✅ | ✅ | Working |
| READY_TO_COLLECT | ✅ | ✅ | ✅ | Working |
| COLLECTED | ✅ | ✅ | ❌ Missing | Need to add to config |
| COMPLETED | ❌ Missing | ✅ | ✅ | Need SMS template |
| CANCELLED | ❌ Missing | ✅ | ✅ | Need SMS template |
| READY_TO_BOOK_IN | ✅ (deprecated) | N/A | ⚠️ Should remove | Old status |

---

## Action Items

1. ✅ Create SQL migration to:
   - Drop old constraint
   - Add QUOTE_APPROVED, DROPPED_OFF, COLLECTED to notification_config
   - Remove READY_TO_BOOK_IN from notification_config
   - Add new constraint with all current statuses

2. ✅ Create missing SMS templates:
   - COMPLETED
   - CANCELLED

3. ✅ Test notification settings UI shows all current statuses

4. ✅ Verify all status changes trigger correct notifications
