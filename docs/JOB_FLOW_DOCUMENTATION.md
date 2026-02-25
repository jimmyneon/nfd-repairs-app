# Job Creation Flows & Notification Paths

## Overview

There are **4 distinct job creation flows** based on:
1. **Source** (API/Responder vs Manual/In-Shop)
2. **Parts Required** (Yes vs No)

Each flow has a different initial status and notification path.

---

## Flow 1: API/Responder Job - No Parts Required

### **Scenario:**
- Customer submits via website/AI responder
- Customer still has their device at home
- No parts need to be ordered

### **Initial Status:** `QUOTE_APPROVED`

### **Notification Flow:**
1. **QUOTE_APPROVED** → SMS/Email sent
   - Message: "Your quote is approved! Please drop off your device at New Forest Device Repairs"
   - Includes: Google Maps link, tracking link
   - **Customer Action Required:** Bring device to shop

2. **DROPPED_OFF** → SMS/Email sent (when staff marks device received)
   - Message: "Thanks for dropping off your device! We've received it and will begin repair"
   - **Device now in shop**

3. **IN_REPAIR** → SMS/Email sent
   - Message: "Your device is being repaired"

4. **READY_TO_COLLECT** → SMS/Email sent
   - Message: "Your repair is complete! Ready to collect"

5. **COLLECTED** → SMS/Email sent
   - Message: "Thank you for collecting your device!"

6. **COMPLETED** → SMS/Email sent
   - Message: "Repair complete. Thank you!"

### **Status Progression:**
```
QUOTE_APPROVED → DROPPED_OFF → IN_REPAIR → READY_TO_COLLECT → COLLECTED → COMPLETED
```

---

## Flow 2: API/Responder Job - Parts Required

### **Scenario:**
- Customer submits via website/AI responder
- Customer still has their device at home
- Parts need to be ordered (£20 deposit required)

### **Initial Status:** `QUOTE_APPROVED`

### **Notification Flow:**
1. **QUOTE_APPROVED** → SMS/Email sent
   - Message: "Your quote is approved! Please drop off your device"
   - **Customer Action Required:** Bring device to shop

2. **DROPPED_OFF** → SMS/Email sent (when staff marks device received)
   - Message: "Thanks for dropping off your device!"
   - **Device now in shop**

3. **AWAITING_DEPOSIT** → SMS/Email sent (staff changes status)
   - Message: "We need a £20 deposit to order parts"
   - Includes: Deposit payment link
   - **Customer Action Required:** Pay deposit

4. **PARTS_ORDERED** → SMS/Email sent (after deposit received)
   - Message: "Parts have been ordered. We'll notify you when they arrive"

5. **PARTS_ARRIVED** → SMS/Email sent
   - Message: "Parts have arrived! We're ready to start your repair"

6. **IN_REPAIR** → SMS/Email sent
   - Message: "Your device is being repaired"

7. **READY_TO_COLLECT** → SMS/Email sent
   - Message: "Your repair is complete! Ready to collect"

8. **COLLECTED** → SMS/Email sent
   - Message: "Thank you for collecting your device!"

9. **COMPLETED** → SMS/Email sent
   - Message: "Repair complete. Thank you!"

### **Status Progression:**
```
QUOTE_APPROVED → DROPPED_OFF → AWAITING_DEPOSIT → PARTS_ORDERED → PARTS_ARRIVED → IN_REPAIR → READY_TO_COLLECT → COLLECTED → COMPLETED
```

---

## Flow 3: Manual/In-Shop Job - No Parts Required

### **Scenario:**
- Customer walks into shop with device
- Staff creates job manually
- Device already in shop
- No parts needed

### **Initial Status:** `RECEIVED`

### **Notification Flow:**
1. **RECEIVED** → SMS/Email sent
   - Message: "We've received your device and it's in our repair queue"
   - **Device already in shop** (no drop-off needed)

2. **IN_REPAIR** → SMS/Email sent
   - Message: "Your device is being repaired"

3. **READY_TO_COLLECT** → SMS/Email sent
   - Message: "Your repair is complete! Ready to collect"

4. **COLLECTED** → SMS/Email sent
   - Message: "Thank you for collecting your device!"

5. **COMPLETED** → SMS/Email sent
   - Message: "Repair complete. Thank you!"

### **Status Progression:**
```
RECEIVED → IN_REPAIR → READY_TO_COLLECT → COLLECTED → COMPLETED
```

**Key Difference:** Skips QUOTE_APPROVED and DROPPED_OFF because device is already in shop.

---

## Flow 4: Manual/In-Shop Job - Parts Required

### **Scenario:**
- Customer walks into shop with device
- Staff creates job manually
- Device already in shop
- Parts need to be ordered (£20 deposit required)

### **Initial Status:** `RECEIVED`

### **Notification Flow:**
1. **RECEIVED** → SMS/Email sent
   - Message: "We've received your device"
   - **Device already in shop**

2. **AWAITING_DEPOSIT** → SMS/Email sent
   - Message: "We need a £20 deposit to order parts"
   - Includes: Deposit payment link
   - **Customer Action Required:** Pay deposit

