# Critical Bug Fixed: Job Creation SMS Template

## Issue Found

In `/app/api/jobs/create-v3/route.ts`, line 159 was using the **deprecated** `READY_TO_BOOK_IN` template for API/online jobs:

```typescript
// OLD CODE (WRONG):
} else {
  templateKey = 'READY_TO_BOOK_IN'  // ❌ DEPRECATED TEMPLATE
}
```

## Problem

- API/Responder jobs were trying to use `READY_TO_BOOK_IN` SMS template
- This template still exists but is deprecated (old status flow)
- The message doesn't match the new flow where customer needs to drop off device
- Job status is set to `QUOTE_APPROVED` but SMS template was `READY_TO_BOOK_IN` (mismatch!)

## Fix Applied

Changed to use `QUOTE_APPROVED` template for API jobs:

```typescript
// NEW CODE (CORRECT):
} else {
  // API/online job (customer has device) - use QUOTE_APPROVED
  templateKey = 'QUOTE_APPROVED'
}
```

## Impact

**Before Fix:**
- API jobs → Status: `QUOTE_APPROVED`, SMS: `READY_TO_BOOK_IN` ❌ (mismatch)
- Wrong message sent to customer
- Confusing flow

**After Fix:**
- API jobs → Status: `QUOTE_APPROVED`, SMS: `QUOTE_APPROVED` ✅ (match)
- Correct message: "Your quote is approved! Please drop off your device"
- Clear instructions with Google Maps link

## Correct Flow Now

### API/Responder Job (No Parts):
1. Job created → Status: `QUOTE_APPROVED`, SMS: `QUOTE_APPROVED` ✅
   - "Please drop off your device at New Forest Device Repairs"
2. Staff marks dropped off → Status: `DROPPED_OFF`, SMS: `DROPPED_OFF` ✅
   - "Thanks for dropping off your device!"

### Manual Job (No Parts):
1. Job created → Status: `RECEIVED`, SMS: `RECEIVED` ✅
   - "We've received your device" (no drop-off mention)

### With Parts (Both):
1. Job created → SMS: `DEPOSIT_REQUIRED` ✅
   - "We need a £20 deposit to order parts"

## Files Changed

- `/app/api/jobs/create-v3/route.ts` - Fixed template selection logic
- Added clear comments explaining each flow

## Next Steps

- Run SQL migrations to add missing notification configs
- Test all 4 flows to ensure correct messages sent
- Consider removing deprecated `READY_TO_BOOK_IN` template entirely
