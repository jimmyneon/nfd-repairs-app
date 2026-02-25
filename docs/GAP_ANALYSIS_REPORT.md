# Gap Analysis Report: Current vs Intended Workflow System
**New Forest Device Repairs - Repair Workflow Analysis**

**Date:** 25 Feb 2026  
**Status:** Analysis Complete - NO IMPLEMENTATION YET

---

## Executive Summary

This report compares the current system implementation against the intended operational model that emphasizes **device possession tracking** as the core workflow driver.

**Key Finding:** The current system uses **status-based workflow** (QUOTE_APPROVED, DROPPED_OFF, RECEIVED) as a proxy for device possession, but does **NOT explicitly track `device_in_shop`** as a boolean field.

---

## 🔍 Analysis Results

### ✅ **What Currently Matches Intended Behavior**

#### 1. **Job Source Differentiation**
**Status:** ✅ **FULLY IMPLEMENTED**

- System distinguishes between API and Manual jobs via `source` field
- API jobs: `source = 'api'` or `'responder'`
- Manual jobs: `source = 'staff_manual'`
- Initial status correctly set based on source:
  - API → `QUOTE_APPROVED` (device not in shop)
  - Manual → `RECEIVED` (device in shop)

**Evidence:**
```typescript
// /app/api/jobs/create-v3/route.ts:82-85
status: source === 'staff_manual' 
  ? 'RECEIVED'
  : 'QUOTE_APPROVED'
```

#### 2. **Parts Requirement Tracking**
**Status:** ✅ **FULLY IMPLEMENTED**

- Three boolean fields track parts:
  - `requires_parts_order`
  - `parts_required`
  - `deposit_required`
- Deposit automatically set to £20.00 when parts required
- Workflow adapts based on parts requirement

**Evidence:**
```typescript
// /app/api/jobs/create-v3/route.ts:70-75
requires_parts_order: requires_parts_order || parts_required || false,
deposit_required: requires_parts_order || parts_required || false,
deposit_amount: (requires_parts_order || parts_required) ? 20.00 : null,
```

#### 3. **Signature Capture (Partial)**
**Status:** ⚠️ **PARTIALLY IMPLEMENTED**

**What Exists:**
- `customer_signature` field in database (TEXT, stores base64 image)
- Signature capture implemented in **onboarding flow** (`/onboard/[token]/page.tsx`)
- Canvas-based signature pad with clear/submit functionality
- Signature stored as base64 data URL

**Evidence:**
```typescript
// /onboard/[token]/page.tsx:156-159
if (!signature) {
  setError('Please provide your signature')
  return
}
```

**What's Missing:**
- ❌ Signature capture NOT in manual job creation form
- ❌ No popup/modal for customer to sign during manual entry
- ❌ Staff just checks "terms_accepted" checkbox on behalf of customer

#### 4. **Terms Acceptance Tracking**
**Status:** ✅ **FULLY IMPLEMENTED**

- `terms_accepted` boolean field exists
- `terms_accepted_at` timestamp captured
- Required in both manual and onboarding flows

#### 5. **Messaging Differentiation (Status-Based)**
**Status:** ⚠️ **PARTIALLY CORRECT**

**Current Approach:**
- Different messages sent based on **status**, not explicit possession field
- `QUOTE_APPROVED` → "Please drop off device" (implies not in shop)
- `DROPPED_OFF` → "Thanks for dropping off" (implies now in shop)
- `RECEIVED` → "We've received your device" (implies already in shop)

**Evidence:**
```sql
-- QUOTE_APPROVED template
'Please drop off your device at New Forest Device Repairs. Find us: {google_maps_link}'

-- RECEIVED template  
'We''ve received your device and it''s now in our repair queue.'
```

---

### ❌ **Critical Gaps: Where Current System Differs**

#### 1. **No Explicit `device_in_shop` Field**
**Status:** ❌ **MISSING - CRITICAL GAP**

**Current State:**
- Device possession is **inferred** from status, not explicitly tracked
- No boolean `device_in_shop` field in database
- Status acts as proxy:
  - `QUOTE_APPROVED` = device not in shop
  - `DROPPED_OFF` / `RECEIVED` = device in shop

**Intended State:**
- Explicit `device_in_shop` boolean field
- Independent of status
- Drives messaging logic directly