3. **PARTS_ORDERED** → SMS/Email sent (after deposit received)
   - Message: "Parts have been ordered. We'll notify you when they arrive"

4. **PARTS_ARRIVED** → SMS/Email sent
   - Message: "Parts have arrived! We're ready to start your repair"

5. **IN_REPAIR** → SMS/Email sent
   - Message: "Your device is being repaired"

6. **READY_TO_COLLECT** → SMS/Email sent
   - Message: "Your repair is complete! Ready to collect"

7. **COLLECTED** → SMS/Email sent
   - Message: "Thank you for collecting your device!"

8. **COMPLETED** → SMS/Email sent
   - Message: "Repair complete. Thank you!"

### **Status Progression:**
```
RECEIVED → AWAITING_DEPOSIT → PARTS_ORDERED → PARTS_ARRIVED → IN_REPAIR → READY_TO_COLLECT → COLLECTED → COMPLETED
```

**Key Difference:** Skips QUOTE_APPROVED and DROPPED_OFF because device is already in shop.

---

## Flow Decision Logic

### **In `/app/api/jobs/create-v3/route.ts`:**

```typescript
// Status - manual entry starts as RECEIVED, API/online starts as QUOTE_APPROVED
status: source === 'staff_manual' 
  ? 'RECEIVED'
  : 'QUOTE_APPROVED'
```

### **Source Values:**
- `'staff_manual'` → Manual job creation (device in shop) → Starts at **RECEIVED**
- `'api'` or `'responder'` → Online submission (customer has device) → Starts at **QUOTE_APPROVED**

---

## Special Statuses

### **DELAYED**
- Can occur at any point during repair
- Sends notification: "Your repair is experiencing a delay"
- Can transition back to IN_REPAIR when resolved

### **CANCELLED**
- Can occur at any point
- Sends notification: "Your repair has been cancelled"
- Terminal status (no further progression)

---

## Notification Templates by Status

| Status | SMS Template | Email Message | When Sent |
|--------|-------------|---------------|-----------|
| QUOTE_APPROVED | ✅ | ✅ | API jobs - customer needs to drop off |
| DROPPED_OFF | ✅ | ✅ | API jobs - device received in shop |
| RECEIVED | ✅ | ✅ | Manual jobs - device already in shop |
| AWAITING_DEPOSIT | ✅ (DEPOSIT_REQUIRED) | ✅ | Parts needed - deposit required |
| PARTS_ORDERED | ✅ | ✅ | After deposit paid |
| PARTS_ARRIVED | ✅ | ✅ | Parts delivered |
| IN_REPAIR | ✅ | ✅ | Repair work started |
| DELAYED | ✅ | ✅ | Unexpected delay |
| READY_TO_COLLECT | ✅ | ✅ | Repair complete |
| COLLECTED | ✅ | ✅ | Customer picked up device |
| COMPLETED | ✅ | ✅ | Job fully closed |
| CANCELLED | ✅ | ✅ | Job cancelled |

---

## Key Differences Summary

### **API/Responder Jobs:**
- Start at `QUOTE_APPROVED`
- Customer has device → needs drop-off instructions
- Includes `DROPPED_OFF` status when device arrives
- Longer flow (more customer touchpoints)

### **Manual/In-Shop Jobs:**
- Start at `RECEIVED`
- Device already in shop → no drop-off needed
- Skips `QUOTE_APPROVED` and `DROPPED_OFF`
- Shorter flow (fewer steps)

### **Parts Required (Both Types):**
- Adds `AWAITING_DEPOSIT` → `PARTS_ORDERED` → `PARTS_ARRIVED` sequence
- £20 deposit required before parts ordered
- Customer must pay deposit to proceed

### **No Parts Required (Both Types):**
- Goes straight from initial status → `IN_REPAIR`
- Faster turnaround
- No deposit needed

---

## Current Implementation Status

### ✅ **Working Correctly:**
- Job creation logic sets correct initial status based on source
- All 4 flows are properly defined
- Notification triggers exist for all statuses

### ⚠️ **Needs Verification:**
- Ensure QUOTE_APPROVED message clearly instructs customer to drop off device
- Ensure DROPPED_OFF message confirms device received
- Ensure RECEIVED message doesn't mention drop-off (device already there)
- Verify parts flow transitions correctly through deposit → order → arrival

### 🔧 **Recently Fixed:**
- Added missing notification_config entries for QUOTE_APPROVED, DROPPED_OFF, COLLECTED
- Added missing SMS templates for COMPLETED and CANCELLED
- Removed deprecated READY_TO_BOOK_IN status

---

## Testing Checklist

- [ ] Create API job without parts → Verify QUOTE_APPROVED message says "drop off device"
- [ ] Create API job with parts → Verify flow includes deposit step
- [ ] Create manual job without parts → Verify starts at RECEIVED (no drop-off mention)
- [ ] Create manual job with parts → Verify deposit flow works
- [ ] Verify all status transitions send correct notifications
- [ ] Verify notification settings UI shows all 12 statuses
- [ ] Verify SMS and email toggles work for each status