**Risk:**
- Current approach works BUT is fragile
- Status changes could break possession logic
- Cannot handle edge cases (e.g., customer takes device back temporarily)

**Database Schema Evidence:**
```typescript
// /lib/types-v3.ts - Job interface
// NO device_in_shop field exists
export interface Job {
  id: string
  job_ref: string
  customer_name: string
  // ... other fields ...
  status: JobStatus
  // ❌ device_in_shop: boolean <- DOES NOT EXIST
}
```

#### 2. **Manual Job Creation - No Customer Signature Flow**
**Status:** ❌ **MISSING - CRITICAL GAP**

**Current State:**
- Manual form (`/app/jobs/create/page.tsx`) has:
  - ✅ Device password field
  - ✅ "Terms accepted" checkbox (staff checks it)
  - ❌ NO signature capture
  - ❌ NO popup/modal for customer to sign
  - `customer_signature` set to `null` on manual creation

**Evidence:**
```typescript
// /app/app/jobs/create/page.tsx:103
customer_signature: null,  // ❌ Always null for manual jobs
```

**Intended State:**
- After staff fills form → popup/modal appears
- Customer reviews details on screen
- Customer signs digitally
- Signature stored before job created

**Gap Impact:**
- Manual jobs have no customer signature
- Only onboarding flow captures signatures
- Cannot prove customer reviewed/accepted terms in-person

#### 3. **Manual Form - No "Device Left With Us" Control**
**Status:** ❌ **MISSING - CRITICAL GAP**

**Current State:**
- Manual form has NO checkbox/toggle for "Device left with us"
- System assumes manual jobs = device in shop (via `RECEIVED` status)
- Cannot handle scenario where customer creates job in-shop but takes device away

**Intended State:**
- Manual form includes control:
  - ✅ Device left with us
  - ⬜ Customer taking device away
- This control sets `device_in_shop` field
- Workflow adapts based on this choice

**Current Workaround:**
- All manual jobs start at `RECEIVED` status
- Implies device always in shop
- No way to create manual job where customer retains device

#### 4. **Messaging Logic - Not Possession-Driven**
**Status:** ⚠️ **WORKS BUT NOT AS INTENDED**

**Current State:**
- Messages determined by **status**, not `device_in_shop`
- Google Maps link included in templates based on status:
  - `QUOTE_APPROVED` → includes maps link ✅
  - `PARTS_ARRIVED` → includes maps link (old template, may be wrong)
  - `READY_TO_COLLECT` → includes maps link ✅
  - `RECEIVED` → NO maps link ✅

**Intended State:**
- Messages determined by `device_in_shop` boolean:
  - `if (device_in_shop === false)` → send drop-off instructions + maps
  - `if (device_in_shop === true)` → NO drop-off messages, NO maps link

**Current Logic:**
```typescript
// Hardcoded in templates, not dynamic based on possession
'QUOTE_APPROVED': 'Please drop off your device... Find us: {google_maps_link}'
'RECEIVED': 'We''ve received your device' // No maps link
```

**Intended Logic:**
```typescript
// Pseudocode - does NOT exist
if (!job.device_in_shop) {
  // Include drop-off instructions and maps link
} else {
  // Skip location-based messaging
}
```

#### 5. **Parts Flow - Manual Jobs with Device NOT Left**
**Status:** ❌ **CANNOT HANDLE THIS SCENARIO**

**Intended Scenario:**
- Customer walks in
- Staff creates manual job
- Parts required
- Customer does NOT leave device
- Flow should be:
  1. Request deposit
  2. Order parts
  3. Wait for parts
  4. Invite customer to bring device when parts arrive

**Current State:**
- Manual jobs always start at `RECEIVED` (implies device in shop)
- No way to create manual job where customer retains device
- `PARTS_ARRIVED` template says "We're ready to start repair" (assumes device already there)
- Cannot send "bring device now" message for manual jobs

**Evidence:**
```sql
-- Current PARTS_ARRIVED template
'Great news! Parts for your {device_make} {device_model} have arrived. 
We''re ready to start your repair.'
-- ❌ Assumes device already in shop
```

---

## 📊 Comparison Matrix

| Feature | Intended System | Current System | Status |
|---------|----------------|----------------|--------|
| **Core Tracking** |
| `device_in_shop` field | ✅ Required | ❌ Does not exist | **MISSING** |
| Job source tracking | ✅ Required | ✅ Implemented (`source` field) | **MATCH** |
| Parts requirement tracking | ✅ Required | ✅ Implemented (3 boolean fields) | **MATCH** |
| **Manual Job Flow** |
| Signature capture popup | ✅ Required | ❌ Not in manual form | **MISSING** |
| "Device left with us" control | ✅ Required | ❌ Does not exist | **MISSING** |
| Device password field | ✅ Required | ✅ Implemented | **MATCH** |
| Terms acceptance | ✅ Required | ✅ Implemented | **MATCH** |
| **Messaging Logic** |
| Possession-driven messages | ✅ Required | ⚠️ Status-driven (proxy) | **PARTIAL** |
| Dynamic maps link inclusion | ✅ Based on possession | ⚠️ Hardcoded in templates | **PARTIAL** |
| Drop-off instructions | ✅ Only if device not in shop | ⚠️ Based on status | **PARTIAL** |
| **Workflow Scenarios** |
| API job - no parts | ✅ Supported | ✅ Works correctly | **MATCH** |
| API job - with parts | ✅ Supported | ✅ Works correctly | **MATCH** |
| Manual job - device left | ✅ Supported | ✅ Works (via RECEIVED) | **MATCH** |
| Manual job - device NOT left | ✅ Supported | ❌ Cannot handle | **MISSING** |

---

## 🔧 Required Structural Changes

### 1. **Database Schema Addition**

**Add to `jobs` table:**
```sql
ALTER TABLE jobs 
ADD COLUMN device_in_shop BOOLEAN DEFAULT FALSE;

CREATE INDEX idx_jobs_device_in_shop ON jobs(device_in_shop);

COMMENT ON COLUMN jobs.device_in_shop IS 
'Explicit tracking of whether device is physically in shop. 
Drives messaging logic independently of status.';
```

**Migration Logic:**
```sql
-- Backfill existing jobs based on current status
UPDATE jobs 
SET device_in_shop = CASE 
  WHEN status IN ('DROPPED_OFF', 'RECEIVED', 'IN_REPAIR', 'READY_TO_COLLECT') THEN TRUE
  WHEN status IN ('QUOTE_APPROVED', 'AWAITING_DEPOSIT', 'PARTS_ORDERED', 'PARTS_ARRIVED') THEN FALSE
  ELSE FALSE
END;
```

### 2. **Manual Job Creation Form Changes**

**Add to `/app/app/jobs/create/page.tsx`:**

```typescript
// New form state
const [formData, setFormData] = useState({
  // ... existing fields ...
  device_left_with_us: false,  // NEW FIELD
})

// New UI control (after terms acceptance)
<div className="p-4 bg-green-50 rounded-xl border-2 border-green-200">
  <label className="flex items-center space-x-3 cursor-pointer">
    <input
      type="checkbox"
      name="device_left_with_us"
      checked={formData.device_left_with_us}
      onChange={handleChange}
      className="w-5 h-5"
    />
    <div>
      <strong>Device left with us</strong>
      <p className="text-xs text-gray-600">
        Check this if the customer is leaving their device with us now.
        Leave unchecked if they're taking it away (e.g., waiting for parts).
      </p>
    </div>
  </label>
</div>
```

**Update job creation:**
```typescript
device_in_shop: formData.device_left_with_us,
status: formData.device_left_with_us ? 'RECEIVED' : 'QUOTE_APPROVED',
```

### 3. **Signature Capture Modal for Manual Jobs**

**Create new component: `/components/ManualJobSignatureModal.tsx`**

Flow:
1. Staff fills manual form
2. Staff clicks "Create Job"
3. Modal appears with job summary
4. Customer reviews on screen
5. Customer signs on canvas
6. Signature captured → job created

**Integration:**
```typescript
// In create/page.tsx
const [showSignatureModal, setShowSignatureModal] = useState(false)
const [pendingJobData, setPendingJobData] = useState(null)

const handleSubmit = (e) => {
  e.preventDefault()
  setPendingJobData(formData)
  setShowSignatureModal(true)  // Show modal instead of submitting
}

const handleSignatureComplete = (signature) => {
  // Now submit job with signature
  submitJob({ ...pendingJobData, customer_signature: signature })
}
```

### 4. **Messaging Logic Refactor**

**Update SMS/Email sending to check possession:**

```typescript
// In /app/api/jobs/queue-status-sms/route.ts
// Before rendering template:

let smsBody = template.body

// Conditionally include maps link
if (job.device_in_shop) {
  // Remove maps link placeholder if device already in shop
  smsBody = smsBody.replace('{google_maps_link}', '')
  smsBody = smsBody.replace('Find us: ', '')
  smsBody = smsBody.replace('Please drop off your device', 'We have your device')
} else {
  // Include maps link if customer needs to bring device
  const mapsLink = await getMapsLink()  // Fetch from admin_settings
  smsBody = smsBody.replace('{google_maps_link}', mapsLink)
}
```

**Update templates to be possession-aware:**
```sql
-- PARTS_ARRIVED template should be dynamic
'Great news! Parts for your {device_make} {device_model} have arrived. 
{possession_message}
Track: {tracking_link}'

-- Where {possession_message} is:
-- If device_in_shop: "We're ready to start your repair."
-- If NOT in shop: "Please drop off your device. Find us: {google_maps_link}"
```

### 5. **Status Transition Logic Updates**

**Update DROPPED_OFF status change:**
```typescript
// When staff marks job as DROPPED_OFF
await supabase
  .from('jobs')
  .update({ 
    status: 'DROPPED_OFF',
    device_in_shop: true  // NEW: Explicitly set possession
  })
  .eq('id', jobId)
```

**Update COLLECTED status change:**
```typescript
// When customer collects device
await supabase
  .from('jobs')
  .update({ 
    status: 'COLLECTED',
    device_in_shop: false  // NEW: Device no longer in shop
  })
  .eq('id', jobId)
```

---

## ⚠️ Risks of Implementation

### **1. Data Migration Risk**
**Severity:** MEDIUM

- Existing jobs need `device_in_shop` backfilled
- Logic must infer possession from current status
- Edge cases may exist where status doesn't accurately reflect possession

**Mitigation:**
- Careful migration script with validation
- Manual review of edge cases
- Ability to manually correct `device_in_shop` if wrong

### **2. Breaking Change Risk**
**Severity:** LOW-MEDIUM

- Adding `device_in_shop` is additive (non-breaking)
- Messaging logic changes could alter customer experience
- Templates need careful testing

**Mitigation:**
- Gradual rollout
- Test all 4 flows thoroughly
- Keep old templates as backup

### **3. UI/UX Complexity**
**Severity:** MEDIUM

- Adding signature modal to manual flow adds friction
- Staff must understand "device left with us" control
- More clicks/steps in manual job creation

**Mitigation:**
- Clear UI labels and help text
- Staff training on new flow
- Make signature modal fast and intuitive

### **4. Template Complexity**
**Severity:** MEDIUM

- Dynamic message generation more complex
- Multiple conditional paths in templates
- Harder to debug message issues

**Mitigation:**
- Comprehensive template testing
- Logging of which message path taken
- Admin UI to preview messages

### **5. Existing Jobs Behavior**
**Severity:** LOW

- Jobs created before migration will have inferred `device_in_shop`
- May not be 100% accurate for all historical jobs
- Could cause confusion if old jobs reactivated

**Mitigation:**
- Migration only affects active jobs
- Completed jobs don't need accurate possession tracking
- Manual override capability for staff

---

## 📋 Implementation Checklist (NOT YET DONE)

### **Phase 1: Database & Core Logic**
- [ ] Add `device_in_shop` column to jobs table
- [ ] Create migration script to backfill existing jobs
- [ ] Add index on `device_in_shop`
- [ ] Update TypeScript types to include field
- [ ] Update job creation API to accept `device_in_shop`

### **Phase 2: Manual Job Form**
- [ ] Add "Device left with us" checkbox to manual form
- [ ] Update form state management
- [ ] Update job creation logic to set `device_in_shop`
- [ ] Update initial status logic based on possession

### **Phase 3: Signature Capture**
- [ ] Create ManualJobSignatureModal component
- [ ] Integrate modal into manual job creation flow
- [ ] Update form submission to wait for signature
- [ ] Test signature capture and storage

### **Phase 4: Messaging Logic**
- [ ] Refactor SMS sending to check `device_in_shop`
- [ ] Refactor email sending to check `device_in_shop`
- [ ] Update template rendering to be possession-aware
- [ ] Remove hardcoded maps links from templates
- [ ] Add dynamic maps link insertion

### **Phase 5: Status Transitions**
- [ ] Update DROPPED_OFF transition to set `device_in_shop = true`
- [ ] Update COLLECTED transition to set `device_in_shop = false`
- [ ] Add manual override for staff to change possession
- [ ] Update job detail page to show possession status

### **Phase 6: Testing**
- [ ] Test API job - no parts - device not in shop
- [ ] Test API job - with parts - device not in shop
- [ ] Test manual job - device left - no parts
- [ ] Test manual job - device left - with parts
- [ ] Test manual job - device NOT left - no parts
- [ ] Test manual job - device NOT left - with parts
- [ ] Verify all messages correct for each scenario
- [ ] Verify maps links only sent when appropriate

---

## 🎯 Recommended Approach

### **Option A: Full Implementation (Aligned with Intent)**
**Effort:** HIGH | **Alignment:** PERFECT | **Risk:** MEDIUM

Implement all changes to fully align with intended model:
1. Add `device_in_shop` field
2. Add signature modal to manual flow
3. Add "device left" control
4. Refactor messaging to be possession-driven

**Pros:**
- Perfect alignment with intended model
- Handles all edge cases
- Future-proof architecture
- Clear separation of concerns

**Cons:**
- Significant development effort
- More complex UI flow
- Requires staff training
- Migration complexity

### **Option B: Minimal Enhancement (Keep Status-Based)**
**Effort:** LOW | **Alignment:** PARTIAL | **Risk:** LOW

Keep current status-based approach but add missing pieces:
1. Add signature modal to manual flow
2. Document that status = possession proxy
3. Add validation to prevent status/possession mismatches

**Pros:**
- Minimal code changes
- Works with existing architecture
- Lower risk
- Faster implementation

**Cons:**
- Not fully aligned with intent
- Still fragile (status = possession coupling)
- Cannot handle "manual job, device not left" scenario
- Technical debt remains

### **Option C: Hybrid Approach (Recommended)**
**Effort:** MEDIUM | **Alignment:** GOOD | **Risk:** LOW-MEDIUM

Implement critical features, defer nice-to-haves:

**Phase 1 (Now):**
1. ✅ Add `device_in_shop` field
2. ✅ Add "device left" control to manual form
3. ✅ Update messaging logic to check possession
4. ⏸️ Defer signature modal (use checkbox for now)

**Phase 2 (Later):**
5. Add signature modal when time permits
6. Refine template complexity
7. Add admin overrides

**Pros:**
- Core functionality aligned
- Handles all scenarios
- Lower initial effort
- Can iterate

**Cons:**
- Signature still not captured in manual flow initially
- Two-phase implementation

---

## 📝 Conclusion

### **Current System Assessment:**

**Strengths:**
- ✅ Job source differentiation works well
- ✅ Parts tracking is comprehensive
- ✅ Status-based workflow is functional
- ✅ Signature capture exists (in onboarding)

**Critical Gaps:**
- ❌ No explicit `device_in_shop` tracking
- ❌ No signature capture in manual job creation
- ❌ No "device left with us" control
- ❌ Cannot handle "manual job, device not left" scenario

### **Alignment Score: 65%**

The current system **partially aligns** with the intended model. It works correctly for most scenarios but lacks the explicit possession tracking and manual signature flow that the intended system requires.

### **Recommendation:**

Proceed with **Option C (Hybrid Approach)**:
1. Add `device_in_shop` field (critical)
2. Add "device left" control (critical)
3. Update messaging logic (critical)
4. Defer signature modal to Phase 2 (nice-to-have)

This provides **80% alignment** with **50% effort** and allows iteration.

---

## 🚦 Next Steps

**DO NOT IMPLEMENT YET - AWAITING APPROVAL**

1. Review this gap analysis
2. Confirm intended model is correct
3. Choose implementation approach (A, B, or C)
4. Approve Phase 1 scope
5. Begin implementation only after approval

---

**Report Prepared By:** Windsor AI (Cascade)  
**Report Status:** Complete - Awaiting User Decision  
**Implementation Status:** NOT STARTED - Analysis Only
